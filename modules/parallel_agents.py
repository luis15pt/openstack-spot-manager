#!/usr/bin/env python3

import time
import threading
import os
import requests
from concurrent.futures import ThreadPoolExecutor, as_completed
from .openstack_operations import get_openstack_connection

# Global cache for parallel agent results
_parallel_cache = {}
_cache_timestamps = {}
_cache_lock = threading.Lock()
_active_requests = {}  # Track active requests to prevent duplicates
PARALLEL_CACHE_TTL = 600  # 10 minutes - production cache TTL

def get_all_data_parallel():
    """
    Master function that runs all 4 agents in parallel and returns organized results
    Thread-safe with locking to prevent duplicate requests
    """
    cache_key = "all_parallel_data"
    
    # First check cache without lock (fast path)
    if cache_key in _parallel_cache and cache_key in _cache_timestamps:
        age = time.time() - _cache_timestamps[cache_key]
        if age < PARALLEL_CACHE_TTL:
            print(f"✅ Using cached parallel data (age: {age:.1f}s)")
            return _parallel_cache[cache_key]
    
    # Need to acquire lock for cache miss or expired cache
    with _cache_lock:
        # Double-check cache after acquiring lock (another thread might have populated it)
        if cache_key in _parallel_cache and cache_key in _cache_timestamps:
            age = time.time() - _cache_timestamps[cache_key]
            if age < PARALLEL_CACHE_TTL:
                print(f"✅ Using cached parallel data (age: {age:.1f}s)")
                return _parallel_cache[cache_key]
        
        # Check if another thread is already working on this request
        if cache_key in _active_requests:
            print("⏳ Another thread is already collecting data, waiting...")
            # Wait for the other thread to complete (max 30 seconds)
            for i in range(30):
                time.sleep(1)
                if cache_key in _parallel_cache and cache_key in _cache_timestamps:
                    age = time.time() - _cache_timestamps[cache_key]
                    if age < PARALLEL_CACHE_TTL:
                        print(f"✅ Using data collected by another thread (age: {age:.1f}s)")
                        return _parallel_cache[cache_key]
            print("⚠️ Timeout waiting for other thread, proceeding with own request")
        
        # Mark this request as active
        _active_requests[cache_key] = threading.current_thread().ident
        
    try:
        start_time = time.time()
        print("🚀 Starting parallel data collection from all agents...")
        
        # Run all agents in parallel
        with ThreadPoolExecutor(max_workers=4) as executor:
            # Submit all agent tasks
            futures = {
                'netbox': executor.submit(netbox_agent),
                'aggregates': executor.submit(aggregate_agent), 
                'vm_counts': executor.submit(vm_count_agent),
                'gpu_info': executor.submit(gpu_info_agent)
            }
            
            # Collect results as they complete
            results = {}
            for agent_name, future in futures.items():
                try:
                    results[agent_name] = future.result()
                except Exception as e:
                    print(f"❌ {agent_name.title()} Agent failed: {e}")
                    results[agent_name] = {}
    
        total_time = time.time() - start_time
        print(f"🏁 All parallel agents completed in {total_time:.2f}s")
        
        # Organize the results
        organized_data = organize_parallel_results(results)
        
        # Cache the results
        _parallel_cache[cache_key] = organized_data
        _cache_timestamps[cache_key] = time.time()
        
        return organized_data
        
    finally:
        # Clean up active request tracking
        with _cache_lock:
            _active_requests.pop(cache_key, None)

