#!/usr/bin/env python3

from flask import Flask, render_template, jsonify, request
import subprocess
import json
import re
from datetime import datetime
import openstack
from dotenv import load_dotenv
import os
import requests
from concurrent.futures import ThreadPoolExecutor, as_completed
import time

# Load environment variables
load_dotenv()

app = Flask(__name__)

# Global command log storage
command_log = []

# OpenStack connection - initialized lazily
_openstack_connection = None

# NetBox configuration
NETBOX_URL = os.getenv('NETBOX_URL')
NETBOX_API_KEY = os.getenv('NETBOX_API_KEY')

# Hyperstack API configuration for Runpod launches
HYPERSTACK_API_URL = os.getenv('HYPERSTACK_API_URL', 'https://infrahub-api.nexgencloud.com/v1')
HYPERSTACK_API_KEY = os.getenv('HYPERSTACK_API_KEY')
RUNPOD_API_KEY = os.getenv('RUNPOD_API_KEY')

# Cache for NetBox tenant lookups to avoid repeated API calls
_tenant_cache = {}

def get_openstack_connection():
    """Get or create OpenStack connection"""
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

def find_aggregate_by_name(conn, aggregate_name):
    """Helper function to find aggregate by name"""
    try:
        aggregates = list(conn.compute.aggregates())
        for agg in aggregates:
            if agg.name == aggregate_name:
                return agg
        return None
    except Exception as e:
        print(f"❌ Error finding aggregate {aggregate_name}: {e}")
        return None

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
    """Extract GPU count from flavor name like 'n3-RTX-A6000x8' or 'n3-RTX-A6000x1-spot'"""
    if not flavor_name or flavor_name == 'N/A':
        return 0
    
    # Pattern to match GPU count from flavor names like n3-RTX-A6000x8, n3-RTX-A6000x1-spot
    import re
    match = re.search(r'x(\d+)', flavor_name)
    if match:
        return int(match.group(1))
    return 0

def get_host_gpu_info(hostname):
    """Get GPU usage information for a host based on VM flavors"""
    try:
        # Get all VMs on this host
        vms = get_host_vms(hostname)
        
        # Calculate total GPU usage from all VMs
        total_gpu_used = 0
        for vm in vms:
            flavor_name = vm.get('Flavor', 'N/A')
            gpu_count = extract_gpu_count_from_flavor(flavor_name)
            total_gpu_used += gpu_count
        
        # Determine total GPU capacity based on host type
        # Most hosts have 8 GPUs, RTX A4000 hosts have 10
        host_gpu_capacity = 10 if 'A4000' in hostname else 8
        
        return {
            'gpu_used': total_gpu_used,
            'gpu_capacity': host_gpu_capacity,
            'vm_count': len(vms),
            'gpu_usage_ratio': f"{total_gpu_used}/{host_gpu_capacity}"
        }
        
    except Exception as e:
        print(f"❌ Error getting GPU info for host {hostname}: {e}")
        return {
            'gpu_used': 0,
            'gpu_capacity': 8,  # Default to 8 GPUs
            'vm_count': 0,
            'gpu_usage_ratio': "0/8"
        }

def get_host_gpu_info_fast(hostname, vm_count):
    """Fast GPU info calculation using VM count heuristic (no additional API calls)"""
    try:
        # Determine total GPU capacity based on host type
        host_gpu_capacity = 10 if 'A4000' in hostname else 8
        
        # Estimate GPU usage: assume each VM uses all available GPUs on the host
        # This is a reasonable approximation for most GPU workloads
        estimated_gpu_used = min(vm_count * host_gpu_capacity, host_gpu_capacity) if vm_count > 0 else 0
        
        return {
            'gpu_used': estimated_gpu_used,
            'gpu_capacity': host_gpu_capacity,
            'vm_count': vm_count,
            'gpu_usage_ratio': f"{estimated_gpu_used}/{host_gpu_capacity}"
        }
        
    except Exception as e:
        print(f"❌ Error calculating fast GPU info for host {hostname}: {e}")
        return {
            'gpu_used': 0,
            'gpu_capacity': 8,  # Default to 8 GPUs
            'vm_count': vm_count,
            'gpu_usage_ratio': "0/8"
        }

def discover_gpu_aggregates():
    """Dynamically discover GPU aggregates from OpenStack with variant support"""
    try:
        conn = get_openstack_connection()
        if not conn:
            return {}
        
        aggregates = list(conn.compute.aggregates())
        gpu_aggregates = {}
        
        # Pattern to match GPU aggregates: GPU-TYPE-n3[-suffix]
        import re
        
        for agg in aggregates:
            # Match patterns like: RTX-A6000-n3, A100-n3-NVLink, RTX-A6000-n3-spot, RTX-A6000-n3-runpod
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
        print(f"❌ Error discovering aggregates: {e}")
        return {}

