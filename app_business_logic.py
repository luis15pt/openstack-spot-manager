#!/usr/bin/env python3

import subprocess
import json
import re
from datetime import datetime
import openstack
import os
import requests
from concurrent.futures import ThreadPoolExecutor, as_completed
import time

# Import parallel agents functionality
from modules.parallel_agents import get_all_data_parallel, clear_parallel_cache

# Import cached aggregate operations instead of duplicating
from modules.aggregate_operations import (
    discover_gpu_aggregates, 
    get_aggregate_hosts,
    get_gpu_type_from_hostname_context,
    find_host_current_aggregate
)

# Import OpenStack operations that were previously duplicated 
from modules.openstack_operations import find_aggregate_by_name

# Global variables and configuration
command_log = []
_openstack_connection = None
_tenant_cache = {}
_tenant_cache_timestamps = {}
TENANT_CACHE_TTL = 1800  # 30 minutes - tenant info changes less frequently

# Configuration constants
NETBOX_URL = os.getenv('NETBOX_URL')
NETBOX_API_KEY = os.getenv('NETBOX_API_KEY')
HYPERSTACK_API_URL = os.getenv('HYPERSTACK_API_URL', 'https://infrahub-api.nexgencloud.com/v1')
HYPERSTACK_API_KEY = os.getenv('HYPERSTACK_API_KEY')
RUNPOD_API_KEY = os.getenv('RUNPOD_API_KEY')
HYPERSTACK_FIREWALL_CA1_ID = os.getenv('HYPERSTACK_FIREWALL_CA1_ID', '971')  # Firewall ID for CA1 hosts

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

# find_aggregate_by_name() is now imported from modules.openstack_operations

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

def get_host_gpu_info_with_debug(hostname):
    """Get GPU info for a specific host with debug logging"""
    start_time = time.time()
    try:
        gpu_info = get_host_gpu_info(hostname)
        elapsed = time.time() - start_time
        print(f"🎮 GPU info for {hostname}: {gpu_info['gpu_used']}/{gpu_info['gpu_capacity']} GPUs (took {elapsed:.2f}s)")
        return hostname, gpu_info
    except Exception as e:
        elapsed = time.time() - start_time
        print(f"❌ GPU info failed for {hostname} after {elapsed:.2f}s: {e}")
        return hostname, {
            'gpu_used': 0,
            'gpu_capacity': 8,
            'vm_count': 0,
            'gpu_usage_ratio': "0/8"
        }

def get_bulk_gpu_info(hostnames, max_workers=20):
    """Get GPU info for multiple hosts concurrently"""
    if not hostnames:
        return {}
        
    start_time = time.time()
    print(f"🎮 Starting bulk GPU info check for {len(hostnames)} hosts with {max_workers} workers...")
    
    gpu_info_results = {}
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        # Submit all tasks
        future_to_hostname = {executor.submit(get_host_gpu_info_with_debug, hostname): hostname 
                             for hostname in hostnames}
        
        # Collect results as they complete
        completed = 0
        for future in as_completed(future_to_hostname):
            hostname, gpu_info = future.result()
            gpu_info_results[hostname] = gpu_info
            completed += 1
            
            # Progress indicator every 10 hosts
            if completed % 10 == 0 or completed == len(hostnames):
                elapsed = time.time() - start_time
                print(f"📊 GPU info progress: {completed}/{len(hostnames)} hosts checked ({elapsed:.1f}s)")
    
    total_elapsed = time.time() - start_time
    print(f"✅ Bulk GPU info completed: {len(hostnames)} hosts in {total_elapsed:.2f}s (avg {total_elapsed/len(hostnames):.2f}s per host)")
    
    return gpu_info_results

# discover_gpu_aggregates() is now imported from modules.aggregate_operations

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

# get_gpu_type_from_hostname_context() is now imported from modules.aggregate_operations

# find_host_current_aggregate() is now imported from modules.aggregate_operations

def build_flavor_name(hostname):
    """Build flavor name using cache-optimized method - NO OpenStack API calls during RunPod operations"""
    from modules.aggregate_operations import build_flavor_name_optimized
    return build_flavor_name_optimized(hostname)

def mask_api_key(api_key, prefix=""):
    """Mask API key for display purposes"""
    if not api_key:
        return "***_KEY"
    
    if len(api_key) <= 8:
        return "***_KEY"
    
    return f"{api_key[:4]}***{api_key[-4:]}"

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

# get_aggregate_hosts() is now imported from modules.aggregate_operations

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

def get_bulk_vm_counts(hostnames, max_workers=20):
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
    avg_time = total_elapsed / len(hostnames) if len(hostnames) > 0 else 0
    print(f"✅ Bulk VM count completed: {len(hostnames)} hosts in {total_elapsed:.2f}s (avg {avg_time:.2f}s per host)")
    
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