def netbox_agent():
    """Agent 1: Get ALL NetBox device data in bulk"""
    print("📡 NetBox Agent: Fetching all device data...")
    start_time = time.time()
    
    try:
        # Import NetBox configuration
        import os
        NETBOX_URL = os.getenv('NETBOX_URL')
        NETBOX_API_KEY = os.getenv('NETBOX_API_KEY')
        
        if not NETBOX_URL or not NETBOX_API_KEY:
            print("⚠️ NetBox not configured - using defaults")
            return {}
        
        import requests
        
        # Get ALL devices in a single request (or paginated if needed)
        url = f"{NETBOX_URL}/api/dcim/devices/"
        headers = {
            'Authorization': f'Token {NETBOX_API_KEY}',
            'Content-Type': 'application/json'
        }
        
        all_devices = []
        page = 1
        params = {'limit': 1000}  # Large page size for efficiency
        
        while True:
            params['offset'] = (page - 1) * 1000
            response = requests.get(url, headers=headers, params=params, timeout=30)
            
            if response.status_code == 200:
                data = response.json()
                devices_batch = data['results']
                all_devices.extend(devices_batch)
                
                print(f"📡 NetBox Agent: Fetched page {page} ({len(devices_batch)} devices)")
                
                # Stop if we got less than full page
                if len(devices_batch) < 1000:
                    break
                page += 1
            else:
                print(f"❌ NetBox Agent: API error {response.status_code}")
                break
        
        # Process all devices into hostname-keyed dict AND track non-active devices
        netbox_data = {}
        non_active_devices = []
        
        # Define GPU-related tags and non-active statuses
        gpu_tags = ['nvidia-h100-pcie', 'nvidia-a100-pcie', 'nvidia-a100-sxm', 'nvidia-h100-sxm', 'nvidia-rtx-4090']
        
        for device in all_devices:
            hostname = device.get('name')
            if not hostname:
                continue
                
            tenant_data = device.get('tenant', {})
            tenant_name = tenant_data.get('name', 'Unknown') if tenant_data else 'Unknown'
            owner_group = 'Nexgen Cloud' if tenant_name == 'Chris Starkey' else 'Investors'
            
            # Get custom fields
            custom_fields = device.get('custom_fields', {})
            nvlinks = custom_fields.get('NVLinks', False)
            if nvlinks is None:
                nvlinks = False
            aggregate = custom_fields.get('Aggregates', 'unknown')
            
            # Get device status
            status = device.get('status', {})
            status_value = status.get('value', 'unknown') if status else 'unknown'
            status_label = status.get('label', 'Unknown') if status else 'Unknown'
            
            # Check if device has GPU tags
            device_tags = device.get('tags', [])
            device_tag_names = [tag.get('name', '') for tag in device_tags]
            has_gpu_tag = any(tag_name.lower() in [t.lower() for t in gpu_tags] for tag_name in device_tag_names)
            
            # Debug logging for non-active devices
            if status_value != 'active':
                print(f"🔍 Non-active device found: {hostname}, status: {status_value}, tags: {device_tag_names}, has_gpu_tag: {has_gpu_tag}")
            
            # Add to regular netbox_data for active devices
            if status_value == 'active':
                netbox_data[hostname] = {
                    'tenant': tenant_name,
                    'owner_group': owner_group,
                    'nvlinks': nvlinks,
                    'aggregate': aggregate,
                    'status': status_value
                }
            
            # Track non-active GPU devices for out-of-stock calculation
            if status_value != 'active' and has_gpu_tag:
                # Extract additional device information
                site = device.get('site', {}).get('name', 'Unknown') if device.get('site') else 'Unknown'
                rack = device.get('rack', {}).get('name', 'Unknown') if device.get('rack') else 'Unknown'
                
                # Get GPU tags
                gpu_type_tags = []
                for tag in device_tags:
                    tag_name = tag.get('name', '').lower()
                    if 'nvidia' in tag_name or 'gpu' in tag_name:
                        gpu_type_tags.append(tag.get('name'))
                
                non_active_devices.append({
                    'name': hostname,
                    'hostname': hostname,
                    'status': status_value,
                    'status_label': status_label,
                    'aggregate': aggregate,
                    'tenant': tenant_name,
                    'owner_group': owner_group,
                    'nvlinks': nvlinks,
                    'site': site,
                    'rack': rack,
                    'gpu_tags': gpu_type_tags,
                    'gpu_used': 0,
                    'gpu_capacity': 8,  # Assume 8 GPUs per device
                    'gpu_usage_ratio': '0/8',
                    'vm_count': 0,
                    'has_vms': False
                })
        
        elapsed = time.time() - start_time
        print(f"📡 NetBox Agent: Processed {len(netbox_data)} active devices and {len(non_active_devices)} non-active GPU devices in {elapsed:.2f}s")
        
        return {
            'active_devices': netbox_data,
            'non_active_devices': non_active_devices
        }
        
    except Exception as e:
        print(f"❌ NetBox Agent failed: {e}")
        return {}