def get_gpu_type_from_aggregate(aggregate_name):
    """Extract GPU type from aggregate name like 'RTX-A6000-n3-runpod' -> 'RTX-A6000'"""
    if not aggregate_name:
        return None
    
    import re
    match = re.match(r'^([A-Z0-9-]+)-n3', aggregate_name)
    if match:
        return match.group(1)
    return None

def get_gpu_count_from_hostname(hostname):
    """Determine GPU count from hostname - A4000 hosts have 10, others have 8"""
    if 'A4000' in hostname:
        return 10
    return 8

def get_gpu_type_from_hostname_context(hostname):
    """Get GPU type by finding which aggregate the hostname belongs to"""
    try:
        gpu_aggregates = discover_gpu_aggregates()
        
        for gpu_type, config in gpu_aggregates.items():
            # Check runpod aggregate
            if config.get('runpod'):
                runpod_hosts = get_aggregate_hosts(config['runpod'])
                if hostname in runpod_hosts:
                    return gpu_type
                    
            # Check on-demand variants
            if config.get('ondemand_variants'):
                for variant in config['ondemand_variants']:
                    variant_hosts = get_aggregate_hosts(variant['aggregate'])
                    if hostname in variant_hosts:
                        return gpu_type
                        
            # Check spot aggregate
            if config.get('spot'):
                spot_hosts = get_aggregate_hosts(config['spot'])
                if hostname in spot_hosts:
                    return gpu_type
        
        return None
    except Exception as e:
        print(f"❌ Error getting GPU type for hostname {hostname}: {e}")
        return None

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

def get_aggregate_hosts(aggregate_name):
    """Get hosts in an aggregate using OpenStack SDK"""
    try:
        conn = get_openstack_connection()
        if not conn:
            print(f"❌ No OpenStack connection available")
            return []
        
        aggregate = find_aggregate_by_name(conn, aggregate_name)
        
        if aggregate:
            hosts = aggregate.hosts or []
            print(f"📋 Found {len(hosts)} hosts in aggregate {aggregate_name}: {hosts}")
            return hosts
        else:
            print(f"⚠️ Aggregate {aggregate_name} not found")
            return []
            
    except Exception as e:
        print(f"❌ Error getting hosts for aggregate {aggregate_name}: {e}")
        return []

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

def get_host_vm_count_with_debug(hostname):
    """Get VM count for a specific host with debug logging"""
    start_time = time.time()
    try:
        count = get_host_vm_count(hostname)
        elapsed = time.time() - start_time
        print(f"🔍 VM count for {hostname}: {count} VMs (took {elapsed:.2f}s)")
        return hostname, count
    except Exception as e:
        elapsed = time.time() - start_time
        print(f"❌ VM count failed for {hostname} after {elapsed:.2f}s: {e}")
        return hostname, 0

def get_bulk_vm_counts(hostnames, max_workers=10):
    """Get VM counts for multiple hosts concurrently"""
    start_time = time.time()
    print(f"🚀 Starting bulk VM count check for {len(hostnames)} hosts with {max_workers} workers...")
    
    vm_counts = {}
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        # Submit all tasks
        future_to_hostname = {executor.submit(get_host_vm_count_with_debug, hostname): hostname 
                             for hostname in hostnames}
        
        # Collect results as they complete
        completed = 0
        for future in as_completed(future_to_hostname):
            hostname, count = future.result()
            vm_counts[hostname] = count
            completed += 1
            
            # Progress indicator every 10 hosts
            if completed % 10 == 0 or completed == len(hostnames):
                elapsed = time.time() - start_time
                print(f"📊 VM count progress: {completed}/{len(hostnames)} hosts checked ({elapsed:.1f}s)")
    
    total_elapsed = time.time() - start_time
    print(f"✅ Bulk VM count completed: {len(hostnames)} hosts in {total_elapsed:.2f}s (avg {total_elapsed/len(hostnames):.2f}s per host)")
    
    return vm_counts

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

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/gpu-types')
def get_gpu_types():
    """Get available GPU types from discovered aggregates"""
    gpu_aggregates = discover_gpu_aggregates()
    return jsonify({
        'gpu_types': list(gpu_aggregates.keys()),
        'aggregates': gpu_aggregates
    })