def attach_runpod_storage_network(vm_name, delay_seconds=120):
    """Attach RunPod-Storage-Canada-1 network to VM after specified delay (Canada hosts only)"""
    def delayed_attach():
        try:
            # Log the start of waiting period
            log_command(
                f"⏳ Waiting {delay_seconds}s before attaching storage network to {vm_name}...",
                {
                    'success': True,
                    'stdout': f'Scheduled storage network attachment for {vm_name} in {delay_seconds}s',
                    'stderr': '',
                    'returncode': 0
                },
                'queued'
            )
            print(f"⏳ Waiting {delay_seconds}s before attaching storage network to {vm_name}...")
            time.sleep(delay_seconds)
            
            # Check if host is in Canada (CA1 prefix)
            if not vm_name.startswith('CA1-'):
                print(f"🌍 Skipping storage network attachment for {vm_name} - not a Canada host")
                return
            
            print(f"🔌 Starting network attachment for VM {vm_name} (Canada host)...")
            conn = get_openstack_connection()
            if not conn:
                print(f"❌ No OpenStack connection available for network attachment to {vm_name}")
                return
            
            # Find the VM by name with retry mechanism (VM might still be synchronizing)
            server = None
            max_retries = 5
            retry_delay = 30  # 30 seconds between retries
            
            for attempt in range(max_retries):
                # Use all_projects=True to search across all projects
                all_servers = list(conn.compute.servers(all_projects=True))
                
                # Try exact match first
                for s in all_servers:
                    if s.name == vm_name:
                        server = s
                        break
                
                # If no exact match, try partial match (in case of naming differences)
                if not server:
                    for s in all_servers:
                        if vm_name in s.name or s.name in vm_name:
                            print(f"🔍 Found VM with similar name: {s.name} (looking for {vm_name})")
                            server = s
                            break
                
                if server:
                    break
                    
                if attempt < max_retries - 1:
                    print(f"🔄 VM {vm_name} not found yet, retrying in {retry_delay}s (attempt {attempt + 1}/{max_retries})...")
                    time.sleep(retry_delay)
            
            if not server:
                print(f"❌ VM {vm_name} not found in OpenStack after {max_retries} attempts. Available VMs:")
                for s in all_servers[-5:]:  # Show last 5 VMs for debugging
                    print(f"  - {s.name} (Status: {s.status})")
                    
                # Log the failure
                log_command(
                    f"openstack server show {vm_name}",
                    {
                        'success': False,
                        'stdout': '',
                        'stderr': f'VM {vm_name} not found in OpenStack after {max_retries} attempts',
                        'returncode': 1
                    },
                    'error'
                )
                return
            
            # Find the RunPod-Storage-Canada-1 network
            network = None
            for net in conn.network.networks():
                if net.name == "RunPod-Storage-Canada-1":
                    network = net
                    break
            
            if not network:
                print(f"❌ Network 'RunPod-Storage-Canada-1' not found")
                return
            
            # Create and attach the network interface
            print(f"🔌 Attaching RunPod-Storage-Canada-1 network to VM {vm_name}...")
            
            # Check if port already exists and clean it up if needed
            existing_ports = list(conn.network.ports(name=f"{vm_name}-storage-port"))
            if existing_ports:
                print(f"🔧 Found existing port for {vm_name}, cleaning up...")
                for existing_port in existing_ports:
                    try:
                        # Try to detach from any existing interfaces first
                        interfaces = list(conn.compute.server_interfaces(server.id))
                        for interface in interfaces:
                            if interface.port_id == existing_port.id:
                                conn.compute.delete_server_interface(interface.id, server.id)
                                print(f"🔌 Detached existing interface {interface.id}")
                                time.sleep(5)  # Wait for detachment to complete
                        
                        # Delete the existing port
                        conn.network.delete_port(existing_port.id)
                        print(f"🗑️ Deleted existing port {existing_port.id}")
                        time.sleep(5)  # Wait for deletion to complete
                    except Exception as e:
                        print(f"⚠️ Could not clean up existing port: {e}")
            
            # Create port on the network with proper subnet
            try:
                # Get the subnet for the storage network
                subnets = list(conn.network.subnets(network_id=network.id))
                subnet_id = subnets[0].id if subnets else None
                
                port_args = {
                    'network_id': network.id,
                    'name': f"{vm_name}-storage-port"
                }
                
                if subnet_id:
                    port_args['fixed_ips'] = [{'subnet_id': subnet_id}]
                
                port = conn.network.create_port(**port_args)
                print(f"✅ Created new storage port {port.id} for {vm_name}")
                
                # Wait for port to be active
                time.sleep(10)
                
                # Attach the port to the server
                conn.compute.create_server_interface(server.id, port_id=port.id)
                print(f"✅ Successfully attached storage port to VM {vm_name}")
                
            except Exception as attach_error:
                print(f"❌ Failed to attach storage port: {attach_error}")
                # Try to clean up the port we just created
                try:
                    if 'port' in locals():
                        conn.network.delete_port(port.id)
                        print(f"🗑️ Cleaned up failed port {port.id}")
                except:
                    pass
                raise attach_error
            
            print(f"✅ Successfully attached RunPod-Storage-Canada-1 network to VM {vm_name}")
            
            # Log the action
            log_command(
                f"openstack server add port {vm_name} {port.id}",
                {
                    'success': True,
                    'stdout': f'Successfully attached RunPod-Storage-Canada-1 network to {vm_name}',
                    'stderr': '',
                    'returncode': 0
                },
                'executed'
            )
            
        except Exception as e:
            error_msg = f"Failed to attach storage network to {vm_name}: {str(e)}"
            print(f"❌ {error_msg}")
            
            # Log the failure
            log_command(
                f"openstack server add port {vm_name} <storage-network>",
                {
                    'success': False,
                    'stdout': '',
                    'stderr': error_msg,
                    'returncode': 1
                },
                'error'
            )
    
    # Import threading here to avoid circular imports
    import threading
    
    # Start the delayed attachment in a separate thread
    thread = threading.Thread(target=delayed_attach, daemon=True)
    thread.start()
    if vm_name.startswith('CA1-'):
        print(f"🚀 Scheduled storage network attachment for {vm_name} (Canada host) in {delay_seconds} seconds")
    else:
        print(f"🌍 VM {vm_name} is not in Canada - storage network attachment will be skipped")

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
    
    # Import threading here to avoid circular imports
    import threading
    
    # Start the delayed firewall attachment in a separate thread
    thread = threading.Thread(target=delayed_firewall_attach, daemon=True)
    thread.start()
    if vm_name.startswith('CA1-') and HYPERSTACK_FIREWALL_CA1_ID:
        print(f"🔥 Scheduled firewall attachment for VM {vm_name} (ID: {vm_id}) with firewall {HYPERSTACK_FIREWALL_CA1_ID} in {delay_seconds} seconds")
    elif vm_name.startswith('CA1-'):
        print(f"⚠️ No CA1 firewall ID configured - firewall attachment will be skipped for {vm_name}")
    else:
        print(f"🌍 VM {vm_name} is not in Canada - firewall attachment will be skipped")