def aggregate_agent():
    """Agent 2: Get ALL OpenStack aggregates and their hosts"""
    print("🏗️ Aggregate Agent: Fetching all aggregate-host mappings...")
    start_time = time.time()
    
    try:
        conn = get_openstack_connection()
        if not conn:
            return {}
        
        # Get all aggregates in one call
        aggregates = list(conn.compute.aggregates())
        
        # Build hostname -> aggregate mapping
        host_to_aggregate = {}
        aggregate_to_hosts = {}
        
        for agg in aggregates:
            hosts = agg.hosts or []
            aggregate_to_hosts[agg.name] = hosts
            
            # Map each host to its aggregate
            for host in hosts:
                host_to_aggregate[host] = agg.name
        
        elapsed = time.time() - start_time
        total_hosts = sum(len(hosts) for hosts in aggregate_to_hosts.values())
        print(f"🏗️ Aggregate Agent: Mapped {total_hosts} hosts across {len(aggregates)} aggregates in {elapsed:.2f}s")
        
        return {
            'host_to_aggregate': host_to_aggregate,
            'aggregate_to_hosts': aggregate_to_hosts,
            'aggregates': {agg.name: agg for agg in aggregates}
        }
        
    except Exception as e:
        print(f"❌ Aggregate Agent failed: {e}")
        return {}

def vm_count_agent():
    """Agent 3: Get VM counts for ALL hosts in bulk"""
    print("💻 VM Count Agent: Getting VM counts for all hosts...")
    start_time = time.time()
    
    try:
        # First get all hostnames from aggregate agent (if it ran first)
        # Otherwise, we'll get them from OpenStack directly
        conn = get_openstack_connection()
        if not conn:
            return {}
        
        # Get all unique hostnames by examining all aggregates
        all_hostnames = set()
        aggregates = list(conn.compute.aggregates())
        for agg in aggregates:
            if agg.hosts:
                all_hostnames.update(agg.hosts)
        
        hostnames_list = list(all_hostnames)
        
        # Get VM counts in parallel using built-in function
        vm_counts = {}
        with ThreadPoolExecutor(max_workers=50) as executor:
            # Submit all tasks
            future_to_hostname = {
                executor.submit(get_host_vm_count_direct, hostname): hostname 
                for hostname in hostnames_list
            }
            
            # Collect results
            for future in as_completed(future_to_hostname):
                hostname = future_to_hostname[future]
                try:
                    count = future.result()
                    vm_counts[hostname] = count
                except Exception as e:
                    print(f"❌ VM count failed for {hostname}: {e}")
                    vm_counts[hostname] = 0
        
        elapsed = time.time() - start_time
        total_vms = sum(vm_counts.values())
        hosts_with_vms = sum(1 for count in vm_counts.values() if count > 0)
        print(f"💻 VM Count Agent: Processed {len(vm_counts)} hosts, found {total_vms} VMs on {hosts_with_vms} hosts in {elapsed:.2f}s")
        return vm_counts
        
    except Exception as e:
        print(f"❌ VM Count Agent failed: {e}")
        return {}

