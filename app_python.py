#!/usr/bin/env python3

from flask import Flask, render_template, jsonify, request, redirect, url_for, send_file
import json
import os
import re
import subprocess
from datetime import datetime
from dotenv import load_dotenv
import tempfile
import openstack
import requests
from concurrent.futures import ThreadPoolExecutor, as_completed
import time
import threading

# Import our converted Python modules
from modules.utils import check_response, fetch_with_timeout, get_status_class, get_status_icon, get_status_color, format_date
from modules.logs import LogsManager
from modules.openstack import OpenStackManager
from modules.frontend import FrontendManager
from modules.hyperstack import HyperstackManager
from modules.script import get_coordinator, initialize_coordinator

# Load environment variables
load_dotenv()

# Global OpenStack connection - standalone implementation
_openstack_connection = None

# NetBox configuration
NETBOX_URL = os.getenv('NETBOX_URL')
NETBOX_API_KEY = os.getenv('NETBOX_API_KEY')

# Hyperstack API configuration for Runpod launches
HYPERSTACK_API_URL = os.getenv('HYPERSTACK_API_URL', 'https://infrahub-api.nexgencloud.com/v1')
HYPERSTACK_API_KEY = os.getenv('HYPERSTACK_API_KEY')
RUNPOD_API_KEY = os.getenv('RUNPOD_API_KEY')
HYPERSTACK_FIREWALL_CA1_ID = os.getenv('HYPERSTACK_FIREWALL_CA1_ID', '971')  # Firewall ID for CA1 hosts

# Cache for NetBox tenant lookups
_tenant_cache = {}

# Define aggregate pairs - multiple on-demand variants share one spot aggregate
AGGREGATE_PAIRS = {
    'L40': {
        'spot': 'L40-n3-spot',
        'ondemand_variants': [
            {'aggregate': 'L40-n3', 'variant': 'L40-n3'}
        ]
    },
    'RTX-A6000': {
        'spot': 'RTX-A6000-n3-spot', 
        'ondemand_variants': [
            {'aggregate': 'RTX-A6000-n3', 'variant': 'RTX-A6000-n3'}
        ]
    },
    'A100': {
        'spot': 'A100-n3-spot',
        'ondemand_variants': [
            {'aggregate': 'A100-n3', 'variant': 'A100-n3'},
            {'aggregate': 'A100-n3-NVLink', 'variant': 'A100-n3-NVLink'}
        ]
    },
    'H100': {
        'spot': 'H100-n3-spot',
        'ondemand_variants': [
            {'aggregate': 'H100-n3', 'variant': 'H100-n3'},
            {'aggregate': 'H100-n3-NVLink', 'variant': 'H100-n3-NVLink'}
        ]
    }
}

def get_openstack_connection():
    """Get or create OpenStack connection - standalone implementation"""
    global _openstack_connection
    if _openstack_connection is None:
        try:
            _openstack_connection = openstack.connect(
                auth_url=os.getenv('OS_AUTH_URL'),
                username=os.getenv('OS_USERNAME'),
                password=os.getenv('OS_PASSWORD'),
                project_name=os.getenv('OS_PROJECT_NAME'),
                user_domain_name=os.getenv('OS_USER_DOMAIN_NAME', 'Default'),
                project_domain_name=os.getenv('OS_PROJECT_DOMAIN_NAME', 'Default'),
                region_name=os.getenv('OS_REGION_NAME', 'RegionOne'),
                interface=os.getenv('OS_INTERFACE', 'public'),
                identity_api_version=os.getenv('OS_IDENTITY_API_VERSION', '3')
            )
            print("✅ OpenStack SDK connection established")
        except Exception as e:
            print(f"❌ Failed to connect to OpenStack: {e}")
            _openstack_connection = None
    
    return _openstack_connection