@app.route('/api/aggregates/<gpu_type>')
def get_aggregate_data(gpu_type):
    """Get aggregate data for a specific GPU type with three-column layout: On-Demand, Runpod, Spot"""
    gpu_aggregates = discover_gpu_aggregates()
    
    if gpu_type not in gpu_aggregates:
        return jsonify({'error': 'Invalid GPU type'}), 400
    
    config = gpu_aggregates[gpu_type]
    
    # Collect all hostnames for bulk NetBox lookup
    all_hostnames = []
    
    # Get hosts for each aggregate type
    ondemand_hosts = []
    runpod_hosts = []
    spot_hosts = []
    
    # Handle multiple on-demand variants (like A100-n3 and A100-n3-NVLink)
    ondemand_host_variants = {}  # Track which variant each host belongs to
    if config.get('ondemand_variants'):
        for variant in config['ondemand_variants']:
            variant_hosts = get_aggregate_hosts(variant['aggregate'])
            ondemand_hosts.extend(variant_hosts)
            all_hostnames.extend(variant_hosts)
            # Track which variant each host belongs to
            for host in variant_hosts:
                ondemand_host_variants[host] = variant['variant']
    elif config.get('ondemand'):
        # Fallback for single on-demand aggregate
        ondemand_hosts = get_aggregate_hosts(config['ondemand'])
        all_hostnames.extend(ondemand_hosts)
        for host in ondemand_hosts:
            ondemand_host_variants[host] = config['ondemand']
    
    if config.get('runpod'):
        runpod_hosts = get_aggregate_hosts(config['runpod'])
        all_hostnames.extend(runpod_hosts)
    
    if config.get('spot'):
        spot_hosts = get_aggregate_hosts(config['spot'])
        all_hostnames.extend(spot_hosts)
    
    # Bulk NetBox lookup for all hostnames
    tenant_info_bulk = get_netbox_tenants_bulk(all_hostnames)
    
    # Bulk VM count lookup for all hostnames (concurrent processing)
    vm_counts_bulk = get_bulk_vm_counts(all_hostnames)
    
    def process_hosts(hosts, aggregate_type):
        """Helper function to process hosts with consistent data structure"""
        processed = []
        for host in hosts:
            vm_count = vm_counts_bulk.get(host, 0)
            tenant_info = tenant_info_bulk[host]
            
            # Get GPU information for Spot and On-Demand only
            if aggregate_type in ['spot', 'ondemand']:
                gpu_info = get_host_gpu_info_fast(host, vm_count)
                host_data = {
                    'name': host,
                    'vm_count': vm_count,
                    'has_vms': vm_count > 0,
                    'tenant': tenant_info['tenant'],
                    'owner_group': tenant_info['owner_group'],
                    'nvlinks': tenant_info['nvlinks'],
                    'gpu_used': gpu_info['gpu_used'],
                    'gpu_capacity': gpu_info['gpu_capacity'],
                    'gpu_usage_ratio': gpu_info['gpu_usage_ratio']
                }
                # Add variant information for on-demand hosts
                if aggregate_type == 'ondemand' and host in ondemand_host_variants:
                    host_data['variant'] = ondemand_host_variants[host]
            else:
                # For Runpod, hosts are fully utilized
                host_data = {
                    'name': host,
                    'vm_count': vm_count,
                    'has_vms': vm_count > 0,
                    'tenant': tenant_info['tenant'],
                    'owner_group': tenant_info['owner_group'],
                    'nvlinks': tenant_info['nvlinks']
                }
            
            processed.append(host_data)
        return processed
    
    # Process all three aggregate types
    processing_start = time.time()
    print(f"🏗️ Processing {len(ondemand_hosts)} ondemand hosts...")
    process_start = time.time()
    ondemand_data = process_hosts(ondemand_hosts, 'ondemand')
    print(f"✅ Ondemand processing completed in {time.time() - process_start:.2f}s")
    
    print(f"🏗️ Processing {len(runpod_hosts)} runpod hosts...")
    process_start = time.time()
    runpod_data = process_hosts(runpod_hosts, 'runpod')
    print(f"✅ Runpod processing completed in {time.time() - process_start:.2f}s")
    
    print(f"🏗️ Processing {len(spot_hosts)} spot hosts...")
    process_start = time.time()
    spot_data = process_hosts(spot_hosts, 'spot')
    print(f"✅ Spot processing completed in {time.time() - process_start:.2f}s")
    
    print(f"🏁 All host processing completed in {time.time() - processing_start:.2f}s")
    
    # Calculate GPU summary statistics for On-Demand and Spot only
    def calculate_gpu_summary(data):
        total_used = sum(host.get('gpu_used', 0) for host in data)
        total_capacity = sum(host.get('gpu_capacity', 0) for host in data)
        return {
            'gpu_used': total_used,
            'gpu_capacity': total_capacity,
            'gpu_usage_ratio': f"{total_used}/{total_capacity}"
        }
    
    ondemand_gpu_summary = calculate_gpu_summary(ondemand_data)
    spot_gpu_summary = calculate_gpu_summary(spot_data)
    
    # Overall GPU summary (On-Demand + Spot)
    total_gpu_used = ondemand_gpu_summary['gpu_used'] + spot_gpu_summary['gpu_used']
    total_gpu_capacity = ondemand_gpu_summary['gpu_capacity'] + spot_gpu_summary['gpu_capacity']
    gpu_usage_percentage = round((total_gpu_used / total_gpu_capacity * 100) if total_gpu_capacity > 0 else 0, 1)
    
    # Build on-demand name display
    ondemand_name = config.get('ondemand', 'N/A')
    if config.get('ondemand_variants') and len(config['ondemand_variants']) > 1:
        variant_names = [variant['variant'] for variant in config['ondemand_variants']]
        ondemand_name = f"{gpu_type}-n3 ({len(variant_names)} variants)"
    elif config.get('ondemand_variants') and len(config['ondemand_variants']) == 1:
        ondemand_name = config['ondemand_variants'][0]['variant']
    
    return jsonify({
        'gpu_type': gpu_type,
        'ondemand': {
            'name': ondemand_name,
            'hosts': ondemand_data,
            'gpu_summary': ondemand_gpu_summary,
            'variants': config.get('ondemand_variants', [])
        },
        'runpod': {
            'name': config.get('runpod', 'N/A'),
            'hosts': runpod_data
        },
        'spot': {
            'name': config.get('spot', 'N/A'),
            'hosts': spot_data,
            'gpu_summary': spot_gpu_summary
        },
        'gpu_overview': {
            'total_gpu_used': total_gpu_used,
            'total_gpu_capacity': total_gpu_capacity,
            'gpu_usage_ratio': f"{total_gpu_used}/{total_gpu_capacity}",
            'gpu_usage_percentage': gpu_usage_percentage
        }
    })