def gpu_info_agent():
    """Agent 4: Get GPU info for ALL hosts in bulk"""
    print("🎮 GPU Info Agent: Getting GPU usage for all hosts...")
    start_time = time.time()
    
    try:
        # Get all unique hostnames from OpenStack aggregates
        conn = get_openstack_connection()
        if not conn:
            return {}
        
        all_hostnames = set()
        aggregates = list(conn.compute.aggregates())
        for agg in aggregates:
            if agg.hosts:
                all_hostnames.update(agg.hosts)
        
        hostnames_list = list(all_hostnames)
        
        # Get GPU info in parallel using built-in function
        gpu_info = {}
        with ThreadPoolExecutor(max_workers=50) as executor:
            # Submit all tasks
            future_to_hostname = {
                executor.submit(get_host_gpu_info_direct, hostname): hostname 
                for hostname in hostnames_list
            }
            
            # Collect results
            for future in as_completed(future_to_hostname):
                hostname = future_to_hostname[future]
                try:
                    info = future.result()
                    gpu_info[hostname] = info
                except Exception as e:
                    print(f"❌ GPU info failed for {hostname}: {e}")
                    gpu_info[hostname] = {
                        'gpu_used': 0, 
                        'gpu_capacity': 8, 
                        'gpu_usage_ratio': '0/8'
                    }
        
        elapsed = time.time() - start_time
        total_gpus_used = sum(info.get('gpu_used', 0) for info in gpu_info.values())
        total_gpu_capacity = sum(info.get('gpu_capacity', 8) for info in gpu_info.values()) 
        hosts_with_gpus_used = sum(1 for info in gpu_info.values() if info.get('gpu_used', 0) > 0)
        print(f"🎮 GPU Info Agent: Processed {len(gpu_info)} hosts, {total_gpus_used}/{total_gpu_capacity} GPUs used across {hosts_with_gpus_used} hosts in {elapsed:.2f}s")
        return gpu_info
        
    except Exception as e:
        print(f"❌ GPU Info Agent failed: {e}")
        return {}

def organize_parallel_results(results):
    """
    Organize the parallel agent results by GPU type and compute out-of-stock devices
    """
    start_time = time.time()
    
    # Extract NetBox data (now has active_devices and non_active_devices)
    netbox_result = results.get('netbox', {})
    netbox_data = netbox_result.get('active_devices', {}) if isinstance(netbox_result, dict) else {}
    netbox_non_active = netbox_result.get('non_active_devices', []) if isinstance(netbox_result, dict) else []
    
    aggregate_data = results.get('aggregates', {})
    vm_counts = results.get('vm_counts', {})
    gpu_info = results.get('gpu_info', {})
    
    host_to_aggregate = aggregate_data.get('host_to_aggregate', {})
    aggregate_to_hosts = aggregate_data.get('aggregate_to_hosts', {})
    
    # Classify aggregates by GPU type using the aggregate data we already collected
    aggregates_dict = aggregate_data.get('aggregates', {})
    gpu_aggregates = classify_aggregates_by_gpu_type(aggregates_dict)
    
    # Build final organized structure
    organized = {}
    for gpu_type, config in gpu_aggregates.items():
        # Collect all hosts for this GPU type
        all_hosts = []
        
        # Runpod hosts
        if config.get('runpod'):
            runpod_hosts = aggregate_to_hosts.get(config['runpod'], [])
            all_hosts.extend(runpod_hosts)
        
        # Ondemand variant hosts  
        if config.get('ondemand_variants'):
            for variant in config['ondemand_variants']:
                variant_hosts = aggregate_to_hosts.get(variant['aggregate'], [])
                all_hosts.extend(variant_hosts)
        
        # Spot hosts
        if config.get('spot'):
            spot_hosts = aggregate_to_hosts.get(config['spot'], [])
            all_hosts.extend(spot_hosts)
        
        # Contract hosts
        if config.get('contracts'):
            for contract in config['contracts']:
                contract_hosts = aggregate_to_hosts.get(contract['aggregate'], [])
                all_hosts.extend(contract_hosts)
        
        # Merge all data for these hosts
        host_details = []
        for hostname in all_hosts:
            host_detail = {
                'hostname': hostname,
                'aggregate': host_to_aggregate.get(hostname),
                'tenant_info': netbox_data.get(hostname, {
                    'tenant': 'Unknown', 
                    'owner_group': 'Investors', 
                    'nvlinks': False
                }),
                'vm_count': vm_counts.get(hostname, 0),
                'gpu_info': gpu_info.get(hostname, {
                    'gpu_used': 0, 
                    'gpu_capacity': 8, 
                    'gpu_usage_ratio': '0/8'
                })
            }
            host_details.append(host_detail)
        
        organized[gpu_type] = {
            'config': config,
            'hosts': host_details,
            'total_hosts': len(host_details)
        }
    
    # Compute out-of-stock devices (NetBox non-active devices not in any OpenStack aggregate)
    outofstock_data = compute_outofstock_devices(netbox_non_active, host_to_aggregate)
    
    # Add out-of-stock data to the organized results
    organized['outofstock'] = outofstock_data
    
    elapsed = time.time() - start_time
    print(f"🏁 Organized parallel results: {len(organized)-1} GPU types + out-of-stock ({outofstock_data['device_count']} devices) in {elapsed:.2f}s")
    
    return organized

