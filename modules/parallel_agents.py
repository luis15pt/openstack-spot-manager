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
        with ThreadPoolExecutor(max_workers=5) as executor:
            # Submit all agent tasks
            futures = {
                'netbox': executor.submit(netbox_agent),
                'aggregates': executor.submit(aggregate_agent), 
                'vm_counts': executor.submit(vm_count_agent),
                'gpu_info': executor.submit(gpu_info_agent),
                'compute_services': executor.submit(compute_service_agent)
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
        
        # Process ALL devices for complete inventory tracking
        all_netbox_devices = {}  # ALL devices regardless of status
        active_devices = {}      # Only active devices (for existing compatibility)
        non_active_gpu_devices = []  # Non-active GPU devices for out-of-stock
        
        # Define GPU-related tags and device role patterns (case-insensitive matching)
        gpu_tags = [
            'nvidia-h100-pcie', 'nvidia h100 pcie',
            'nvidia-a100-pcie', 'nvidia a100 pcie', 
            'nvidia-a100-sxm', 'nvidia a100 sxm',
            'nvidia-h100-sxm', 'nvidia h100 sxm',
            'nvidia-rtx-4090', 'nvidia rtx 4090',
            'nvidia-h200-sxm5', 'nvidia h200 sxm5'
        ]
        gpu_server_roles = ['gpu servers', 'gpu-servers', 'gpu server']  # Additional GPU server identification
        
        # Track inventory by status for reconciliation
        status_counts = {}
        gpu_device_counts = {}
        
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
            
            # Track status counts for inventory reconciliation
            status_counts[status_value] = status_counts.get(status_value, 0) + 1
            
            # Check if device has GPU tags or is a GPU server
            device_tags = device.get('tags', [])
            device_tag_names = [tag.get('name', '') for tag in device_tags]
            has_gpu_tag = any(tag_name.lower() in [t.lower() for t in gpu_tags] for tag_name in device_tag_names)
            
            # Also check device role for GPU servers
            device_role = device.get('role', {})
            role_name = device_role.get('name', '').lower() if device_role else ''
            is_gpu_server = role_name in gpu_server_roles or has_gpu_tag
            
            # Extract additional device information
            site = device.get('site', {}).get('name', 'Unknown') if device.get('site') else 'Unknown'
            rack = device.get('rack', {}).get('name', 'Unknown') if device.get('rack') else 'Unknown'
            
            # Create complete device record for ALL devices
            device_record = {
                'hostname': hostname,
                'name': hostname,
                'tenant': tenant_name,
                'owner_group': owner_group,
                'nvlinks': nvlinks,
                'aggregate': aggregate,
                'status': status_value,
                'status_label': status_label,
                'site': site,
                'rack': rack,
                'device_tags': device_tag_names,
                'has_gpu_tag': has_gpu_tag,
                'is_gpu_server': is_gpu_server,
                'gpu_used': 0,
                'gpu_capacity': 8,  # Default assumption
                'gpu_usage_ratio': '0/8',
                'vm_count': 0,
                'has_vms': False
            }
            
            # Add to complete inventory
            all_netbox_devices[hostname] = device_record
            
            # Track GPU device counts by status
            if is_gpu_server:
                if status_value not in gpu_device_counts:
                    gpu_device_counts[status_value] = []
                gpu_device_counts[status_value].append(hostname)
            
            # Add to active devices (for existing compatibility)
            if status_value == 'active':
                active_devices[hostname] = {
                    'tenant': tenant_name,
                    'owner_group': owner_group,
                    'nvlinks': nvlinks,
                    'aggregate': aggregate,
                    'status': status_value
                }
            
            # Track non-active GPU devices for out-of-stock calculation (using the record we already created)
            if status_value != 'active' and is_gpu_server:
                non_active_gpu_devices.append(device_record)
        
        elapsed = time.time() - start_time
        total_gpu_servers = len([d for d in all_netbox_devices.values() if d['is_gpu_server']])
        active_gpu_servers = len([d for d in all_netbox_devices.values() if d['is_gpu_server'] and d['status'] == 'active'])
        
        print(f"📡 NetBox Agent: Complete inventory processed in {elapsed:.2f}s")
        print(f"   📊 Total devices: {len(all_netbox_devices)} ({total_gpu_servers} GPU servers)")
        print(f"   ✅ Active GPU servers: {active_gpu_servers}")
        print(f"   ⚠️ Non-active GPU servers: {len(non_active_gpu_devices)}")
        
        # Print status breakdown for GPU devices
        gpu_status_summary = {}
        gpu_tag_analysis = {}
        h100_devices_debug = []
        
        for device in all_netbox_devices.values():
            if device['is_gpu_server']:
                status = device['status']
                gpu_status_summary[status] = gpu_status_summary.get(status, 0) + 1
                
                # Track GPU tags for debugging
                for tag in device.get('device_tags', []):
                    if tag.lower() not in gpu_tag_analysis:
                        gpu_tag_analysis[tag.lower()] = 0
                    gpu_tag_analysis[tag.lower()] += 1
                
                # Debug H100 devices specifically
                device_tags_lower = [tag.lower() for tag in device.get('device_tags', [])]
                if any('h100' in tag for tag in device_tags_lower):
                    h100_devices_debug.append({
                        'hostname': device['hostname'],
                        'status': device['status'],
                        'tags': device.get('device_tags', []),
                        'aggregate': device.get('aggregate', 'unknown')
                    })
        
        if gpu_status_summary:
            status_breakdown = ', '.join([f"{status}: {count}" for status, count in gpu_status_summary.items()])
            print(f"   📋 GPU server status breakdown: {status_breakdown}")
        
        # Debug output for H100 detection
        print(f"   🔍 H100 devices found in NetBox: {len(h100_devices_debug)}")
        if len(h100_devices_debug) != 100:
            print(f"   ⚠️ Expected 100 H100 devices, found {len(h100_devices_debug)}")
            # Show first few for debugging
            for i, device in enumerate(h100_devices_debug[:5]):
                print(f"      {i+1}. {device['hostname']}: {device['status']}, tags: {device['tags']}")
            if len(h100_devices_debug) > 5:
                print(f"      ... and {len(h100_devices_debug) - 5} more")
        
        # Show GPU tag analysis
        h100_related_tags = {tag: count for tag, count in gpu_tag_analysis.items() if 'h100' in tag}
        if h100_related_tags:
            print(f"   🏷️ H100-related tags: {h100_related_tags}")
        
        print(f"   🏷️ All GPU tags found: {dict(list(gpu_tag_analysis.items())[:10])}")  # Show first 10 tags
        
        return {
            'active_devices': active_devices,      # For existing compatibility
            'non_active_devices': non_active_gpu_devices,  # Non-active GPU devices
            'all_devices': all_netbox_devices,     # Complete inventory
            'inventory_stats': {
                'total_devices': len(all_netbox_devices),
                'total_gpu_servers': total_gpu_servers,
                'active_gpu_servers': active_gpu_servers,
                'non_active_gpu_servers': len(non_active_gpu_devices),
                'status_breakdown': gpu_status_summary,
                'device_counts_by_status': gpu_device_counts
            }
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

def compute_service_agent():
    """Agent 5: Get compute service status for ALL hosts to identify disabled hosts"""
    print("🔧 Compute Service Agent: Getting service status for all hosts...")
    start_time = time.time()
    
    try:
        conn = get_openstack_connection()
        if not conn:
            return {}
        
        # Get all compute services
        services = list(conn.compute.services())
        
        # Filter for nova-compute services and track their status
        compute_services = {}
        disabled_hosts = set()
        
        for service in services:
            if service.binary == 'nova-compute':
                hostname = service.host
                is_enabled = service.status == 'enabled'
                is_up = service.state == 'up'
                
                compute_services[hostname] = {
                    'enabled': is_enabled,
                    'state': service.state,
                    'status': service.status,
                    'updated_at': getattr(service, 'updated_at', None),
                    'disabled_reason': getattr(service, 'disabled_reason', None)
                }
                
                # Track disabled hosts for easy lookup
                if not is_enabled:
                    disabled_hosts.add(hostname)
        
        elapsed = time.time() - start_time
        enabled_count = len([h for h, s in compute_services.items() if s['enabled']])
        disabled_count = len(disabled_hosts)
        
        print(f"🔧 Compute Service Agent: Processed {len(compute_services)} nova-compute services ({enabled_count} enabled, {disabled_count} disabled) in {elapsed:.2f}s")
        
        return {
            'services': compute_services,
            'disabled_hosts': disabled_hosts,
            'enabled_count': enabled_count,
            'disabled_count': disabled_count
        }
        
    except Exception as e:
        print(f"❌ Compute Service Agent failed: {e}")
        return {
            'services': {},
            'disabled_hosts': set(),
            'enabled_count': 0,
            'disabled_count': 0
        }

def organize_parallel_results(results):
    """
    Organize the parallel agent results by GPU type and compute out-of-stock devices
    """
    start_time = time.time()
    
    # Extract NetBox data (enhanced with complete inventory)
    netbox_result = results.get('netbox', {})
    netbox_data = netbox_result.get('active_devices', {}) if isinstance(netbox_result, dict) else {}
    netbox_non_active = netbox_result.get('non_active_devices', []) if isinstance(netbox_result, dict) else []
    all_netbox_devices = netbox_result.get('all_devices', {}) if isinstance(netbox_result, dict) else {}
    netbox_inventory_stats = netbox_result.get('inventory_stats', {}) if isinstance(netbox_result, dict) else {}
    
    aggregate_data = results.get('aggregates', {})
    vm_counts = results.get('vm_counts', {})
    gpu_info = results.get('gpu_info', {})
    compute_services = results.get('compute_services', {})
    
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
    
    # Compute comprehensive out-of-stock devices with full inventory accounting
    disabled_hosts = compute_services.get('disabled_hosts', set())
    outofstock_devices, outofstock_categories, category_counts = compute_comprehensive_outofstock_devices(
        all_netbox_devices, host_to_aggregate, aggregate_to_hosts, disabled_hosts
    )
    
    # Calculate GPU summary for out-of-stock devices
    total_outofstock = len(outofstock_devices)
    total_gpu_capacity = total_outofstock * 8  # Assume 8 GPUs per device
    gpu_summary = {
        'gpu_used': 0,  # Out of stock devices have 0 GPU usage
        'gpu_capacity': total_gpu_capacity,
        'gpu_usage_ratio': f'0/{total_gpu_capacity}'
    }
    
    # Create comprehensive out-of-stock data structure
    outofstock_data = {
        'hosts': outofstock_devices,
        'gpu_summary': gpu_summary,
        'name': 'Out of Stock',
        'device_count': total_outofstock,
        'categories': outofstock_categories,
        'category_counts': category_counts,
        'breakdown_summary': {
            'netbox_non_active': category_counts.get('netbox_non_active', 0),
            'not_in_openstack': category_counts.get('not_in_openstack', 0), 
            'in_tempest': category_counts.get('in_tempest', 0),
            'compute_disabled': category_counts.get('compute_disabled', 0)
        }
    }
    
    # Add out-of-stock data to the organized results
    organized['outofstock'] = outofstock_data
    
    # INVENTORY VALIDATION: Ensure 100% device accountability
    validate_inventory_accountability(organized, all_netbox_devices, netbox_inventory_stats)
    
    elapsed = time.time() - start_time
    print(f"🏁 Organized parallel results: {len(organized)-1} GPU types + out-of-stock ({total_outofstock} devices) in {elapsed:.2f}s")
    
    return organized

def compute_comprehensive_outofstock_devices(all_netbox_devices, host_to_aggregate, aggregate_to_hosts, disabled_hosts):
    """
    Compute complete out-of-stock devices using comprehensive inventory accounting:
    1. NetBox non-active devices (failed, offline, RMA, etc.)
    2. NetBox active devices NOT in productive OpenStack aggregates
    3. NetBox active devices in "tempest" aggregate (testing/staging)
    4. NetBox active devices with disabled compute service
    
    This ensures 100% device accountability and host uniqueness across all columns.
    """
    print(f"🔍 Computing comprehensive out-of-stock inventory...")
    
    # Identify tempest and other non-productive aggregates
    tempest_aggregates = set()
    productive_aggregates = set()
    
    for agg_name, hosts in aggregate_to_hosts.items():
        if 'tempest' in agg_name.lower():
            tempest_aggregates.add(agg_name)
        else:
            # Consider all other aggregates as productive (runpod, spot, ondemand, contracts, etc.)
            productive_aggregates.add(agg_name)
    
    tempest_hosts = set()
    for agg_name in tempest_aggregates:
        tempest_hosts.update(aggregate_to_hosts.get(agg_name, []))
    
    productive_openstack_hosts = set()
    for agg_name in productive_aggregates:
        productive_openstack_hosts.update(aggregate_to_hosts.get(agg_name, []))
    
    print(f"   📊 OpenStack aggregates: {len(productive_aggregates)} productive, {len(tempest_aggregates)} tempest")
    print(f"   🖥️ Host distribution: {len(productive_openstack_hosts)} productive, {len(tempest_hosts)} tempest, {len(disabled_hosts)} disabled")
    
    # Categorize all NetBox GPU devices
    outofstock_categories = {
        'netbox_non_active': [],      # NetBox status != active
        'not_in_openstack': [],       # Active in NetBox but not in any OpenStack aggregate  
        'in_tempest': [],             # Active but in tempest aggregate (testing)
        'compute_disabled': []        # Active but compute service disabled
    }
    
    for hostname, device in all_netbox_devices.items():
        if not device.get('is_gpu_server', False):
            continue  # Skip non-GPU devices
            
        device_status = device.get('status', 'unknown')
        
        # Category 1: NetBox non-active devices (failed, offline, RMA, etc.)
        if device_status != 'active':
            device['outofstock_reason'] = f"NetBox Status: {device.get('status_label', device_status)}"
            outofstock_categories['netbox_non_active'].append(device)
            
        # For active devices, check OpenStack status
        elif device_status == 'active':
            
            # Category 2: Active but compute service disabled
            if hostname in disabled_hosts:
                device['outofstock_reason'] = "OpenStack compute service disabled"
                outofstock_categories['compute_disabled'].append(device)
                
            # Category 3: Active but in tempest aggregate (testing/staging)
            elif hostname in tempest_hosts:
                device['outofstock_reason'] = f"Testing/staging (tempest aggregate)"
                outofstock_categories['in_tempest'].append(device)
                
            # Category 4: Active but not in any OpenStack aggregate
            elif hostname not in productive_openstack_hosts:
                device['outofstock_reason'] = "Not allocated to any productive aggregate"
                outofstock_categories['not_in_openstack'].append(device)
            
            # If we get here, the device is active and in a productive aggregate - should NOT be out of stock
    
    # Combine all out-of-stock devices
    all_outofstock = []
    for category, devices in outofstock_categories.items():
        all_outofstock.extend(devices)
    
    # Log detailed breakdown
    category_counts = {cat: len(devices) for cat, devices in outofstock_categories.items()}
    total_outofstock = len(all_outofstock)
    
    print(f"✅ Out-of-stock computation complete: {total_outofstock} total devices")
    for category, count in category_counts.items():
        if count > 0:
            print(f"   📋 {category.replace('_', ' ').title()}: {count} devices")
    
    return all_outofstock, outofstock_categories, category_counts

def validate_inventory_accountability(organized_results, all_netbox_devices, netbox_inventory_stats):
    """
    Validate that NetBox total equals UI column totals for 100% device accountability
    """
    print(f"🔍 Validating inventory accountability...")
    
    # Count NetBox GPU servers
    netbox_gpu_servers = [d for d in all_netbox_devices.values() if d.get('is_gpu_server', False)]
    netbox_total = len(netbox_gpu_servers)
    
    # Count UI column totals
    ui_total = 0
    column_counts = {}
    
    for gpu_type, data in organized_results.items():
        if gpu_type == 'outofstock':
            count = data.get('device_count', 0) if isinstance(data, dict) else 0
            column_counts['out_of_stock'] = count
        else:
            # Handle both dict and other data types defensively
            if isinstance(data, dict):
                count = data.get('total_hosts', 0)
            else:
                print(f"⚠️ Warning: {gpu_type} data is not dict: {type(data)}")
                count = 0
            column_counts[gpu_type] = count
        ui_total += count
    
    # Validation check
    is_valid = (netbox_total == ui_total)
    status_icon = "✅" if is_valid else "❌"
    
    print(f"{status_icon} Inventory Validation:")
    print(f"   📦 NetBox GPU Servers: {netbox_total}")
    print(f"   🖥️ UI Column Total: {ui_total}")
    
    if not is_valid:
        discrepancy = abs(netbox_total - ui_total)
        print(f"   ⚠️ DISCREPANCY: {discrepancy} devices unaccounted!")
        
        # Detailed breakdown for debugging
        print(f"   📊 Column breakdown:")
        for column, count in column_counts.items():
            print(f"      - {column}: {count}")
            
        # NetBox status breakdown
        netbox_status_breakdown = netbox_inventory_stats.get('status_breakdown', {})
        if netbox_status_breakdown:
            print(f"   📋 NetBox status breakdown:")
            for status, count in netbox_status_breakdown.items():
                print(f"      - {status}: {count}")
    else:
        print(f"   ✅ Perfect accountability: All {netbox_total} GPU servers accounted for")
    
    return is_valid, netbox_total, ui_total, column_counts

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
                        if 'total_hosts' in gpu_data:
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
                        if 'total_hosts' in gpu_data:
                            gpu_data['total_hosts'] += 1
                        print(f"📥 Added {hostname} to {new_aggregate} in {gpu_type} cache")
                        return True
        
        print(f"⚠️ Could not find destination aggregate {new_aggregate} in cache")
        return False