def get_netbox_tenants_bulk(hostnames):
    """Get tenant information from NetBox for multiple hostnames at once"""
    global _tenant_cache
    
    # Return default if NetBox is not configured
    if not NETBOX_URL or not NETBOX_API_KEY:
        print("⚠️ NetBox not configured - using default tenant")
        default_result = {'tenant': 'Unknown', 'owner_group': 'Investors', 'nvlinks': False}
        return {hostname: default_result for hostname in hostnames}
    
    # Check cache first and separate cached vs uncached hostnames
    cached_results = {}
    uncached_hostnames = []
    
    for hostname in hostnames:
        if hostname in _tenant_cache:
            cached_results[hostname] = _tenant_cache[hostname]
        else:
            uncached_hostnames.append(hostname)
    
    # If all hostnames are cached, return cached results
    if not uncached_hostnames:
        return cached_results
    
    # Bulk query NetBox for uncached hostnames
    bulk_results = {}
    try:
        url = f"{NETBOX_URL}/api/dcim/devices/"
        headers = {
            'Authorization': f'Token {NETBOX_API_KEY}',
            'Content-Type': 'application/json'
        }
        
        # NetBox API supports filtering by multiple names using name__in
        # But since that might not work, we'll paginate through all results
        params = {'limit': 1000}  # Get up to 1000 devices per page
        
        all_devices = []
        page = 1
        
        while True:
            params['offset'] = (page - 1) * 1000
            response = requests.get(url, headers=headers, params=params, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                all_devices.extend(data['results'])
                
                # If we got less than 1000 results, we're done
                if len(data['results']) < 1000:
                    break
                page += 1
            else:
                print(f"❌ NetBox API error: {response.status_code}")
                break
        
        # Create a mapping of device name to tenant info
        device_map = {}
        for device in all_devices:
            device_name = device.get('name')
            if device_name in uncached_hostnames:
                tenant_data = device.get('tenant', {})
                tenant_name = tenant_data.get('name', 'Unknown') if tenant_data else 'Unknown'
                owner_group = 'Nexgen Cloud' if tenant_name == 'Chris Starkey' else 'Investors'
                
                # Get NVLinks custom field
                custom_fields = device.get('custom_fields', {})
                nvlinks = custom_fields.get('NVLinks', False)
                # Convert None to False for boolean consistency
                if nvlinks is None:
                    nvlinks = False
                
                result = {
                    'tenant': tenant_name,
                    'owner_group': owner_group,
                    'nvlinks': nvlinks
                }
                
                device_map[device_name] = result
                _tenant_cache[device_name] = result
        
        # Fill in results for uncached hostnames
        for hostname in uncached_hostnames:
            if hostname in device_map:
                bulk_results[hostname] = device_map[hostname]
                print(f"✅ NetBox lookup for {hostname}: {device_map[hostname]['tenant']} -> {device_map[hostname]['owner_group']}")
            else:
                # Device not found in NetBox, use default
                default_result = {'tenant': 'Unknown', 'owner_group': 'Investors', 'nvlinks': False}
                bulk_results[hostname] = default_result
                _tenant_cache[hostname] = default_result
                print(f"⚠️ Device {hostname} not found in NetBox")
        
        print(f"📊 Bulk NetBox lookup completed: {len(bulk_results)} new devices processed")
        
    except Exception as e:
        print(f"❌ NetBox bulk lookup failed: {e}")
        # Fall back to default for all uncached hostnames
        default_result = {'tenant': 'Unknown', 'owner_group': 'Investors', 'nvlinks': False}
        for hostname in uncached_hostnames:
            bulk_results[hostname] = default_result
            _tenant_cache[hostname] = default_result
    
    # Merge cached and bulk results
    return {**cached_results, **bulk_results}

def get_netbox_tenant(hostname):
    """Get tenant information from NetBox for a single hostname (wrapper for backward compatibility)"""
    return get_netbox_tenants_bulk([hostname])[hostname]

def extract_gpu_count_from_flavor(flavor_name):
    """Extract GPU count from flavor name like 'n3-RTX-A6000x8' or 'n3-RTX-A6000x1-spot' (matches original app.py)"""
    if not flavor_name or flavor_name == 'N/A':
        return 0
    
    # Pattern to match GPU count from flavor names like n3-RTX-A6000x8, n3-RTX-A6000x1-spot
    import re
    match = re.search(r'x(\d+)', flavor_name)
    if match:
        gpu_count = int(match.group(1))
        print(f"🔍 Extracted {gpu_count} GPUs from flavor: {flavor_name}")
        return gpu_count
    return 0

def get_host_gpu_info(hostname):
    """Calculate GPU usage information for a specific host"""
    try:
        print(f"🔍 Getting GPU info for host: {hostname}")
        
        # Get VMs on this host using OpenStack SDK directly (avoid circular dependency)
        vms = get_host_vms(hostname)
        
        # Calculate GPU usage from VM flavors
        total_used_gpus = 0
        gpu_vms = []
        
        for vm in vms:
            flavor_name = vm.get('Flavor', '')  # Note: get_host_vms() returns 'Flavor' not 'flavor'
            gpu_count = extract_gpu_count_from_flavor(flavor_name)
            
            if gpu_count > 0:
                total_used_gpus += gpu_count
                gpu_vms.append({
                    'name': vm.get('Name', ''),        # Note: get_host_vms() returns 'Name' not 'name'
                    'id': vm.get('ID', ''),
                    'flavor': flavor_name,
                    'gpu_count': gpu_count,
                    'status': vm.get('Status', 'unknown')
                })
        
        # For most compute hosts, assume 8 GPUs total (can be configured)
        total_gpus = 8  # This could be made configurable per host
        available_gpus = max(0, total_gpus - total_used_gpus)
        
        result = {
            'gpu_used': total_used_gpus,
            'gpu_capacity': total_gpus,
            'vm_count': len(vms),
            'gpu_usage_ratio': f"{total_used_gpus}/{total_gpus}"
        }
        
        print(f"✅ GPU info for {hostname}: {total_used_gpus}/{total_gpus} GPUs used")
        return result
        
    except Exception as e:
        print(f"❌ Error getting GPU info for {hostname}: {e}")
        return {
            'gpu_used': 0,
            'gpu_capacity': 8,
            'vm_count': 0,
            'gpu_usage_ratio': "0/8"
        }

def get_bulk_gpu_info(hostnames, max_workers=10):
    """Get GPU information for multiple hosts concurrently"""
    from concurrent.futures import ThreadPoolExecutor, as_completed
    
    print(f"🔍 Getting bulk GPU info for {len(hostnames)} hosts")
    
    results = {}
    
    def get_single_gpu_info(hostname):
        return hostname, get_host_gpu_info(hostname)
    
    try:
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            # Submit all tasks
            future_to_host = {
                executor.submit(get_single_gpu_info, hostname): hostname 
                for hostname in hostnames
            }
            
            # Collect results as they complete
            for future in as_completed(future_to_host):
                hostname = future_to_host[future]
                try:
                    host, gpu_info = future.result()
                    results[host] = gpu_info
                except Exception as e:
                    print(f"❌ Error getting GPU info for {hostname}: {e}")
                    results[hostname] = {
                        'total_gpus': 0,
                        'used_gpus': 0,
                        'available_gpus': 0,
                        'vm_count': 0,
                        'vms': []
                    }
        
        print(f"✅ Bulk GPU info completed for {len(results)} hosts")
        return results
        
    except Exception as e:
        print(f"❌ Bulk GPU info failed: {e}")
        # Return empty results for all hostnames
        return {hostname: {
            'total_gpus': 0,
            'used_gpus': 0,
            'available_gpus': 0,
            'vm_count': 0,
            'vms': []
        } for hostname in hostnames}

def get_bulk_vm_counts(hostnames, max_workers=10):
    """Get VM counts for multiple hosts concurrently - optimized version"""
    from concurrent.futures import ThreadPoolExecutor, as_completed
    
    print(f"🔍 Getting bulk VM counts for {len(hostnames)} hosts")
    
    results = {}
    
    def get_single_vm_count(hostname):
        try:
            # Call the internal function directly to avoid circular dependency
            vm_count = get_host_vm_count(hostname)
            return hostname, vm_count
        except Exception as e:
            print(f"❌ Error getting VM count for {hostname}: {e}")
            return hostname, 0
    
    try:
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            # Submit all tasks
            future_to_host = {
                executor.submit(get_single_vm_count, hostname): hostname 
                for hostname in hostnames
            }
            
            # Collect results as they complete
            for future in as_completed(future_to_host):
                hostname = future_to_host[future]
                try:
                    host, vm_count = future.result()
                    results[host] = vm_count
                except Exception as e:
                    print(f"❌ Error processing VM count for {hostname}: {e}")
                    results[hostname] = 0
        
        print(f"✅ Bulk VM count completed for {len(results)} hosts")
        return results
        
    except Exception as e:
        print(f"❌ Bulk VM count failed: {e}")
        return {hostname: 0 for hostname in hostnames}

def find_aggregate_by_name(conn, aggregate_name):
    """Helper function to find aggregate by name"""
    try:
        aggregates = list(conn.compute.aggregates())
        for aggregate in aggregates:
            if aggregate.name == aggregate_name:
                return aggregate
        return None
    except Exception as e:
        print(f"❌ Error finding aggregate {aggregate_name}: {e}")
        return None

def discover_gpu_aggregates():
    """Dynamically discover GPU aggregates from OpenStack with variant support (matches original app.py logic)"""
    try:
        conn = get_openstack_connection()
        if not conn:
            return {}
        
        aggregates = list(conn.compute.aggregates())
        gpu_aggregates = {}
        
        # EXACT same pattern matching as original app.py - this excludes Contract-* aggregates
        import re
        
        for agg in aggregates:
            # Match patterns like: RTX-A6000-n3, A100-n3-NVLink, RTX-A6000-n3-spot, RTX-A6000-n3-runpod
            # This EXCLUDES Contract-* because they don't match this strict pattern
            match = re.match(r'^([A-Z0-9-]+)-n3(-NVLink)?(-spot|-runpod)?$', agg.name)
            if match:
                gpu_type = match.group(1)
                nvlink_suffix = match.group(2)  # -NVLink or None
                pool_suffix = match.group(3)   # -spot, -runpod, or None
                
                if gpu_type not in gpu_aggregates:
                    gpu_aggregates[gpu_type] = {
                        'ondemand_variants': [],
                        'spot': None,
                        'runpod': None
                    }
                
                if pool_suffix == '-spot':
                    gpu_aggregates[gpu_type]['spot'] = agg.name
                elif pool_suffix == '-runpod':
                    gpu_aggregates[gpu_type]['runpod'] = agg.name
                else:
                    # No pool suffix = on-demand variant
                    variant_name = agg.name
                    if nvlink_suffix:
                        variant_display = f"{gpu_type}-n3-NVLink"
                    else:
                        variant_display = f"{gpu_type}-n3"
                    
                    gpu_aggregates[gpu_type]['ondemand_variants'].append({
                        'aggregate': agg.name,
                        'variant': variant_display
                    })
        
        # Convert to format compatible with existing code
        result = {}
        for gpu_type, data in gpu_aggregates.items():
            if data['ondemand_variants']:
                result[gpu_type] = {
                    'ondemand': data['ondemand_variants'][0]['aggregate'],  # Primary for compatibility
                    'ondemand_variants': data['ondemand_variants'],
                    'spot': data['spot'],
                    'runpod': data['runpod']
                }
        
        print(f"📊 Discovered GPU aggregates: {result}")
        return result
        
    except Exception as e:
        print(f"❌ Error discovering GPU aggregates: {e}")
        return {}

def get_aggregate_hosts(aggregate_name):
    """Get hosts in an aggregate using OpenStack SDK with NetBox integration (matches original app.py logic)"""
    try:
        conn = get_openstack_connection()
        if not conn:
            print(f"❌ No OpenStack connection available")
            return []
        
        aggregate = find_aggregate_by_name(conn, aggregate_name)
        if not aggregate:
            print(f"❌ Aggregate '{aggregate_name}' not found")
            return []
        
        host_names = list(aggregate.hosts)
        if not host_names:
            print(f"⚠️ No hosts found in aggregate {aggregate_name}")
            return []
        
        # Bulk NetBox lookup for all hostnames (like original app.py)
        tenant_info_bulk = get_netbox_tenants_bulk(host_names)
        
        # Bulk VM count lookup for all hostnames
        vm_counts_bulk = get_bulk_vm_counts(host_names)
        
        # Bulk GPU info lookup for all hostnames
        gpu_info_bulk = get_bulk_gpu_info(host_names)
        
        hosts = []
        
        for host_name in host_names:
            try:
                vm_count = vm_counts_bulk.get(host_name, 0)
                tenant_info = tenant_info_bulk.get(host_name, {'tenant': 'Unknown', 'owner_group': 'Investors', 'nvlinks': False})
                gpu_info = gpu_info_bulk.get(host_name, {
                    'gpu_used': 0,
                    'gpu_capacity': 8,
                    'vm_count': vm_count,
                    'gpu_usage_ratio': "0/8"
                })
                
                # Build host data structure matching original app.py format
                host_data = {
                    'name': host_name,
                    'vm_count': vm_count,
                    'has_vms': vm_count > 0,
                    'tenant': tenant_info['tenant'],           # NetBox data
                    'owner_group': tenant_info['owner_group'], # NetBox data  
                    'nvlinks': tenant_info['nvlinks'],         # NetBox data
                    'gpu_used': gpu_info['gpu_used'],
                    'gpu_capacity': gpu_info['gpu_capacity'],
                    'gpu_usage_ratio': gpu_info['gpu_usage_ratio']
                }
                
                hosts.append(host_data)
                
            except Exception as e:
                print(f"⚠️ Error getting info for host {host_name}: {e}")
                # Add host with minimal info
                hosts.append({
                    'name': host_name,
                    'has_vms': False,
                    'vm_count': 0,
                    'gpu_used': 0,
                    'gpu_capacity': 8,
                    'owner_group': 'Investors',
                    'tenant': 'Unknown',
                    'nvlinks': False,
                    'gpu_usage_ratio': '0/8'
                })
        
        # Calculate totals for summary
        gpu_used_total = sum(host.get('gpu_used', 0) for host in hosts)
        gpu_capacity_total = sum(host.get('gpu_capacity', 8) for host in hosts)
        gpu_usage_percentage = int((gpu_used_total/gpu_capacity_total)*100) if gpu_capacity_total > 0 else 0
        
        return hosts  # Return just the hosts list to match how it's used
        
    except Exception as e:
        print(f"❌ Error getting aggregate hosts for {aggregate_name}: {e}")
        return []

app = Flask(__name__)
app.secret_key = os.getenv('SECRET_KEY', 'dev-secret-key')

# Global managers
logs_manager = LogsManager()
frontend_manager = FrontendManager()
openstack_manager = OpenStackManager()
hyperstack_manager = HyperstackManager()

# Initialize the coordinator
coordinator = get_coordinator()
initialize_coordinator()  # This just initializes it, but we need the actual coordinator object

# Global command log storage for compatibility with original API
command_log = []

def log_command(command, result, execution_type='executed'):
    """Log command execution with timestamp and result"""
    global command_log
    
    log_entry = {
        'id': len(command_log) + 1,
        'timestamp': datetime.now().isoformat(),
        'command': command,
        'type': execution_type,
        'success': result.get('success', False),
        'stdout': result.get('stdout', ''),
        'stderr': result.get('stderr', ''),
        'returncode': result.get('returncode', -1)
    }
    
    command_log.append(log_entry)
    
    # Keep only last 100 entries
    if len(command_log) > 100:
        command_log = command_log[-100:]
    
    return log_entry

def run_openstack_command(command, log_execution=True):
    """Execute OpenStack CLI command and return result"""
    if log_execution:
        print(f"\n🔄 EXECUTING: {command}")
    
    try:
        result = subprocess.run(
            command, 
            shell=True, 
            capture_output=True, 
            text=True, 
            timeout=30
        )
        
        command_result = {
            'success': result.returncode == 0,
            'stdout': result.stdout.strip(),
            'stderr': result.stderr.strip(),
            'returncode': result.returncode
        }
        
        if log_execution:
            status = "✅ SUCCESS" if command_result['success'] else "❌ FAILED"
            print(f"{status} (return code: {result.returncode})")
            if command_result['stdout']:
                print(f"📤 STDOUT:\n{command_result['stdout']}")
            if command_result['stderr']:
                print(f"📥 STDERR:\n{command_result['stderr']}")
            print("-" * 60)
            
            log_command(command, command_result, 'executed')
            
        return command_result
        
    except subprocess.TimeoutExpired:
        command_result = {
            'success': False,
            'stdout': '',
            'stderr': 'Command timed out',
            'returncode': -1
        }
        
        if log_execution:
            log_command(command, command_result, 'timeout')
            
        return command_result
        
    except Exception as e:
        command_result = {
            'success': False,
            'stdout': '',
            'stderr': str(e),
            'returncode': -1
        }
        
        if log_execution:
            log_command(command, command_result, 'error')
            
        return command_result

def get_gpu_type_from_aggregate(aggregate_name):
    """Extract GPU type from aggregate name like 'RTX-A6000-n3-runpod' -> 'RTX-A6000'"""
    if not aggregate_name:
        return None
    
    match = re.match(r'^([A-Z0-9-]+)-n3', aggregate_name)
    if match:
        return match.group(1)
    return None

def get_host_vm_count(hostname):
    """Get VM count for a specific host using OpenStack SDK"""
    try:
        conn = get_openstack_connection()
        if not conn:
            return 0
        
        # Method 1: Direct host filtering with all_projects (admin required)
        try:
            servers = list(conn.compute.servers(host=hostname, all_projects=True))
            return len(servers)
        except Exception as e:
            print(f"⚠️ VM count method 1 failed for {hostname}: {e}")
        
        # Method 2: Try without all_projects as fallback
        try:
            servers = list(conn.compute.servers(host=hostname))
            return len(servers)
        except Exception as e:
            print(f"⚠️ VM count method 2 failed for {hostname}: {e}")
            
        return 0
        
    except Exception as e:
        print(f"❌ Error getting VM count for host {hostname}: {e}")
        return 0

def get_host_vms(hostname):
    """Get VMs running on a specific host using OpenStack SDK"""
    try:
        conn = get_openstack_connection()
        if not conn:
            return []
        
        # Use same method as get_host_vm_count that works
        try:
            servers = list(conn.compute.servers(host=hostname, all_projects=True))
            vm_list = []
            for server in servers:
                # Get additional server details
                vm_info = {
                    'Name': server.name,
                    'Status': server.status,
                    'ID': server.id,
                    'Created': getattr(server, 'created', 'N/A'),
                    'Updated': getattr(server, 'updated', 'N/A'),
                    'Flavor': getattr(server, 'flavor', {}).get('original_name', 'N/A') if hasattr(getattr(server, 'flavor', {}), 'get') else 'N/A',
                    'Image': getattr(server, 'image', {}).get('name', 'N/A') if hasattr(getattr(server, 'image', {}), 'get') else 'N/A',
                    'Project': getattr(server, 'project_id', 'N/A'),
                    'User': getattr(server, 'user_id', 'N/A')
                }
                vm_list.append(vm_info)
            
            return vm_list
            
        except Exception as e:
            print(f"❌ Error getting VMs for host {hostname}: {e}")
            return []
        
    except Exception as e:
        print(f"❌ Error getting VMs for host {hostname}: {e}")
        return []

def get_gpu_type_from_hostname_context(hostname):
    """Get GPU type by finding which aggregate the hostname belongs to"""
    try:
        gpu_aggregates = discover_gpu_aggregates()
        
        for gpu_type, config in gpu_aggregates.items():
            # Check runpod aggregate
            if config.get('runpod'):
                runpod_data = get_aggregate_hosts(config['runpod'])
                if runpod_data and any(host['name'] == hostname for host in runpod_data):
                    return gpu_type
                    
            # Check on-demand variants
            if config.get('ondemand_variants'):
                for variant in config['ondemand_variants']:
                    variant_data = get_aggregate_hosts(variant['aggregate'])
                    if variant_data and any(host['name'] == hostname for host in variant_data):
                        return gpu_type
                        
            # Check spot aggregate
            if config.get('spot'):
                spot_data = get_aggregate_hosts(config['spot'])
                if spot_data and any(host['name'] == hostname for host in spot_data):
                    return gpu_type
        
        return None
    except Exception as e:
        print(f"❌ Error getting GPU type for hostname {hostname}: {e}")
        return None

def get_gpu_count_from_hostname(hostname):
    """Determine GPU count from hostname - A4000 hosts have 10, others have 8"""
    if 'A4000' in hostname:
        return 10
    return 8

def build_flavor_name(hostname):
    """Build dynamic flavor name like 'n3-RTX-A6000x8' from hostname"""
    gpu_type = get_gpu_type_from_hostname_context(hostname)
    gpu_count = get_gpu_count_from_hostname(hostname)
    
    if gpu_type:
        return f"n3-{gpu_type}x{gpu_count}"
    
    # Fallback: try to extract from hostname pattern if available
    import re
    match = re.search(r'(RTX-A6000|A100|H100|L40)', hostname)
    if match:
        return f"n3-{match.group(1)}x{gpu_count}"
    
    # Default fallback
    return f"n3-RTX-A6000x{gpu_count}"

def mask_api_key(api_key, prefix=""):
    """Mask API key for display purposes"""
    if not api_key:
        return "***_KEY"
    
    if len(api_key) <= 8:
        return "***_KEY"
    
    return f"{api_key[:4]}***{api_key[-4:]}"

def get_firewall_current_attachments(firewall_id):
    """Get current VM attachments for a firewall to preserve existing VMs"""
    try:
        headers = {
            'api_key': HYPERSTACK_API_KEY,
            'Content-Type': 'application/json'
        }
        
        response = requests.get(
            f"{HYPERSTACK_API_URL}/core/firewalls/{firewall_id}",
            headers=headers,
            timeout=30
        )
        
        if response.status_code == 200:
            firewall_data = response.json()
            
            # Extract VM IDs from attachments
            vm_ids = []
            if 'firewall' in firewall_data and 'attachments' in firewall_data['firewall']:
                for attachment in firewall_data['firewall']['attachments']:
                    if 'vm' in attachment and 'id' in attachment['vm']:
                        vm_ids.append(attachment['vm']['id'])
            elif 'attachments' in firewall_data:
                for attachment in firewall_data['attachments']:
                    if 'vm' in attachment and 'id' in attachment['vm']:
                        vm_ids.append(attachment['vm']['id'])
            
            print(f"📋 Retrieved {len(vm_ids)} existing VM attachments for firewall {firewall_id}")
            return vm_ids
        else:
            print(f"⚠️ Failed to get firewall {firewall_id} details: HTTP {response.status_code}")
            if response.text:
                print(f"   Response: {response.text}")
            return []
    except Exception as e:
        print(f"⚠️ Error getting firewall attachments: {e}")
        return []

def attach_firewall_to_vm(vm_id, vm_name, delay_seconds=180):
    """Attach firewall to VM after specified delay using Hyperstack API (Canada hosts only)"""
    def delayed_firewall_attach():
        try:
            print(f"⏳ Waiting {delay_seconds}s before attaching firewall to VM {vm_name} (ID: {vm_id})...")
            time.sleep(delay_seconds)
            
            # Check if host is in Canada (CA1 prefix) and use CA1 firewall ID
            if not vm_name.startswith('CA1-'):
                print(f"🌍 Skipping firewall attachment for {vm_name} - not a Canada host")
                return
            
            # Check if CA1 firewall ID is configured
            if not HYPERSTACK_FIREWALL_CA1_ID:
                print(f"⚠️ No CA1 firewall ID configured - skipping firewall attachment for VM {vm_name}")
                return
            
            firewall_id = HYPERSTACK_FIREWALL_CA1_ID
            print(f"🔥 Starting firewall attachment for VM {vm_name} (ID: {vm_id}) with firewall {firewall_id}...")
            
            # Get current firewall attachments to preserve existing VMs
            try:
                existing_vm_ids = get_firewall_current_attachments(firewall_id)
                print(f"📋 Found {len(existing_vm_ids)} existing VM attachments for firewall {firewall_id}")
            except Exception as e:
                print(f"⚠️ Failed to get current firewall attachments: {e}")
                print(f"⚠️ Proceeding without preserving existing attachments (this may remove other VMs from firewall)")
                existing_vm_ids = []
            
            # Prepare the API call to attach firewall with all VMs (existing + new)
            headers = {
                'api_key': HYPERSTACK_API_KEY,
                'Content-Type': 'application/json'
            }
            
            # Include existing VMs plus the new one
            all_vm_ids = existing_vm_ids + [int(vm_id)]
            # Remove duplicates while preserving order
            unique_vm_ids = list(dict.fromkeys(all_vm_ids))
            
            payload = {
                "vms": unique_vm_ids
            }
            
            print(f"🔗 Attaching firewall to {len(unique_vm_ids)} VMs: {unique_vm_ids}")
            print(f"   - Existing VMs: {existing_vm_ids}")
            print(f"   - New VM: {vm_id}")
            print(f"   - Total unique VMs: {unique_vm_ids}")
            
            response = requests.post(
                f"{HYPERSTACK_API_URL}/core/firewalls/{firewall_id}/update-attachments",
                headers=headers,
                json=payload,
                timeout=30
            )
            
            # Build command for logging (with masked API key)
            vm_ids_str = ', '.join(map(str, unique_vm_ids))
            masked_command = f"curl -X POST {HYPERSTACK_API_URL}/core/firewalls/{firewall_id}/update-attachments -H 'api_key: {mask_api_key(HYPERSTACK_API_KEY)}' -d '{{\"vms\": [{vm_ids_str}]}}'"
            
            if response.status_code in [200, 201]:
                print(f"✅ Successfully attached firewall to {len(unique_vm_ids)} VMs including new VM {vm_name} (ID: {vm_id})")
                print(f"   🔐 Firewall now protects VMs: {unique_vm_ids}")
                
                # Log the successful command
                log_command(masked_command, {
                    'success': True,
                    'stdout': f'Successfully attached firewall to {len(unique_vm_ids)} VMs including new VM {vm_name} (ID: {vm_id})',
                    'stderr': '',
                    'returncode': 0
                }, 'executed')
                
            else:
                error_msg = f'Failed to attach firewall to VM {vm_name}: HTTP {response.status_code}'
                if response.text:
                    error_msg += f' - {response.text}'
                
                print(f"❌ {error_msg}")
                print(f"   ⚠️ This may have left existing VMs without firewall protection")
                
                # Log the failed command
                log_command(masked_command, {
                    'success': False,
                    'stdout': '',
                    'stderr': error_msg,
                    'returncode': response.status_code
                }, 'error')
                
        except Exception as e:
            error_msg = f"Failed to attach firewall to VM {vm_name}: {str(e)}"
            print(f"❌ {error_msg}")
            
            # Log the failure
            log_command(f"firewall attach to VM {vm_name} (ID: {vm_id})", {
                'success': False,
                'stdout': '',
                'stderr': error_msg,
                'returncode': -1
            }, 'error')
    
    # Start the delayed firewall attachment in a separate thread
    thread = threading.Thread(target=delayed_firewall_attach, daemon=True)
    thread.start()
    if vm_name.startswith('CA1-') and HYPERSTACK_FIREWALL_CA1_ID:
        print(f"🔥 Scheduled firewall attachment for VM {vm_name} (ID: {vm_id}) with firewall {HYPERSTACK_FIREWALL_CA1_ID} in {delay_seconds} seconds")
    elif vm_name.startswith('CA1-'):
        print(f"⚠️ No CA1 firewall ID configured - firewall attachment will be skipped for {vm_name}")
    else:
        print(f"🌍 VM {vm_name} is not in Canada - firewall attachment will be skipped")

def attach_runpod_storage_network(vm_name, delay_seconds=120):
    """Attach RunPod Storage Network to VM after specified delay"""
    def delayed_network_attach():
        try:
            print(f"⏳ Waiting {delay_seconds}s before attaching storage network to VM {vm_name}...")
            time.sleep(delay_seconds)
            
            print(f"🌐 Starting storage network attachment for VM {vm_name}...")
            
            # Use the server add network endpoint
            response = requests.post(
                'http://localhost:6969/api/openstack/server/add-network',
                json={
                    'server_name': vm_name,
                    'network_name': 'RunPod-Storage-Canada-1'
                },
                timeout=30
            )
            
            if response.status_code == 200:
                data = response.json()
                if data.get('success'):
                    print(f"✅ Successfully attached storage network to VM {vm_name}")
                    
                    # Log the successful command
                    log_command(f"attach storage network to VM {vm_name}", {
                        'success': True,
                        'stdout': f'Successfully attached RunPod-Storage-Canada-1 network to VM {vm_name}',
                        'stderr': '',
                        'returncode': 0
                    }, 'executed')
                else:
                    error_msg = data.get('error', 'Unknown error')
                    print(f"❌ Failed to attach storage network to VM {vm_name}: {error_msg}")
                    
                    # Log the failure
                    log_command(f"attach storage network to VM {vm_name}", {
                        'success': False,
                        'stdout': '',
                        'stderr': error_msg,
                        'returncode': -1
                    }, 'error')
            else:
                error_msg = f"HTTP {response.status_code}: {response.text}"
                print(f"❌ Failed to attach storage network to VM {vm_name}: {error_msg}")
                
                # Log the failure
                log_command(f"attach storage network to VM {vm_name}", {
                    'success': False,
                    'stdout': '',
                    'stderr': error_msg,
                    'returncode': response.status_code
                }, 'error')
                
        except Exception as e:
            error_msg = f"Failed to attach storage network to VM {vm_name}: {str(e)}"
            print(f"❌ {error_msg}")
            
            # Log the failure
            log_command(f"attach storage network to VM {vm_name}", {
                'success': False,
                'stdout': '',
                'stderr': error_msg,
                'returncode': -1
            }, 'error')
    
    # Start the delayed network attachment in a separate thread
    thread = threading.Thread(target=delayed_network_attach, daemon=True)
    thread.start()
    print(f"🌐 Scheduled storage network attachment for VM {vm_name} in {delay_seconds} seconds")

# Internal data loading functions - standalone Python implementation
def load_gpu_types_internal():
    """Load GPU types using standalone Python implementation"""
    try:
        gpu_aggregates = discover_gpu_aggregates()
        gpu_types = list(gpu_aggregates.keys())
        
        if gpu_types:
            logs_manager.add_to_debug_log('System', f'Successfully loaded {len(gpu_types)} GPU types from OpenStack: {gpu_types}', 'SUCCESS')
            return gpu_types
        else:
            logs_manager.add_to_debug_log('System', 'No GPU types found in OpenStack - using demo data', 'WARNING')
            return ['A100', 'H100', 'RTX-A6000', 'V100']
            
    except Exception as e:
        logs_manager.add_to_debug_log('System', f'Error loading GPU types: {str(e)} - using demo data', 'WARNING')
        return ['A100', 'H100', 'RTX-A6000', 'V100']

def load_aggregate_data_internal(gpu_type):
    """Load aggregate data using standalone Python implementation"""
    try:
        # Get GPU aggregates discovery data
        gpu_aggregates = discover_gpu_aggregates()
        
        if gpu_type not in gpu_aggregates:
            logs_manager.add_to_debug_log('System', f'GPU type {gpu_type} not found in discovered aggregates', 'WARNING')
            # Return demo data
            return create_demo_data(gpu_type)
            
        config = gpu_aggregates[gpu_type]
        
        # Get the aggregate data
        result = {
            'gpu_type': gpu_type,
            'spot': None,
            'ondemand': None,
            'runpod': None
        }
        
        # Process spot aggregate
        if config.get('spot'):
            try:
                spot_hosts = get_aggregate_hosts(config['spot'])
                # Always create spot structure, even if no hosts
                total_gpu_used = sum(host.get('gpu_used', 0) for host in spot_hosts) if spot_hosts else 0
                total_gpu_capacity = sum(host.get('gpu_capacity', 0) for host in spot_hosts) if spot_hosts else 0
                
                result['spot'] = {
                    'name': config['spot'],
                    'hosts': spot_hosts or [],
                    'gpu_summary': {
                        'gpu_used': total_gpu_used,
                        'gpu_capacity': total_gpu_capacity,
                        'gpu_usage_ratio': f"{total_gpu_used}/{total_gpu_capacity}"
                    }
                }
            except Exception as e:
                logs_manager.add_to_debug_log('System', f'Error loading spot data: {str(e)}', 'ERROR')
        
        # Process ondemand aggregate(s) - handle multiple variants like original app.py
        if config.get('ondemand_variants'):
            try:
                all_ondemand_hosts = []
                
                # Get hosts from all on-demand variants
                for variant in config['ondemand_variants']:
                    variant_hosts = get_aggregate_hosts(variant['aggregate'])
                    if variant_hosts:
                        # Add variant information to each host
                        for host in variant_hosts:
                            host['variant'] = variant['variant']
                        all_ondemand_hosts.extend(variant_hosts)
                
                # Always create ondemand structure, even if no hosts
                total_gpu_used = sum(host.get('gpu_used', 0) for host in all_ondemand_hosts) if all_ondemand_hosts else 0
                total_gpu_capacity = sum(host.get('gpu_capacity', 0) for host in all_ondemand_hosts) if all_ondemand_hosts else 0
                
                result['ondemand'] = {
                    'name': config.get('ondemand', 'N/A'),
                    'hosts': all_ondemand_hosts or [],
                    'variants': config.get('ondemand_variants', []),
                    'gpu_summary': {
                        'gpu_used': total_gpu_used,
                        'gpu_capacity': total_gpu_capacity,
                        'gpu_usage_ratio': f"{total_gpu_used}/{total_gpu_capacity}"
                    }
                }
            except Exception as e:
                logs_manager.add_to_debug_log('System', f'Error loading ondemand data: {str(e)}', 'ERROR')
        
        # Process runpod aggregate
        if config.get('runpod'):
            try:
                runpod_hosts = get_aggregate_hosts(config['runpod'])
                # Always create runpod structure, even if no hosts
                total_gpu_used = sum(host.get('gpu_used', 0) for host in runpod_hosts) if runpod_hosts else 0
                total_gpu_capacity = sum(host.get('gpu_capacity', 0) for host in runpod_hosts) if runpod_hosts else 0
                
                result['runpod'] = {
                    'name': config['runpod'], 
                    'hosts': runpod_hosts or [],
                    'gpu_summary': {
                        'gpu_used': total_gpu_used,
                        'gpu_capacity': total_gpu_capacity,
                        'gpu_usage_ratio': f"{total_gpu_used}/{total_gpu_capacity}"
                    }
                }
            except Exception as e:
                logs_manager.add_to_debug_log('System', f'Error loading runpod data: {str(e)}', 'ERROR')
        
        # If we got real data, calculate overall GPU overview and return it
        if any([result['spot'], result['ondemand'], result['runpod']]):
            # Calculate overall GPU summary across all aggregates
            total_gpu_used = 0
            total_gpu_capacity = 0
            
            for section_name in ['spot', 'ondemand', 'runpod']:
                section = result.get(section_name)
                if section and section.get('gpu_summary'):
                    total_gpu_used += section['gpu_summary'].get('gpu_used', 0)
                    total_gpu_capacity += section['gpu_summary'].get('gpu_capacity', 0)
            
            gpu_usage_percentage = round((total_gpu_used / total_gpu_capacity) * 100) if total_gpu_capacity > 0 else 0
            
            result['gpu_overview'] = {
                'gpu_used': total_gpu_used,
                'gpu_capacity': total_gpu_capacity,
                'gpu_usage_ratio': f"{total_gpu_used}/{total_gpu_capacity} GPUs",
                'gpu_usage_percentage': gpu_usage_percentage
            }
            
            logs_manager.add_to_debug_log('System', f'Successfully loaded real data for {gpu_type} - Total GPU usage: {total_gpu_used}/{total_gpu_capacity} ({gpu_usage_percentage}%)', 'SUCCESS')
            return result
        else:
            # Fall back to demo data
            logs_manager.add_to_debug_log('System', f'No real data found for {gpu_type} - using demo data', 'INFO')
            return create_demo_data(gpu_type)
        
    except Exception as e:
        logs_manager.add_to_debug_log('System', f'Error loading aggregate data for {gpu_type}: {str(e)} - using demo data', 'WARNING')
        return create_demo_data(gpu_type)

def create_demo_data(gpu_type):
    """Create demo data for testing purposes with complete host information"""
    return {
        'gpu_type': gpu_type,
        'runpod': {
            'name': f'{gpu_type}-runpod',
            'hosts': [
                {
                    'name': 'runpod-nx-01', 
                    'has_vms': False, 
                    'vm_count': 0, 
                    'gpu_used': 0, 
                    'gpu_capacity': 8,
                    'gpu_usage_ratio': '0/8',
                    'tenant': 'nexgen-cloud',
                    'owner_group': 'Nexgen Cloud',
                    'nvlinks': True
                },
                {
                    'name': 'runpod-inv-01', 
                    'has_vms': True, 
                    'vm_count': 3, 
                    'gpu_used': 0, 
                    'gpu_capacity': 8,
                    'gpu_usage_ratio': '0/8',
                    'tenant': 'investor-tenant',
                    'owner_group': 'Investors',
                    'nvlinks': False
                }
            ],
            'gpu_summary': {'gpu_used': 0, 'gpu_capacity': 16, 'gpu_usage_ratio': '0/16'}
        },
        'ondemand': {
            'name': f'{gpu_type}-ondemand',
            'hosts': [
                {
                    'name': 'ondemand-nx-01', 
                    'has_vms': True, 
                    'vm_count': 1, 
                    'gpu_used': 2, 
                    'gpu_capacity': 8,
                    'gpu_usage_ratio': '2/8',
                    'tenant': 'nexgen-cloud',
                    'owner_group': 'Nexgen Cloud',
                    'nvlinks': True
                },
                {
                    'name': 'ondemand-inv-01', 
                    'has_vms': False, 
                    'vm_count': 0, 
                    'gpu_used': 0, 
                    'gpu_capacity': 8,
                    'gpu_usage_ratio': '0/8',
                    'tenant': 'investor-tenant',
                    'owner_group': 'Investors',
                    'nvlinks': False
                },
                {
                    'name': 'ondemand-inv-02', 
                    'has_vms': True, 
                    'vm_count': 2, 
                    'gpu_used': 6, 
                    'gpu_capacity': 8,
                    'gpu_usage_ratio': '6/8',
                    'tenant': 'investor-tenant',
                    'owner_group': 'Investors',
                    'nvlinks': True
                }
            ],
            'gpu_summary': {'gpu_used': 8, 'gpu_capacity': 24, 'gpu_usage_ratio': '8/24'}
        },
        'spot': {
            'name': f'{gpu_type}-spot',
            'hosts': [
                {
                    'name': 'spot-nx-01', 
                    'has_vms': False, 
                    'vm_count': 0, 
                    'gpu_used': 0, 
                    'gpu_capacity': 8,
                    'gpu_usage_ratio': '0/8',
                    'tenant': 'nexgen-cloud',
                    'owner_group': 'Nexgen Cloud',
                    'nvlinks': True
                },
                {
                    'name': 'spot-inv-01', 
                    'has_vms': True, 
                    'vm_count': 2, 
                    'gpu_used': 4, 
                    'gpu_capacity': 8,
                    'gpu_usage_ratio': '4/8',
                    'tenant': 'investor-tenant',
                    'owner_group': 'Investors',
                    'nvlinks': False
                }
            ],
            'gpu_summary': {'gpu_used': 4, 'gpu_capacity': 16, 'gpu_usage_ratio': '4/16'}
        },
        'gpu_overview': {
            'gpu_used': 12,  # 0 (runpod) + 8 (ondemand) + 4 (spot)
            'gpu_capacity': 56,  # 16 (runpod) + 24 (ondemand) + 16 (spot)
            'gpu_usage_ratio': '12/56 GPUs',
            'gpu_usage_percentage': 21  # round((12/56)*100)
        }
    }

# Template filters
@app.template_filter('safe')
def safe_filter(text):
    """Mark text as safe for template rendering"""
    from markupsafe import Markup
    return Markup(text)

def render_hosts_html(hosts, host_type):
    """Template function to render hosts HTML"""
    if not hosts:
        return '<p class="text-muted">No hosts available</p>'
    
    html = []
    for host in hosts:
        checked = 'checked' if host.get('selected', False) else ''
        status_class = get_status_class(host.get('status', 'UNKNOWN'))
        
        html.append(f'''
        <div class="form-check mb-2">
            <input class="form-check-input" type="checkbox" name="selected_hosts" 
                   value="{host['name']}" id="host_{host['name']}" {checked}>
            <label class="form-check-label d-flex justify-content-between" for="host_{host['name']}">
                <span>
                    <i class="fas fa-server text-{status_class}"></i>
                    {host['name']}
                </span>
                <span class="text-muted small">
                    {host.get('vm_count', 0)} VMs
                    {f"| {host['gpu_used']}/{host.get('gpu_capacity', 0)} GPUs" if host.get('gpu_used') else ""}
                </span>
            </label>
        </div>
        ''')
    
    return ''.join(html)

def render_pending_operations_html(operations):
    """Template function to render pending operations HTML"""
    if not operations:
        return '<p class="text-muted">No pending operations</p>'
    
    html = []
    for i, op in enumerate(operations):
        op_type = op.get('type', 'unknown')
        icon = 'fas fa-arrows-alt-h' if op_type == 'migration' else 'fas fa-rocket'
        
        html.append(f'''
        <div class="card mb-2">
            <div class="card-body">
                <div class="d-flex justify-content-between align-items-center">
                    <div>
                        <h6 class="mb-1">
                            <i class="{icon}"></i>
                            {op.get('hostname', 'Unknown Host')}
                        </h6>
                        <small class="text-muted">
                            {op.get('source_type', '')} → {op.get('target_type', '')}
                            | {op.get('timestamp', '')}
                        </small>
                    </div>
                    <span class="badge bg-secondary">{op_type.title()}</span>
                </div>
        ''')
        
        if op.get('commands'):
            html.append(f'''
                <div class="mt-2">
                    <small class="text-muted">Commands: {len(op.get('commands', []))}</small>
                </div>
            ''')
        
        html.append('''
            </div>
        </div>
        ''')
    
    return ''.join(html)

# Add template functions to Jinja2 globals
app.jinja_env.globals.update(
    render_hosts_html=render_hosts_html,
    render_pending_operations_html=render_pending_operations_html
)

@app.route('/')
def index():
    """Redirect to dashboard"""
    return redirect(url_for('dashboard'))

@app.route('/dashboard')
def dashboard():
    """Main dashboard route"""
    try:
        # Get GPU type from query parameter
        gpu_type = request.args.get('gpu_type', '')
        
        # Load available GPU types
        available_gpu_types = load_gpu_types_internal()
        cached_gpu_types = list(openstack_manager.gpu_data_cache.keys())
        
        # Debug logging
        logs_manager.add_to_debug_log('Dashboard', f'Loading dashboard with GPU types: {available_gpu_types}', 'INFO')
        
        # Initialize template context
        context = {
            'current_gpu_type': gpu_type,
            'available_gpu_types': available_gpu_types,
            'cached_gpu_types': cached_gpu_types,
            'aggregate_data': None,
            'pending_operations': [op.__dict__ for op in frontend_manager.pending_operations],
            'session_stats': logs_manager.get_debug_stats(),
            'debug_entries': logs_manager._debug_entries,
            'total_gpu_used': 0,
            'total_gpu_capacity': 0,
            'total_gpu_usage_percentage': 0
        }
        
        # Load aggregate data if GPU type is selected
        if gpu_type:
            try:
                aggregate_data = load_aggregate_data_internal(gpu_type)
                if aggregate_data:
                    context['aggregate_data'] = aggregate_data
                    
                    # Calculate total GPU usage
                    total_used = 0
                    total_capacity = 0
                    
                    for section in ['spot', 'ondemand', 'runpod']:
                        if section in aggregate_data and aggregate_data[section]:
                            summary = aggregate_data[section].get('gpu_summary', {})
                            total_used += summary.get('gpu_used', 0)
                            total_capacity += summary.get('gpu_capacity', 0)
                    
                    context['total_gpu_used'] = total_used
                    context['total_gpu_capacity'] = total_capacity
                    context['total_gpu_usage_percentage'] = (
                        (total_used / total_capacity * 100) if total_capacity > 0 else 0
                    )
                    
                    # Generate HTML content using frontend manager
                    try:
                        hosts_html = frontend_manager.render_aggregate_data_html(aggregate_data)
                        context['hosts_html'] = hosts_html
                    except Exception as e:
                        logs_manager.add_to_debug_log('Frontend', f'Error generating hosts HTML: {str(e)}', 'ERROR')
                        context['hosts_html'] = '<div class="alert alert-warning">Error rendering host data</div>'
                    
                    # Log the data load
                    logs_manager.add_to_debug_log(
                        'Dashboard', 
                        f'Loaded aggregate data for {gpu_type}', 
                        'INFO'
                    )
                else:
                    logs_manager.add_to_debug_log(
                        'Dashboard', 
                        f'No aggregate data found for {gpu_type}', 
                        'WARNING'
                    )
            except Exception as e:
                logs_manager.add_to_debug_log(
                    'Dashboard', 
                    f'Error loading aggregate data for {gpu_type}: {str(e)}', 
                    'ERROR'
                )
        
        return render_template('index.html', **context)
        
    except Exception as e:
        logs_manager.add_to_debug_log(
            'Dashboard', 
            f'Error rendering dashboard: {str(e)}', 
            'ERROR'
        )
        return render_template('index.html', 
                             current_gpu_type='',
                             available_gpu_types=[],
                             cached_gpu_types=[],
                             error=str(e))

@app.route('/process_operations', methods=['POST'])
def process_operations():
    """Process host operations (move hosts, launch VMs)"""
    try:
        gpu_type = request.form.get('gpu_type', '')
        action = request.form.get('action', '')
        selected_hosts = request.form.getlist('selected_hosts')
        
        if not selected_hosts:
            logs_manager.add_to_debug_log(
                'Operations', 
                'No hosts selected for operation', 
                'WARNING'
            )
            return redirect(url_for('dashboard', gpu_type=gpu_type))
        
        logs_manager.add_to_debug_log(
            'Operations', 
            f'Processing {action} for {len(selected_hosts)} hosts', 
            'INFO'
        )
        
        # Process the action
        if action == 'move_to_spot':
            coordinator.move_selected_hosts(selected_hosts, 'spot')
        elif action == 'move_to_ondemand':
            coordinator.move_selected_hosts(selected_hosts, 'ondemand')
        elif action == 'launch_runpod':
            for hostname in selected_hosts:
                coordinator.add_runpod_launch_operation(hostname)
        else:
            logs_manager.add_to_debug_log(
                'Operations', 
                f'Unknown action: {action}', 
                'ERROR'
            )
        
        return redirect(url_for('dashboard', gpu_type=gpu_type))
        
    except Exception as e:
        logs_manager.add_to_debug_log(
            'Operations', 
            f'Error processing operations: {str(e)}', 
            'ERROR'
        )
        return redirect(url_for('dashboard', gpu_type=gpu_type))

@app.route('/execute_operations', methods=['POST'])
def execute_operations():
    """Execute all pending operations"""
    try:
        result = coordinator.commit_selected_commands()
        
        if result.get('success'):
            logs_manager.add_to_debug_log(
                'Operations', 
                f'Successfully executed {result.get("executed_count", 0)} operations', 
                'SUCCESS'
            )
        else:
            logs_manager.add_to_debug_log(
                'Operations', 
                f'Failed to execute operations: {result.get("error", "Unknown error")}', 
                'ERROR'
            )
        
        return redirect(url_for('dashboard'))
        
    except Exception as e:
        logs_manager.add_to_debug_log(
            'Operations', 
            f'Error executing operations: {str(e)}', 
            'ERROR'
        )
        return redirect(url_for('dashboard'))

@app.route('/clear_operations', methods=['POST'])
def clear_operations():
    """Clear all pending operations"""
    try:
        coordinator.clear_pending_operations()
        logs_manager.add_to_debug_log(
            'Operations', 
            'Cleared all pending operations', 
            'INFO'
        )
        return redirect(url_for('dashboard'))
        
    except Exception as e:
        logs_manager.add_to_debug_log(
            'Operations', 
            f'Error clearing operations: {str(e)}', 
            'ERROR'
        )
        return redirect(url_for('dashboard'))

@app.route('/reset_session', methods=['POST'])
def reset_session():
    """Reset session statistics"""
    try:
        logs_manager.reset_session_stats()
        logs_manager.clear_debug_log()
        coordinator.clear_pending_operations()
        
        logs_manager.add_to_debug_log(
            'System', 
            'Session reset completed', 
            'INFO'
        )
        return redirect(url_for('dashboard'))
        
    except Exception as e:
        logs_manager.add_to_debug_log(
            'System', 
            f'Error resetting session: {str(e)}', 
            'ERROR'
        )
        return redirect(url_for('dashboard'))

@app.route('/export_debug_log')
def export_debug_log():
    """Export debug log as JSON file"""
    try:
        debug_data = logs_manager.export_debug_log()
        
        # Create temporary file
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            json.dump(debug_data, f, indent=2, default=str)
            temp_path = f.name
        
        filename = f"debug-log-{datetime.now().strftime('%Y-%m-%d')}.json"
        
        logs_manager.add_to_debug_log(
            'Export', 
            f'Exported debug log: {filename}', 
            'INFO'
        )
        
        return send_file(temp_path, as_attachment=True, download_name=filename)
        
    except Exception as e:
        logs_manager.add_to_debug_log(
            'Export', 
            f'Error exporting debug log: {str(e)}', 
            'ERROR'
        )
        return redirect(url_for('dashboard'))

@app.route('/export_analytics')
def export_analytics():
    """Export analytics data as JSON file"""
    try:
        analytics_data = logs_manager.export_analytics()
        
        # Create temporary file
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            json.dump(analytics_data, f, indent=2, default=str)
            temp_path = f.name
        
        filename = f"analytics-{datetime.now().strftime('%Y-%m-%d')}.json"
        
        logs_manager.add_to_debug_log(
            'Export', 
            f'Exported analytics: {filename}', 
            'INFO'
        )
        
        return send_file(temp_path, as_attachment=True, download_name=filename)
        
    except Exception as e:
        logs_manager.add_to_debug_log(
            'Export', 
            f'Error exporting analytics: {str(e)}', 
            'ERROR'
        )
        return redirect(url_for('dashboard'))

# API endpoints for compatibility with existing system
@app.route('/api/gpu-types')
def api_gpu_types():
    """API endpoint for GPU types"""
    try:
        gpu_types = load_gpu_types_internal()
        return jsonify({'gpu_types': gpu_types})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/aggregates/<gpu_type>')
def api_aggregates(gpu_type):
    """API endpoint for aggregate data"""
    try:
        data = load_aggregate_data_internal(gpu_type)
        return jsonify(data)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/debug-log')
def api_debug_log():
    """API endpoint for debug log"""
    try:
        entries = logs_manager.get_debug_entries()
        stats = logs_manager.get_debug_stats()
        return jsonify({
            'entries': [entry.__dict__ for entry in entries],
            'stats': stats.__dict__
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/pending-operations')
def api_pending_operations():
    """API endpoint for pending operations"""
    try:
        operations = coordinator.get_pending_operations()
        return jsonify({'operations': operations})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Host migration API endpoints

@app.route('/api/host-vms/<hostname>')
def get_host_vm_details(hostname):
    """Get detailed VM information for a host (JSON API)"""
    vms = get_host_vms(hostname)
    return jsonify({
        'hostname': hostname,
        'vms': vms,
        'count': len(vms)
    })

@app.route('/host-vms/<hostname>')
def show_host_vm_details(hostname):
    """Show VM details page for a host (HTML)"""
    vms = get_host_vms(hostname)
    return render_template('vm_details.html', hostname=hostname, vms=vms)

@app.route('/api/preview-migration', methods=['POST'])
def preview_migration():
    """Preview migration commands without executing"""
    data = request.json
    host = data.get('host')
    source_aggregate = data.get('source_aggregate')
    target_aggregate = data.get('target_aggregate')
    
    print(f"\n👁️  PREVIEW MIGRATION: {host} from {source_aggregate} to {target_aggregate}")
    
    if not all([host, source_aggregate, target_aggregate]):
        return jsonify({'error': 'Missing required parameters'}), 400
    
    commands = [
        f"openstack aggregate remove host {source_aggregate} {host}",
        f"openstack aggregate add host {target_aggregate} {host}"
    ]
    
    print("📋 COMMANDS TO BE EXECUTED:")
    for i, command in enumerate(commands, 1):
        print(f"   {i}. {command}")
    
    # Log the preview (but don't execute)
    for command in commands:
        log_command(command, {'success': None, 'stdout': '', 'stderr': '', 'returncode': None}, 'preview')
    
    return jsonify({
        'commands': commands,
        'host': host,
        'source': source_aggregate,
        'target': target_aggregate
    })

@app.route('/api/execute-migration', methods=['POST'])
def execute_migration():
    """Execute the migration commands using OpenStack SDK"""
    data = request.json
    host = data.get('host')
    source_aggregate = data.get('source_aggregate')
    target_aggregate = data.get('target_aggregate')
    
    print(f"\n🚀 EXECUTING MIGRATION: {host} from {source_aggregate} to {target_aggregate}")
    
    if not all([host, source_aggregate, target_aggregate]):
        return jsonify({'error': 'Missing required parameters'}), 400
    
    # Check if host has VMs and source is spot aggregate
    if 'spot' in source_aggregate.lower():
        vm_count = get_host_vm_count(host)
        if vm_count > 0:
            return jsonify({
                'error': f'Host {host} has {vm_count} running VMs. Cannot migrate from spot aggregate.',
                'vm_count': vm_count
            }), 400
    
    try:
        conn = get_openstack_connection()
        if not conn:
            return jsonify({'error': 'No OpenStack connection available'}), 500
        
        results = []
        
        # Remove from source aggregate
        remove_command = f"openstack aggregate remove host {source_aggregate} {host}"
        try:
            source_agg = find_aggregate_by_name(conn, source_aggregate)
            if not source_agg:
                return jsonify({'error': f'Source aggregate {source_aggregate} not found'}), 404
            
            conn.compute.remove_host_from_aggregate(source_agg, host)
            
            results.append({
                'command': remove_command,
                'success': True,
                'output': f'Successfully removed {host} from {source_aggregate}'
            })
            
            # Log the successful command
            log_command(remove_command, {
                'success': True,
                'stdout': f'Successfully removed {host} from {source_aggregate}',
                'stderr': '',
                'returncode': 0
            }, 'executed')
            
        except Exception as e:
            error_msg = f'Failed to remove {host} from {source_aggregate}: {str(e)}'
            results.append({
                'command': remove_command,
                'success': False,
                'output': error_msg
            })
            
            # Log the failed command
            log_command(remove_command, {
                'success': False,
                'stdout': '',
                'stderr': error_msg,
                'returncode': 1
            }, 'error')
            
            return jsonify({
                'error': 'Failed to remove host from source aggregate',
                'results': results
            }), 500
        
        # Add to target aggregate
        add_command = f"openstack aggregate add host {target_aggregate} {host}"
        try:
            target_agg = find_aggregate_by_name(conn, target_aggregate)
            if not target_agg:
                return jsonify({'error': f'Target aggregate {target_aggregate} not found'}), 404
            
            conn.compute.add_host_to_aggregate(target_agg, host)
            
            results.append({
                'command': add_command,
                'success': True,
                'output': f'Successfully added {host} to {target_aggregate}'
            })
            
            # Log the successful command
            log_command(add_command, {
                'success': True,
                'stdout': f'Successfully added {host} to {target_aggregate}',
                'stderr': '',
                'returncode': 0
            }, 'executed')
            
        except Exception as e:
            error_msg = f'Failed to add {host} to {target_aggregate}: {str(e)}'
            results.append({
                'command': add_command,
                'success': False,
                'output': error_msg
            })
            
            # Log the failed command
            log_command(add_command, {
                'success': False,
                'stdout': '',
                'stderr': error_msg,
                'returncode': 1
            }, 'error')
            
            return jsonify({
                'error': 'Failed to add host to target aggregate',
                'results': results
            }), 500
        
        return jsonify({
            'success': True,
            'results': results,
            'message': f'Successfully migrated {host} from {source_aggregate} to {target_aggregate}'
        })
        
    except Exception as e:
        error_msg = f'Migration failed: {str(e)}'
        print(f"❌ {error_msg}")
        return jsonify({'error': error_msg}), 500

@app.route('/api/get-target-aggregate', methods=['POST'])
def get_target_aggregate():
    """Determine the correct target aggregate based on source hostname and target type"""
    data = request.json
    hostname = data.get('hostname')
    target_type = data.get('target_type')
    target_variant = data.get('target_variant')
    
    if not hostname or not target_type:
        return jsonify({'error': 'Missing hostname or target_type'}), 400
    
    # Get GPU type from hostname context
    gpu_type = get_gpu_type_from_hostname_context(hostname)
    if not gpu_type:
        return jsonify({'error': f'Could not determine GPU type for hostname {hostname}'}), 404
    
    # Get aggregate configuration for this GPU type
    gpu_aggregates = discover_gpu_aggregates()
    config = gpu_aggregates.get(gpu_type)
    if not config:
        return jsonify({'error': f'No configuration found for GPU type {gpu_type}'}), 404
    
    # Determine target aggregate based on target type
    target_aggregate = None
    if target_type == 'spot' and config.get('spot'):
        target_aggregate = config['spot']
    elif target_type == 'runpod' and config.get('runpod'):
        target_aggregate = config['runpod']
    elif target_type == 'ondemand' and config.get('ondemand_variants'):
        if target_variant:
            # Use specific variant if provided
            variant_info = next((v for v in config['ondemand_variants'] if v['aggregate'] == target_variant), None)
            if variant_info:
                target_aggregate = variant_info['aggregate']
        else:
            # Use first available variant as fallback
            target_aggregate = config['ondemand_variants'][0]['aggregate']
    
    if not target_aggregate:
        return jsonify({'error': f'No target aggregate found for GPU type {gpu_type} and target type {target_type}'}), 404
    
    return jsonify({
        'hostname': hostname,
        'gpu_type': gpu_type,
        'target_type': target_type,
        'target_aggregate': target_aggregate
    })

@app.route('/api/command-log')
def get_command_log():
    """Get the command execution log"""
    return jsonify({
        'commands': command_log,
        'count': len(command_log)
    })

@app.route('/api/clear-log', methods=['POST'])
def clear_command_log():
    """Clear the command execution log"""
    global command_log
    command_log = []
    return jsonify({'message': 'Command log cleared'})

# RunPod/Hyperstack Integration API endpoints

@app.route('/api/preview-runpod-launch', methods=['POST'])
def preview_runpod_launch():
    """Preview runpod VM launch command without executing"""
    data = request.json
    hostname = data.get('hostname')
    
    print(f"\n👁️  PREVIEW RUNPOD LAUNCH: {hostname}")
    
    if not hostname:
        return jsonify({'error': 'Missing hostname parameter'}), 400
    
    if not HYPERSTACK_API_KEY or not RUNPOD_API_KEY:
        return jsonify({'error': 'Hyperstack or Runpod API keys not configured'}), 500
    
    # Build dynamic flavor name
    flavor_name = build_flavor_name(hostname)
    gpu_type = get_gpu_type_from_hostname_context(hostname)
    
    # Build the curl command for preview (with masked API keys)
    masked_hyperstack_key = mask_api_key(HYPERSTACK_API_KEY)
    masked_runpod_key = mask_api_key(RUNPOD_API_KEY)
    
    # Create user_data with masked API key for preview
    user_data_preview = '"Content-Type: multipart/mixed...api_key=' + masked_runpod_key + '...power_state: reboot"'
    
    curl_command = f"""curl -X POST {HYPERSTACK_API_URL}/core/virtual-machines \\
  -H "api_key: {masked_hyperstack_key}" \\
  -H "Content-Type: application/json" \\
  -d '{{
    "name": "{hostname}",
    "environment_name": "CA1-RunPod",
    "image_name": "Ubuntu Server 24.04 LTS R570 CUDA 12.8",
    "volume_name": "",
    "flavor_name": "{flavor_name}",
    "assign_floating_ip": true,
    "security_rules": [{{
      "direction": "ingress",
      "protocol": "tcp",
      "ethertype": "IPv4",
      "port_range_min": 22,
      "port_range_max": 22,
      "remote_ip_prefix": "0.0.0.0/0"
    }}],
    "key_name": "Fleio",
    "user_data": {user_data_preview},
    "labels": [],
    "count": 1
  }}'"""
    
    print("📋 COMMAND TO BE EXECUTED:")
    print(f"   Launch VM '{hostname}' with flavor '{flavor_name}'")
    
    # Log the preview (but don't execute)
    log_command(curl_command, {'success': None, 'stdout': '', 'stderr': '', 'returncode': None}, 'preview')
    
    return jsonify({
        'command': curl_command,
        'hostname': hostname,
        'vm_name': hostname,
        'flavor_name': flavor_name,
        'gpu_type': gpu_type,
        'api_url': HYPERSTACK_API_URL
    })

@app.route('/api/execute-runpod-launch', methods=['POST'])
def execute_runpod_launch():
    """Execute the runpod VM launch using Hyperstack API"""
    data = request.json
    hostname = data.get('hostname')
    
    print(f"\n🚀 EXECUTING RUNPOD LAUNCH: {hostname}")
    
    if not hostname:
        return jsonify({'error': 'Missing hostname parameter'}), 400
    
    if not HYPERSTACK_API_KEY or not RUNPOD_API_KEY:
        return jsonify({'error': 'Hyperstack or Runpod API keys not configured'}), 500
    
    # Build dynamic flavor name
    flavor_name = build_flavor_name(hostname)
    
    # Build the complete user_data with actual API key
    user_data_content = """Content-Type: multipart/mixed; boundary="==BOUNDARY=="
MIME-Version: 1.0

--==BOUNDARY==
Content-Disposition: form-data; name="yaml-script"
Content-Type: text/cloud-config; charset="us-ascii"

#cloud-config
# Upgrade packages
package_update: true
# package_upgrade: true
packages:
  # needed as we are using it to extract the hash ID from an API query
  - jq

write_files:
  - path: /etc/runpod/config.json
    owner: ubuntu:ubuntu
    permissions: '0644'
    content: |
      {
        "publicNetwork": {
          "publicIp": "",
          "ports": [10000, 50000]
        }
      }




runcmd:
  # Remove disk so we can use it later on in the script
  - sudo umount /ephemeral
  - sudo sed -i '/^ephemeral0.*\\/ephemeral/s/^/#/' /etc/fstab
  - sudo sed -i '/^\\/dev\\/vdb.*\\/ephemeral/s/^/#/' /etc/fstab
  - rm -f /etc/cloud/cloud.cfg.d/91_ephemeral.cfg

#cloud-config
  # Download Runpod's script
  - sudo wget https://s.runpod.io/host-amd -O /home/ubuntu/rp

  # Enable execution of the script
  - sudo chmod +x /home/ubuntu/rp

  # Execute the following as a script block to handle variables properly
  - |
      # Get hostname
      HOSTNAME=$(uname -n)

      # Create a machine via API command on Runpod and set its name as it was set in OpenStack
      installCert=$(curl --request POST --header "content-type: application/json" \\
        --url "https://api.runpod.io/graphql?api_key=""" + RUNPOD_API_KEY + """" \\
        --data "{\\"query\\":\\"mutation Mutation{machineAdd(input:{name:\\\\\\"$HOSTNAME\\\\\\"}){\\\\nid\\\\ninstallCert}}\\",\\"variables\\":{}}")

      # Clean up the output of the last line to only include the hash ID
      installCertValue=$(echo $installCert | jq -r '.data.machineAdd.installCert')

      # Install Runpod's script using the hash ID generated by the API
      echo -e "\\nDisk\\n/dev/vdb\\nY" | sudo /home/ubuntu/rp --secret=$installCertValue --hostname=$HOSTNAME --gpu-kind=NVIDIA install

      # Get the public IP and store it
      PUBLIC_IP=$(curl https://ifconfig.me)

      # Change owner of the config.json file for the next part to work
      sudo chown ubuntu:ubuntu /etc/runpod/config.json

      # Update the config.json file with the public IP
      echo "{\\"publicNetwork\\": {\\"publicIp\\": \\"$PUBLIC_IP\\", \\"ports\\": [10000, 50000]}}" > /etc/runpod/config.json

      # Output a summary of the variables set during the script
      echo "The Hostname is $HOSTNAME, the public IP is $PUBLIC_IP, and the cert ID is $installCertValue"

power_state:
  delay: "+2"
  mode: reboot
  message: Rebooting now, cloud-init complete
  timeout: 30


--==BOUNDARY==--
"""
    
    # Build the payload
    payload = {
        "name": hostname,
        "environment_name": "CA1-RunPod",
        "image_name": "Ubuntu Server 24.04 LTS R570 CUDA 12.8",
        "volume_name": "",
        "flavor_name": flavor_name,
        "assign_floating_ip": True,
        "security_rules": [
            {
                "direction": "ingress",
                "protocol": "tcp",
                "ethertype": "IPv4",
                "port_range_min": 22,
                "port_range_max": 22,
                "remote_ip_prefix": "0.0.0.0/0"
            }
        ],
        "key_name": "Fleio",
        "user_data": user_data_content,
        "labels": [],
        "count": 1
    }
    
    try:
        # Make the API call to Hyperstack
        headers = {
            'api_key': HYPERSTACK_API_KEY,
            'Content-Type': 'application/json'
        }
        
        response = requests.post(
            f"{HYPERSTACK_API_URL}/core/virtual-machines",
            headers=headers,
            json=payload,
            timeout=30
        )
        
        # Build command for logging (with masked API key)
        masked_command = f"curl -X POST {HYPERSTACK_API_URL}/core/virtual-machines -H 'api_key: {mask_api_key(HYPERSTACK_API_KEY)}' -d '{{\"name\": \"{hostname}\", \"flavor_name\": \"{flavor_name}\", ...}}'"
        
        if response.status_code in [200, 201]:
            result_data = response.json()
            
            # Extract VM ID from response
            vm_id = None
            if result_data.get('instances') and len(result_data['instances']) > 0:
                vm_id = result_data['instances'][0].get('id')
                print(f"🆔 Extracted VM ID: {vm_id} for VM {hostname}")
            
            # Log the successful command
            log_command(masked_command, {
                'success': True,
                'stdout': f'Successfully launched VM {hostname} with flavor {flavor_name} (ID: {vm_id})',
                'stderr': '',
                'returncode': 0
            }, 'executed')
            
            # Schedule firewall attachment after 180 seconds (Hyperstack API) - Canada hosts only  
            firewall_scheduled = False
            if vm_id and hostname.startswith('CA1-') and HYPERSTACK_FIREWALL_CA1_ID:
                attach_firewall_to_vm(vm_id, hostname, delay_seconds=180)
                firewall_scheduled = True
            elif vm_id and hostname.startswith('CA1-'):
                print(f"⚠️ No CA1 firewall ID configured - firewall attachment will be skipped for {hostname}")
            elif vm_id:
                print(f"🌍 VM {hostname} is not in Canada - firewall attachment will be skipped")
            else:
                print(f"⚠️ No VM ID found in response - skipping firewall attachment for {hostname}")
            
            # Schedule storage network attachment after 120 seconds (OpenStack operation)
            attach_runpod_storage_network(hostname, delay_seconds=120)
            
            return jsonify({
                'success': True,
                'message': f'Successfully launched VM {hostname} on Hyperstack',
                'vm_name': hostname,
                'vm_id': vm_id,
                'flavor_name': flavor_name,
                'response': result_data,
                'storage_network_scheduled': False,  # Now handled by frontend commands
                'firewall_scheduled': firewall_scheduled
            })
        else:
            error_msg = f'Failed to launch VM {hostname}: HTTP {response.status_code}'
            if response.text:
                error_msg += f' - {response.text}'
            
            # Log the failed command
            log_command(masked_command, {
                'success': False,
                'stdout': '',
                'stderr': error_msg,
                'returncode': response.status_code
            }, 'error')
            
            return jsonify({'error': error_msg}), response.status_code
            
    except requests.exceptions.Timeout:
        error_msg = f'Timeout launching VM {hostname} - request took longer than 30 seconds'
        log_command(masked_command, {
            'success': False,
            'stdout': '',
            'stderr': error_msg,
            'returncode': -1
        }, 'timeout')
        return jsonify({'error': error_msg}), 408
        
    except Exception as e:
        error_msg = f'Launch failed for VM {hostname}: {str(e)}'
        print(f"❌ {error_msg}")
        
        # Log the failed command
        log_command(masked_command, {
            'success': False,
            'stdout': '',
            'stderr': error_msg,
            'returncode': -1
        }, 'error')
        
        return jsonify({'error': error_msg}), 500

@app.route('/api/hyperstack/firewall/get-attachments', methods=['POST'])
def hyperstack_firewall_get_attachments():
    """Get current VM attachments for a firewall"""
    try:
        data = request.get_json()
        firewall_id = data.get('firewall_id', HYPERSTACK_FIREWALL_CA1_ID)
        
        if not firewall_id:
            return jsonify({'success': False, 'error': 'No firewall ID configured'})
        
        print(f"🔍 Getting firewall attachments for firewall ID: {firewall_id}")
        
        # Get current attachments using existing function
        existing_vm_ids = get_firewall_current_attachments(firewall_id)
        
        # Log the command
        log_command(f'curl -X GET https://infrahub-api.nexgencloud.com/v1/core/firewalls/{firewall_id}', {
            'success': True,
            'stdout': f'Retrieved {len(existing_vm_ids)} VM attachments: {", ".join(map(str, existing_vm_ids))}',
            'stderr': '',
            'returncode': 0
        }, 'executed')
        
        return jsonify({
            'success': True,
            'firewall_id': firewall_id,
            'vm_ids': existing_vm_ids,
            'count': len(existing_vm_ids)
        })
        
    except Exception as e:
        print(f"❌ Error getting firewall attachments: {e}")
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/hyperstack/firewall/update-attachments', methods=['POST'])
def hyperstack_firewall_update_attachments():
    """Update firewall with new VM attachments"""
    try:
        data = request.get_json()
        firewall_id = data.get('firewall_id', HYPERSTACK_FIREWALL_CA1_ID)
        new_vm_id = data.get('vm_id')
        
        if not firewall_id:
            return jsonify({'success': False, 'error': 'No firewall ID configured'})
        
        if not new_vm_id:
            return jsonify({'success': False, 'error': 'VM ID is required'})
        
        print(f"🔥 Adding VM ID {new_vm_id} to firewall {firewall_id}")
        
        # Get current attachments
        existing_vm_ids = get_firewall_current_attachments(firewall_id)
        print(f"📋 Current VMs on firewall: {existing_vm_ids}")
        
        # Add new VM ID to the list
        if new_vm_id not in existing_vm_ids:
            updated_vm_ids = existing_vm_ids + [new_vm_id]
            print(f"➕ Adding VM ID {new_vm_id} to firewall attachments")
        else:
            updated_vm_ids = existing_vm_ids
            print(f"ℹ️ VM ID {new_vm_id} already attached to firewall")
        
        # Update firewall with all VMs (existing + new)
        headers = {
            'api_key': HYPERSTACK_API_KEY,
            'Content-Type': 'application/json'
        }
        
        payload = {
            'vms': updated_vm_ids
        }
        
        response = requests.post(
            f'{HYPERSTACK_API_URL}/core/firewalls/{firewall_id}/update-attachments',
            headers=headers,
            json=payload,
            timeout=30
        )
        
        if response.status_code == 200:
            print(f"✅ Successfully updated firewall {firewall_id} with VM ID {new_vm_id}")
            
            # Log the command
            log_command(f'curl -X POST https://infrahub-api.nexgencloud.com/v1/core/firewalls/{firewall_id}/update-attachments', {
                'success': True,
                'stdout': f'Successfully updated firewall {firewall_id} with {len(updated_vm_ids)} VMs: {", ".join(map(str, updated_vm_ids))}',
                'stderr': '',
                'returncode': 0
            }, 'executed')
            
            return jsonify({
                'success': True,
                'firewall_id': firewall_id,
                'vm_id': new_vm_id,
                'total_vms': len(updated_vm_ids),
                'vm_list': updated_vm_ids
            })
        else:
            error_msg = f'Failed to update firewall: HTTP {response.status_code}'
            if response.text:
                error_msg += f' - {response.text}'
            print(f"❌ {error_msg}")
            return jsonify({'success': False, 'error': error_msg})
        
    except Exception as e:
        print(f"❌ Error updating firewall attachments: {e}")
        return jsonify({'success': False, 'error': str(e)})

# OpenStack Network Management API endpoints

@app.route('/api/openstack/network/show', methods=['POST'])
def openstack_network_show():
    """Find network by name using OpenStack SDK"""
    try:
        data = request.get_json()
        network_name = data.get('network_name')
        
        if not network_name:
            return jsonify({'success': False, 'error': 'Network name is required'})
        
        print(f"🌐 Looking up network: {network_name}")
        
        conn = get_openstack_connection()
        if not conn:
            return jsonify({'success': False, 'error': 'OpenStack connection failed'})
        
        # Find the network
        network = conn.network.find_network(network_name)
        if not network:
            return jsonify({'success': False, 'error': f'Network {network_name} not found'})
        
        print(f"✅ Found network {network_name} with ID: {network.id}")
        return jsonify({'success': True, 'network_id': network.id})
        
    except Exception as e:
        print(f"❌ Error finding network: {e}")
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/openstack/port/create', methods=['POST'])
def openstack_port_create():
    """Create port on network using OpenStack SDK"""
    try:
        data = request.get_json()
        network_name = data.get('network_name')
        port_name = data.get('port_name')
        
        if not network_name or not port_name:
            return jsonify({'success': False, 'error': 'Network name and port name are required'})
        
        print(f"🌐 Creating port {port_name} on network {network_name}")
        
        conn = get_openstack_connection()
        if not conn:
            return jsonify({'success': False, 'error': 'OpenStack connection failed'})
        
        # Find the network
        network = conn.network.find_network(network_name)
        if not network:
            return jsonify({'success': False, 'error': f'Network {network_name} not found'})
        
        # Create the port
        port = conn.network.create_port(
            network_id=network.id,
            name=port_name
        )
        
        print(f"✅ Created port {port_name} with ID: {port.id}")
        return jsonify({'success': True, 'port_id': port.id})
        
    except Exception as e:
        print(f"❌ Error creating port: {e}")
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/openstack/server/add-network', methods=['POST'])
def openstack_server_add_network():
    """Attach network to server using OpenStack SDK (server add network approach)"""
    try:
        data = request.get_json()
        server_name = data.get('server_name')
        network_name = data.get('network_name')
        
        if not server_name or not network_name:
            return jsonify({'success': False, 'error': 'Server name and network name are required'})
        
        print(f"🌐 Attaching network {network_name} to server {server_name}")
        
        conn = get_openstack_connection()
        if not conn:
            return jsonify({'success': False, 'error': 'OpenStack connection failed'})
        
        # First get server list with all projects to find UUID - matching your example command
        # openstack server list --all-projects --name {server_name}
        servers = list(conn.compute.servers(all_projects=True, name=server_name))
        
        if not servers:
            return jsonify({'success': False, 'error': f'Server {server_name} not found'})
        
        if len(servers) > 1:
            print(f"⚠️ Multiple servers found with name {server_name}, using first one")
        
        server = servers[0]
        server_uuid = server.id
        print(f"📋 Found server {server_name} with UUID: {server_uuid}")
        
        # Find the network
        network = conn.network.find_network(network_name)
        if not network:
            return jsonify({'success': False, 'error': f'Network {network_name} not found'})
        
        print(f"📋 Found network {network_name} with UUID: {network.id}")
        
        # Attach the network to the server using server UUID with retry logic
        # This is equivalent to: openstack server add network {server_uuid} {network_name}
        max_retries = 3
        retry_delay = 10  # seconds
        retry_log = []
        
        for attempt in range(max_retries):
            try:
                conn.compute.create_server_interface(server_uuid, net_id=network.id)
                success_msg = f"✅ Attached network {network_name} to server {server_name} (UUID: {server_uuid})"
                if attempt > 0:
                    success_msg += f" (succeeded on attempt {attempt + 1})"
                print(success_msg)
                break
            except Exception as attach_error:
                if "vm_state building" in str(attach_error) and attempt < max_retries - 1:
                    retry_msg = f"⏳ VM {server_name} still building, retrying in {retry_delay}s (attempt {attempt + 1}/{max_retries})"
                    print(retry_msg)
                    retry_log.append(retry_msg)
                    time.sleep(retry_delay)
                    continue
                else:
                    # Either not a building state error, or we've exhausted retries
                    error_details = f"Failed after {attempt + 1} attempts: {str(attach_error)}"
                    if retry_log:
                        error_details = "\n".join(retry_log) + f"\nFinal error: {str(attach_error)}"
                    
                    # Log the failed command with detailed retry information
                    log_command(f'openstack server add network {server_uuid} "{network_name}"', {
                        'success': False,
                        'stdout': '',
                        'stderr': error_details,
                        'returncode': 1
                    }, 'executed')
                    
                    raise attach_error
        
        # Log the successful command with retry details if applicable
        stdout_msg = f'Network {network_name} successfully attached to server {server_name} (UUID: {server_uuid})'
        if retry_log:
            stdout_msg = "\n".join(retry_log) + f"\n{stdout_msg}"
            
        log_command(f'openstack server add network {server_uuid} "{network_name}"', {
            'success': True,
            'stdout': stdout_msg,
            'stderr': '',
            'returncode': 0
        }, 'executed')
        
        return jsonify({'success': True, 'message': f'Network {network_name} attached to server {server_name}'})
        
    except Exception as e:
        error_msg = f"❌ Error attaching network: {e}"
        print(error_msg)
        
        # Log the failed command (if not already logged above)
        if 'server_uuid' in locals():
            log_command(f'openstack server add network {server_uuid} "{network_name}"', {
                'success': False,
                'stdout': '',
                'stderr': error_msg,
                'returncode': 1
            }, 'executed')
        
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/openstack/server/get-uuid', methods=['POST'])
def openstack_server_get_uuid():
    """Get server UUID by name using OpenStack SDK"""
    try:
        data = request.get_json()
        server_name = data.get('server_name')
        
        if not server_name:
            return jsonify({'success': False, 'error': 'Server name is required'})
        
        print(f"🔍 Looking up UUID for server: {server_name}")
        
        conn = get_openstack_connection()
        if not conn:
            return jsonify({'success': False, 'error': 'OpenStack connection failed'})
        
        # Get server list with all projects to find UUID - matching openstack server list --all-projects --name
        servers = list(conn.compute.servers(all_projects=True, name=server_name))
        
        if not servers:
            return jsonify({'success': False, 'error': f'Server {server_name} not found'})
        
        if len(servers) > 1:
            print(f"⚠️ Multiple servers found with name {server_name}, using first one")
        
        server = servers[0]
        server_uuid = server.id
        print(f"✅ Found server {server_name} with UUID: {server_uuid}")
        
        # Log the command
        log_command(f'openstack server list --all-projects --name "{server_name}" -c ID -f value', {
            'success': True,
            'stdout': f'Server UUID: {server_uuid}',
            'stderr': '',
            'returncode': 0
        }, 'executed')
        
        return jsonify({
            'success': True, 
            'server_uuid': server_uuid,
            'server_name': server_name,
            'status': server.status
        })
        
    except Exception as e:
        print(f"❌ Error getting server UUID: {e}")
        return jsonify({'success': False, 'error': str(e)})

if __name__ == '__main__':
    # Initialize logging
    logs_manager.add_to_debug_log(
        'System', 
        'OpenStack Spot Manager (Python Edition) starting up', 
        'INFO'
    )
    
    # Run the Flask app
    app.run(
        host='0.0.0.0', 
        port=int(os.getenv('FLASK_PORT', 6969)), 
        debug=os.getenv('FLASK_DEBUG', 'False').lower() == 'true'
    )