# =============================================================================
# NETBOX CACHE MANAGEMENT FUNCTIONS
# =============================================================================

def is_tenant_cache_valid(hostname):
    """Check if tenant cache entry is still valid"""
    global _tenant_cache_timestamps
    
    if hostname not in _tenant_cache_timestamps:
        return False
    
    return (time.time() - _tenant_cache_timestamps[hostname]) < TENANT_CACHE_TTL

def get_netbox_tenant_with_ttl(hostname, force_refresh=False):
    """Get tenant information with TTL caching and optional force refresh"""
    global _tenant_cache, _tenant_cache_timestamps
    
    # Skip cache if force refresh requested
    if not force_refresh and hostname in _tenant_cache and is_tenant_cache_valid(hostname):
        return _tenant_cache[hostname]
    
    # Cache miss, expired, or force refresh - use existing bulk function for single host
    print(f"🔍 {'Force refreshing' if force_refresh else 'Cache miss for'} NetBox lookup: {hostname}")
    result = get_netbox_tenants_bulk([hostname])
    
    # Update timestamp for this hostname
    _tenant_cache_timestamps[hostname] = time.time()
    
    return result[hostname]

def clear_netbox_cache(hostname=None):
    """Clear NetBox cache for specific hostname or all hostnames"""
    global _tenant_cache, _tenant_cache_timestamps
    
    if hostname:
        # Clear specific hostname
        cleared = []
        if hostname in _tenant_cache:
            del _tenant_cache[hostname]
            cleared.append('tenant')
        if hostname in _tenant_cache_timestamps:
            del _tenant_cache_timestamps[hostname]
        return cleared
    else:
        # Clear all cache
        tenant_count = len(_tenant_cache)
        _tenant_cache.clear()
        _tenant_cache_timestamps.clear()
        return tenant_count

def get_netbox_cache_stats():
    """Get current NetBox cache statistics"""
    return {
        'tenant_cache_size': len(_tenant_cache),
        'cache_timestamps': len(_tenant_cache_timestamps),
        'cache_ttl_seconds': TENANT_CACHE_TTL
    }

# =============================================================================
# OUT OF STOCK DATA FUNCTIONS
# =============================================================================