def compute_outofstock_devices(netbox_non_active, host_to_aggregate):
    """
    Compute out-of-stock devices: NetBox non-active devices that are NOT in any OpenStack aggregate
    This ensures host uniqueness across all columns.
    """
    actual_outofstock = []
    filtered_count = 0
    
    openstack_hosts = set(host_to_aggregate.keys())
    print(f"🔍 Computing out-of-stock: {len(netbox_non_active)} NetBox non-active devices vs {len(openstack_hosts)} OpenStack hosts")
    
    for device in netbox_non_active:
        device_hostname = device.get('hostname') or device.get('name')
        if not device_hostname:
            continue
            
        # CRITICAL: Ensure host uniqueness - exclude if in any OpenStack aggregate
        if device_hostname in openstack_hosts:
            filtered_count += 1
            continue
        
        # This device is truly out of stock - in NetBox but not in OpenStack
        actual_outofstock.append(device)
    
    print(f"✅ Out-of-stock computation: {len(actual_outofstock)} actual out-of-stock (filtered {filtered_count} already in OpenStack)")
    
    # Calculate GPU summary for out-of-stock devices
    total_gpu_capacity = len(actual_outofstock) * 8  # Assume 8 GPUs per device
    gpu_summary = {
        'gpu_used': 0,  # Out of stock devices have 0 GPU usage
        'gpu_capacity': total_gpu_capacity,
        'gpu_usage_ratio': f'0/{total_gpu_capacity}'
    }
    
    # Get status breakdown for monitoring
    status_counts = {}
    for device in actual_outofstock:
        status = device.get('status', 'unknown')
        status_counts[status] = status_counts.get(status, 0) + 1
    
    return {
        'hosts': actual_outofstock,
        'gpu_summary': gpu_summary,
        'name': 'Out of Stock',
        'device_count': len(actual_outofstock),
        'status_breakdown': status_counts
    }