@app.route('/api/host-vms/<hostname>')
def get_host_vm_details(hostname):
    """Get detailed VM information for a host"""
    vms = get_host_vms(hostname)
    return jsonify({
        'hostname': hostname,
        'vms': vms,
        'count': len(vms)
    })

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
  -H "Authorization: {masked_hyperstack_key}" \\
  -H "Content-Type: application/json" \\
  -d '{{
    "name": "{hostname}",
    "environment_name": "CA1-RunPod",
    "image_name": "Ubuntu Server 22.04 LTS (Jammy Jellyfish)",
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
        "image_name": "Ubuntu Server 22.04 LTS (Jammy Jellyfish)",
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
            'Authorization': HYPERSTACK_API_KEY,
            'Content-Type': 'application/json'
        }
        
        response = requests.post(
            f"{HYPERSTACK_API_URL}/core/virtual-machines",
            headers=headers,
            json=payload,
            timeout=30
        )
        
        # Build command for logging (with masked API key)
        masked_command = f"curl -X POST {HYPERSTACK_API_URL}/core/virtual-machines -H 'Authorization: {mask_api_key(HYPERSTACK_API_KEY)}' -d '{{\"name\": \"{hostname}\", \"flavor_name\": \"{flavor_name}\", ...}}'"
        
        if response.status_code in [200, 201]:
            result_data = response.json()
            
            # Log the successful command
            log_command(masked_command, {
                'success': True,
                'stdout': f'Successfully launched VM {hostname} with flavor {flavor_name}',
                'stderr': '',
                'returncode': 0
            }, 'executed')
            
            return jsonify({
                'success': True,
                'message': f'Successfully launched VM {hostname} on Hyperstack',
                'vm_name': hostname,
                'flavor_name': flavor_name,
                'response': result_data
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

if __name__ == '__main__':
    print("=" * 60)
    print("🚀 OpenStack Spot Manager Starting...")
    print("=" * 60)
    print("📊 Debug mode: ENABLED")
    print("🌐 Server: http://0.0.0.0:6969")
    print("🔍 Command logging: ENABLED")
    print("=" * 60)
    app.run(debug=True, host='0.0.0.0', port=6969)