def get_outofstock_data():
    """Get out of stock devices from NetBox that are not in any OpenStack aggregate
    
    Returns devices that are in NetBox with non-active status but NOT present 
    in any OpenStack aggregate, ensuring host uniqueness across all columns.
    """
    try:
        from modules.netbox_outofstock_operations import get_netbox_non_active_devices
        from modules.parallel_agents import get_all_data_parallel
        
        print("🔍 Getting out-of-stock devices (NetBox non-active devices not in OpenStack)...")
        
        # Get all non-active devices from NetBox
        netbox_devices = get_netbox_non_active_devices()
        
        if not netbox_devices:
            print("ℹ️ No non-active devices found in NetBox")
            return {
                'hosts': [],
                'gpu_summary': {
                    'gpu_used': 0,
                    'gpu_capacity': 0,
                    'gpu_usage_ratio': '0/0'
                },
                'name': 'Out of Stock'
            }
        
        # Get all current OpenStack hosts across all aggregates to ensure uniqueness
        openstack_hosts = set()
        try:
            parallel_data = get_all_data_parallel()
            for gpu_type, data in parallel_data.items():
                for host_info in data.get('hosts', []):
                    hostname = host_info.get('hostname')
                    if hostname:
                        openstack_hosts.add(hostname)
            
            print(f"📊 Found {len(openstack_hosts)} hosts currently in OpenStack aggregates")
        except Exception as e:
            print(f"⚠️ Could not get OpenStack hosts for uniqueness check: {e}")
            # Continue with empty set - better to show devices than hide them
        
        # Filter out devices that are already in OpenStack aggregates
        actual_outofstock = []
        filtered_count = 0
        
        for device in netbox_devices:
            device_hostname = device.get('hostname') or device.get('name')
            if not device_hostname:
                continue
                
            # CRITICAL: Ensure host uniqueness - exclude if in any OpenStack aggregate
            if device_hostname in openstack_hosts:
                print(f"🔄 Excluding {device_hostname} - already in OpenStack aggregate")
                filtered_count += 1
                continue
            
            # This device is truly out of stock - in NetBox but not in OpenStack
            actual_outofstock.append(device)
        
        print(f"✅ Out-of-stock analysis complete:")
        print(f"   - NetBox non-active devices: {len(netbox_devices)}")
        print(f"   - Filtered out (in OpenStack): {filtered_count}")
        print(f"   - Actual out-of-stock: {len(actual_outofstock)}")
        
        # Calculate GPU summary for out-of-stock devices
        total_gpu_capacity = len(actual_outofstock) * 8  # Assume 8 GPUs per device
        gpu_summary = {
            'gpu_used': 0,  # Out of stock devices have 0 GPU usage
            'gpu_capacity': total_gpu_capacity,
            'gpu_usage_ratio': f'0/{total_gpu_capacity}'
        }
        
        # Format devices to match other column structures
        formatted_hosts = []
        for device in actual_outofstock:
            formatted_device = {
                'name': device.get('hostname', device.get('name')),
                'hostname': device.get('hostname', device.get('name')),
                'status': device.get('status', 'unknown'),
                'status_label': device.get('status_label', 'Unknown'),
                'aggregate': device.get('aggregate', 'unknown'),
                'tenant': device.get('tenant', 'Unknown'),
                'owner_group': device.get('owner_group', 'Unknown'),
                'nvlinks': device.get('nvlinks', False),
                'gpu_used': device.get('gpu_used', 0),
                'gpu_capacity': device.get('gpu_capacity', 8),
                'gpu_usage_ratio': device.get('gpu_usage_ratio', '0/8'),
                'site': device.get('site', 'Unknown'),
                'rack': device.get('rack', 'Unknown'),
                'vm_count': 0,  # Out of stock devices have no VMs
                'has_vms': False
            }
            
            # Add GPU tags if available
            if device.get('gpu_tags'):
                formatted_device['gpu_tags'] = device.get('gpu_tags')
            
            formatted_hosts.append(formatted_device)
        
        return {
            'hosts': formatted_hosts,
            'gpu_summary': gpu_summary,
            'name': 'Out of Stock',
            'device_count': len(formatted_hosts),
            'status_breakdown': _get_status_breakdown(formatted_hosts)
        }
        
    except Exception as e:
        print(f"❌ Error getting out-of-stock data: {e}")
        # Return empty structure on error
        return {
            'hosts': [],
            'gpu_summary': {
                'gpu_used': 0,
                'gpu_capacity': 0,
                'gpu_usage_ratio': '0/0'
            },
            'name': 'Out of Stock',
            'error': str(e)
        }

def _get_status_breakdown(devices):
    """Get breakdown of devices by status for debugging/monitoring"""
    status_counts = {}
    for device in devices:
        status = device.get('status', 'unknown')
        status_counts[status] = status_counts.get(status, 0) + 1
    return status_counts
