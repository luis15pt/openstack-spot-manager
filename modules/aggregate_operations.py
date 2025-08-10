#!/usr/bin/env python3

import re
import time
from .openstack_operations import get_openstack_connection, find_aggregate_by_name
from .utility_functions import get_gpu_count_from_hostname, get_gpu_type_from_aggregate

# Cache for host-to-aggregate mappings
_host_aggregate_cache = {}
_host_cache_timestamps = {}
HOST_CACHE_TTL = 3600  # 1 hour - aggregates don't change frequently

# Cache for GPU aggregate discovery - this is the critical optimization
_gpu_aggregates_cache = None
_gpu_aggregates_cache_timestamp = 0
GPU_AGGREGATES_CACHE_TTL = 1800  # 30 minutes - aggressive caching for performance

def discover_gpu_aggregates(force_refresh=False):
    """Dynamically discover GPU aggregates from OpenStack with variant support and contract aggregates - CACHED VERSION"""
    global _gpu_aggregates_cache, _gpu_aggregates_cache_timestamp
    
    now = time.time()
    
    # Check cache first unless force refresh is requested
    if not force_refresh and _gpu_aggregates_cache is not None:
        cache_age = now - _gpu_aggregates_cache_timestamp
        if cache_age < GPU_AGGREGATES_CACHE_TTL:
            print(f"✅ Using cached GPU aggregates (age: {cache_age:.1f}s)")
            return _gpu_aggregates_cache
    
    print(f"🔍 {'Force refreshing' if force_refresh else 'Cache miss - fetching'} GPU aggregates from OpenStack...")
    start_time = time.time()
    
    try:
        conn = get_openstack_connection()
        if not conn:
            return {}
        
        aggregates = list(conn.compute.aggregates())
        gpu_aggregates = {}
        
        # Patterns to match different aggregate types
        import re
        
        for agg in aggregates:
            # Pattern 1: Regular GPU aggregates: GPU-TYPE-n3[-suffix]
            match = re.match(r'^([A-Z0-9-]+)-n3(-NVLink)?(-spot|-runpod)?$', agg.name)
            if match:
                gpu_type = match.group(1)
                nvlink_suffix = match.group(2)  # -NVLink or None
                pool_suffix = match.group(3)   # -spot, -runpod, or None
                
                if gpu_type not in gpu_aggregates:
                    gpu_aggregates[gpu_type] = {
                        'ondemand_variants': [],
                        'spot': None,
                        'runpod': None,
                        'contracts': []  # Add contracts support
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
            
            # Pattern 2: Contract aggregates: Contract-* or contract-*
            contract_match = re.match(r'^[Cc]ontract-([^-]+)', agg.name)
            if contract_match:
                # Extract GPU type from contract aggregate name
                # Examples: Contract-AI2C-24xA100 -> try to extract A100
                # Look for GPU types in the name
                gpu_type = None
                for possible_gpu in ['A100', 'H100', 'RTX-A6000', 'L40', 'A4000']:
                    if possible_gpu in agg.name:
                        gpu_type = possible_gpu
                        break
                
                # If no GPU type found, try to extract from suffix patterns
                if not gpu_type:
                    # Try patterns like 24xA100, 8xH100, etc.
                    suffix_match = re.search(r'\d+x([A-Z0-9-]+)', agg.name)
                    if suffix_match:
                        gpu_type = suffix_match.group(1)
                
                # Default fallback - use the first part after Contract-
                if not gpu_type:
                    parts = agg.name.split('-')
                    if len(parts) >= 3:
                        # Try to find GPU type in any part
                        for part in parts[2:]:  # Skip 'Contract' and first identifier
                            for possible_gpu in ['A100', 'H100', 'RTX-A6000', 'L40', 'A4000']:
                                if possible_gpu in part:
                                    gpu_type = possible_gpu
                                    break
                            if gpu_type:
                                break
                
                # If still no GPU type, use A100 as default for contracts
                if not gpu_type:
                    gpu_type = 'A100'
                
                if gpu_type not in gpu_aggregates:
                    gpu_aggregates[gpu_type] = {
                        'ondemand_variants': [],
                        'spot': None,
                        'runpod': None,
                        'contracts': []
                    }
                
                gpu_aggregates[gpu_type]['contracts'].append({
                    'aggregate': agg.name,
                    'name': agg.name
                })
        
        # Convert to format compatible with existing code
        result = {}
        for gpu_type, data in gpu_aggregates.items():
            if data['ondemand_variants'] or data['contracts']:  # Include if has ondemand or contracts
                result[gpu_type] = {
                    'ondemand': data['ondemand_variants'][0]['aggregate'] if data['ondemand_variants'] else None,  # Primary for compatibility
                    'ondemand_variants': data['ondemand_variants'],
                    'spot': data['spot'],
                    'runpod': data['runpod'],
                    'contracts': data['contracts']  # Add contracts to result
                }
        
        print(f"📊 Discovered GPU aggregates: {result}")
        
        # Cache the results
        _gpu_aggregates_cache = result
        _gpu_aggregates_cache_timestamp = now
        
        fetch_time = time.time() - start_time
        print(f"⚡ GPU aggregates cached in {fetch_time:.2f}s - will be valid for {GPU_AGGREGATES_CACHE_TTL/60:.1f} minutes")
        
        return result
        
    except Exception as e:
        print(f"❌ Error discovering aggregates: {e}")
        return {}

def get_contract_aggregates_for_gpu_type(gpu_type):
    """Get contract aggregates for a specific GPU type"""
    gpu_aggregates = discover_gpu_aggregates()
    if gpu_type in gpu_aggregates:
        return gpu_aggregates[gpu_type].get('contracts', [])
    return []

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
            # Note: app.debug check removed since app is not available in module
            print(f"📋 Found {len(hosts)} hosts in aggregate {aggregate_name}: {hosts}")
            return hosts
        else:
            print(f"⚠️ Aggregate {aggregate_name} not found")
            return []
            
    except Exception as e:
        print(f"❌ Error getting hosts for aggregate {aggregate_name}: {e}")
        return []

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
            
            # Check contract aggregates
            if config.get('contracts'):
                for contract in config['contracts']:
                    contract_hosts = get_aggregate_hosts(contract['aggregate'])
                    if hostname in contract_hosts:
                        return gpu_type
        
        return None
    except Exception as e:
        print(f"❌ Error getting GPU type for hostname {hostname}: {e}")
        return None

def find_host_current_aggregate(hostname):
    """Find which specific aggregate a host is currently in"""
    try:
        gpu_aggregates = discover_gpu_aggregates()
        for gpu_type, config in gpu_aggregates.items():
            # Check runpod aggregate
            if config.get('runpod'):
                runpod_hosts = get_aggregate_hosts(config['runpod'])
                if hostname in runpod_hosts:
                    print(f"✅ Found {hostname} in runpod aggregate: {config['runpod']}")
                    return config['runpod']
                    
            # Check on-demand variants
            if config.get('ondemand_variants'):
                for variant in config['ondemand_variants']:
                    variant_hosts = get_aggregate_hosts(variant['aggregate'])
                    if hostname in variant_hosts:
                        print(f"✅ Found {hostname} in ondemand variant: {variant['aggregate']}")
                        return variant['aggregate']
                        
            # Check spot aggregate
            if config.get('spot'):
                spot_hosts = get_aggregate_hosts(config['spot'])
                if hostname in spot_hosts:
                    print(f"✅ Found {hostname} in spot aggregate: {config['spot']}")
                    return config['spot']
            
            # Check contract aggregates
            if config.get('contracts'):
                for contract in config['contracts']:
                    contract_hosts = get_aggregate_hosts(contract['aggregate'])
                    if hostname in contract_hosts:
                        print(f"✅ Found {hostname} in contract aggregate: {contract['aggregate']}")
                        return contract['aggregate']
        
        print(f"⚠️ Host {hostname} not found in any aggregate")
        return None
    except Exception as e:
        print(f"❌ Error finding current aggregate for hostname {hostname}: {e}")
        return None

def build_flavor_name(hostname):
    """Build dynamic flavor name like 'n3-RTX-A6000x8' from hostname"""
    gpu_type = get_gpu_type_from_hostname_context(hostname)
    gpu_count = get_gpu_count_from_hostname(hostname)
    
    if gpu_type:
        return f"n3-{gpu_type}x{gpu_count}"
    
    # Fallback: try to extract from hostname pattern if available
    match = re.search(r'(RTX-A6000|A100|H100|L40)', hostname)
    if match:
        return f"n3-{match.group(1)}x{gpu_count}"
    
    # Default fallback
    return f"n3-RTX-A6000x{gpu_count}"

# =============================================================================
# OPTIMIZED CACHE FUNCTIONS
# =============================================================================

def get_host_aggregate_direct(hostname):
    """Find which aggregate a specific host belongs to without scanning all aggregates"""
    try:
        conn = get_openstack_connection()
        if not conn:
            return None
        
        # Early termination - stop as soon as we find the host
        for agg in conn.compute.aggregates():
            if hostname in (agg.hosts or []):
                print(f"✅ Found {hostname} in aggregate: {agg.name}")
                return agg.name
        
        print(f"⚠️ Host {hostname} not found in any aggregate")
        return None
        
    except Exception as e:
        print(f"❌ Error finding aggregate for hostname {hostname}: {e}")
        return None

def get_host_aggregate_with_ttl(hostname, force_refresh=False):
    """Get aggregate for specific host with TTL caching and optional force refresh"""
    global _host_aggregate_cache, _host_cache_timestamps
    
    now = time.time()
    
    # Skip cache if force refresh requested
    if not force_refresh:
        # Check if cached and still valid
        if (hostname in _host_aggregate_cache and 
            hostname in _host_cache_timestamps and 
            (now - _host_cache_timestamps[hostname]) < HOST_CACHE_TTL):
            return _host_aggregate_cache[hostname]
    
    # Cache miss, expired, or force refresh - fetch fresh data
    print(f"🔍 {'Force refreshing' if force_refresh else 'Cache miss for'} aggregate lookup: {hostname}")
    aggregate = get_host_aggregate_direct(hostname)
    
    # Update cache
    _host_aggregate_cache[hostname] = aggregate
    _host_cache_timestamps[hostname] = now
    
    return aggregate

def get_gpu_type_from_hostname_context_optimized(hostname, force_refresh=False):
    """Optimized version that uses cached host-to-aggregate lookup"""
    try:
        aggregate_name = get_host_aggregate_with_ttl(hostname, force_refresh)
        if not aggregate_name:
            return None
        
        # Extract GPU type from aggregate name
        import re
        match = re.match(r'^([A-Z0-9-]+)-n3', aggregate_name)
        if match:
            return match.group(1)
        
        # Handle contract aggregates
        if re.search(r'contract', aggregate_name, re.IGNORECASE):
            # Look for GPU types in the aggregate name
            for possible_gpu in ['H100-SXM5', 'H100', 'A100', 'RTX-A6000', 'L40', 'A4000']:
                if possible_gpu in aggregate_name:
                    return possible_gpu
        
        return None
        
    except Exception as e:
        print(f"❌ Error getting GPU type for hostname {hostname}: {e}")
        return None

def find_host_current_aggregate_optimized(hostname, force_refresh=False):
    """Optimized version that uses cached lookup instead of scanning all aggregates"""
    return get_host_aggregate_with_ttl(hostname, force_refresh)

def clear_host_aggregate_cache(hostname=None):
    """Clear cache for specific hostname or all hostnames"""
    global _host_aggregate_cache, _host_cache_timestamps
    
    if hostname:
        # Clear specific hostname
        cleared = []
        if hostname in _host_aggregate_cache:
            del _host_aggregate_cache[hostname]
            cleared.append('aggregate')
        if hostname in _host_cache_timestamps:
            del _host_cache_timestamps[hostname]
        return cleared
    else:
        # Clear all cache
        host_count = len(_host_aggregate_cache)
        _host_aggregate_cache.clear()
        _host_cache_timestamps.clear()
        return host_count

def get_host_cache_stats():
    """Get current cache statistics"""
    return {
        'host_aggregate_cache_size': len(_host_aggregate_cache),
        'cache_timestamps': len(_host_cache_timestamps),
        'cache_ttl_seconds': HOST_CACHE_TTL
    }

def clear_gpu_aggregates_cache():
    """Clear the GPU aggregates cache to force refresh on next call"""
    global _gpu_aggregates_cache, _gpu_aggregates_cache_timestamp
    _gpu_aggregates_cache = None
    _gpu_aggregates_cache_timestamp = 0
    return True

def get_gpu_aggregates_cache_stats():
    """Get GPU aggregates cache statistics"""
    cache_age = time.time() - _gpu_aggregates_cache_timestamp if _gpu_aggregates_cache_timestamp > 0 else 0
    return {
        'gpu_aggregates_cached': _gpu_aggregates_cache is not None,
        'cache_age_seconds': cache_age,
        'cache_ttl_seconds': GPU_AGGREGATES_CACHE_TTL,
        'cache_valid': _gpu_aggregates_cache is not None and cache_age < GPU_AGGREGATES_CACHE_TTL
    }