def classify_aggregates_by_gpu_type(aggregates_dict):
    """
    Classify aggregates by GPU type using existing logic from discover_gpu_aggregates
    """
    import re
    
    gpu_aggregates = {}
    
    for agg_name, agg_obj in aggregates_dict.items():
        # Pattern 1: Regular GPU aggregates: GPU-TYPE-n3[-suffix]
        match = re.match(r'^([A-Z0-9-]+)-n3(-NVLink)?(-spot|-runpod)?$', agg_name)
        if match:
            gpu_type = match.group(1)
            nvlink_suffix = match.group(2)
            pool_suffix = match.group(3)
            
            if gpu_type not in gpu_aggregates:
                gpu_aggregates[gpu_type] = {
                    'ondemand_variants': [],
                    'spot': None,
                    'runpod': None,
                    'contracts': []
                }
            
            if pool_suffix == '-spot':
                gpu_aggregates[gpu_type]['spot'] = agg_name
            elif pool_suffix == '-runpod':
                gpu_aggregates[gpu_type]['runpod'] = agg_name
            else:
                # On-demand variant
                variant_display = f"{gpu_type}-n3{nvlink_suffix or ''}"
                gpu_aggregates[gpu_type]['ondemand_variants'].append({
                    'aggregate': agg_name,
                    'variant': variant_display
                })
        
        # Pattern 2: Contract aggregates
        contract_match = re.match(r'^[Cc]ontract-([^-]+)', agg_name)
        if contract_match:
            # Extract GPU type from contract name
            gpu_type = None
            for possible_gpu in ['H100', 'A100', 'RTX-A6000', 'L40', 'A4000']:
                if possible_gpu in agg_name:
                    gpu_type = possible_gpu
                    break
            
            if not gpu_type:
                # Try patterns like 8xA100
                suffix_match = re.search(r'\d+x([A-Z0-9-]+)', agg_name)
                if suffix_match:
                    gpu_type = suffix_match.group(1)
            
            if not gpu_type:
                gpu_type = 'A100'  # Default
            
            if gpu_type not in gpu_aggregates:
                gpu_aggregates[gpu_type] = {
                    'ondemand_variants': [],
                    'spot': None,
                    'runpod': None,
                    'contracts': []
                }
            
            gpu_aggregates[gpu_type]['contracts'].append({
                'aggregate': agg_name,
                'name': agg_name
            })
    
    return gpu_aggregates

def get_host_vm_count_direct(hostname):
    """Get VM count for a specific host using OpenStack SDK"""
    try:
        conn = get_openstack_connection()
        if not conn:
            return 0
        
        # Method 1: Direct host filtering with all_projects (admin required)
        try:
            servers = list(conn.compute.servers(host=hostname, all_projects=True))
            vm_count = len(servers)
            return vm_count
        except Exception as e:
            # Method 2: Try without all_projects as fallback
            try:
                servers = list(conn.compute.servers(host=hostname))
                vm_count = len(servers)
                return vm_count
            except Exception as e2:
                # Only log errors, not per-host success
                print(f"❌ VM Count Agent error for {hostname}: {e2}")
                return 0
        
    except Exception as e:
        print(f"❌ VM Count Agent error for {hostname}: {e}")
        return 0

def get_host_gpu_info_direct(hostname):
    """Get GPU usage information for a host based on VM flavors"""
    try:
        conn = get_openstack_connection()
        if not conn:
            return {'gpu_used': 0, 'gpu_capacity': 8, 'gpu_usage_ratio': '0/8'}
        
        # Get all VMs on this host
        try:
            servers = list(conn.compute.servers(host=hostname, all_projects=True))
        except:
            try:
                servers = list(conn.compute.servers(host=hostname))
            except:
                servers = []
        
        # Calculate total GPU usage from all VMs
        total_gpu_used = 0
        for server in servers:
            # Get flavor info and extract GPU count
            flavor_name = getattr(server, 'flavor', {}).get('original_name', 'N/A')
            if flavor_name and flavor_name != 'N/A':
                # Extract GPU count from flavor name like 'n3-RTX-A6000x8'
                import re
                match = re.search(r'x(\d+)', flavor_name)
                if match:
                    gpu_count = int(match.group(1))
                    total_gpu_used += gpu_count
        
        # Determine total GPU capacity based on host type
        host_gpu_capacity = 10 if 'A4000' in hostname else 8
        
        # CRITICAL FIX: If no VMs found, total_gpu_used should definitely be 0
        if len(servers) == 0:
            total_gpu_used = 0
        
        return {
            'gpu_used': total_gpu_used,
            'gpu_capacity': host_gpu_capacity,
            'gpu_usage_ratio': f"{total_gpu_used}/{host_gpu_capacity}"
        }
        
    except Exception as e:
        print(f"❌ GPU Info Agent error for {hostname}: {e}")
        return {
            'gpu_used': 0,
            'gpu_capacity': 8,  # Default to 8 GPUs
            'gpu_usage_ratio': "0/8"
        }

