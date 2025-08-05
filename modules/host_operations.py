#!/usr/bin/env python3

import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from .openstack_operations import get_openstack_connection
from .utility_functions import extract_gpu_count_from_flavor

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

def get_bulk_gpu_info(hostnames, max_workers=10):
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