def clear_parallel_cache():
    """Clear the parallel agent cache"""
    global _parallel_cache, _cache_timestamps
    cleared_count = len(_parallel_cache)
    _parallel_cache.clear()
    _cache_timestamps.clear()
    print(f"🧹 Cleared {cleared_count} items from parallel cache")
    return cleared_count

def force_cache_refresh():
    """Force immediate cache refresh by clearing and re-fetching"""
    print("🔄 FORCING IMMEDIATE CACHE REFRESH...")
    clear_parallel_cache()
    return get_all_data_parallel()

def get_parallel_cache_stats():
    """Get parallel cache statistics"""
    return {
        'cached_datasets': len(_parallel_cache),
        'cache_ttl_seconds': PARALLEL_CACHE_TTL,
        'oldest_entry_age': min([
            time.time() - ts for ts in _cache_timestamps.values()
        ]) if _cache_timestamps else 0
    }

def update_host_vm_count_in_cache(hostname, new_vm_count):
    """
    Intelligently update a specific host's VM count in the cache without full refresh
    This keeps the cache fresh while providing instant UI feedback
    """
    cache_key = "all_parallel_data"
    
    with _cache_lock:
        if cache_key not in _parallel_cache:
            print(f"⚠️ No cache data to update for {hostname}")
            return False
        
        cache_data = _parallel_cache[cache_key]
        updated_count = 0
        
        # Search through all GPU types to find this host
        for gpu_type, gpu_data in cache_data.items():
            if 'hosts' in gpu_data:
                for host_detail in gpu_data['hosts']:
                    if host_detail['hostname'] == hostname:
                        old_count = host_detail['vm_count']
                        host_detail['vm_count'] = new_vm_count
                        updated_count += 1
                        print(f"🔄 Updated {hostname} VM count: {old_count} -> {new_vm_count} in {gpu_type} cache")
        
        if updated_count > 0:
            print(f"✅ Successfully updated VM count for {hostname} in {updated_count} cache locations")
            return True
        else:
            print(f"⚠️ Host {hostname} not found in cache data")
            return False

def update_host_aggregate_in_cache(hostname, old_aggregate, new_aggregate):
    """
    Intelligently update a host's aggregate location in cache (for migrations)
    This moves the host data between aggregates without full refresh
    """
    cache_key = "all_parallel_data"
    
    with _cache_lock:
        if cache_key not in _parallel_cache:
            print(f"⚠️ No cache data to update for {hostname}")
            return False
        
        cache_data = _parallel_cache[cache_key]
        host_data_to_move = None
        
        # Find and remove the host from its current location
        for gpu_type, gpu_data in cache_data.items():
            if 'hosts' in gpu_data:
                for i, host_detail in enumerate(gpu_data['hosts']):
                    if host_detail['hostname'] == hostname and host_detail['aggregate'] == old_aggregate:
                        host_data_to_move = gpu_data['hosts'].pop(i)
                        host_data_to_move['aggregate'] = new_aggregate  # Update aggregate
                        gpu_data['total_hosts'] -= 1
                        print(f"📤 Removed {hostname} from {old_aggregate} in {gpu_type} cache")
                        break
        
        if not host_data_to_move:
            print(f"⚠️ Host {hostname} not found in {old_aggregate}")
            return False
        
        # Add the host to its new location
        for gpu_type, gpu_data in cache_data.items():
            if 'hosts' in gpu_data:
                # Check if any host in this GPU type belongs to the new aggregate
                for host_detail in gpu_data['hosts']:
                    if host_detail['aggregate'] == new_aggregate:
                        gpu_data['hosts'].append(host_data_to_move)
                        gpu_data['total_hosts'] += 1
                        print(f"📥 Added {hostname} to {new_aggregate} in {gpu_type} cache")
                        return True
        
        print(f"⚠️ Could not find destination aggregate {new_aggregate} in cache")
        return False