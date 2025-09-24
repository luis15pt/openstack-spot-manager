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

# =============================================================================
# PERFORMANCE OPTIMIZED FUNCTIONS - CACHE-FIRST APPROACH
# =============================================================================

def get_gpu_type_from_hostname_fast(hostname):
    """Extract GPU type from hostname pattern without any API calls

    This is the fastest method - uses hostname patterns only.
    Falls back to None if pattern doesn't match, allowing cache lookup.
    """
    hostname_lower = hostname.lower()
    print(f"🔍 DEBUG: Fast hostname pattern check for {hostname} (lowercase: {hostname_lower})")

    # Pattern matching for common hostname formats
    if 'h200sxm' in hostname_lower or 'h200-sxm' in hostname_lower:
        print(f"🎯 DEBUG: Matched H200-SXM5 pattern")
        return 'H200-SXM5'
    elif 'h100sxm' in hostname_lower or 'h100-sxm' in hostname_lower:
        print(f"🎯 DEBUG: Matched H100-SXM5 pattern")
        return 'H100-SXM5'
    elif 'h100' in hostname_lower:
        print(f"🎯 DEBUG: Matched H100 pattern")
        return 'H100'
    elif 'a100' in hostname_lower:
        print(f"🎯 DEBUG: Matched A100 pattern")
        return 'A100'
    elif 'rtx-a6000' in hostname_lower or 'rtx_a6000' in hostname_lower:
        print(f"🎯 DEBUG: Matched RTX-A6000 pattern")
        return 'RTX-A6000'
    elif 'rtx6000pro' in hostname_lower or 'rtx-6000-pro' in hostname_lower:
        print(f"🎯 DEBUG: Matched RTX-PRO6000-SE pattern")
        return 'RTX-PRO6000-SE'
    elif 'l40' in hostname_lower:
        print(f"🎯 DEBUG: Matched L40 pattern")
        return 'L40'
    elif 'a4000' in hostname_lower:
        print(f"🎯 DEBUG: Matched A4000 pattern")
        return 'A4000'

    print(f"🔍 DEBUG: No hostname pattern matched for {hostname}, will try cache lookup")
    return None  # Pattern didn't match, need to use cache lookup

def find_gpu_type_in_parallel_data(hostname, parallel_data):
    """Find GPU type for hostname in parallel agents cached data"""
    try:
        for gpu_type, gpu_data in parallel_data.items():
            hosts = gpu_data.get('hosts', [])
            for host_info in hosts:
                if host_info.get('hostname') == hostname:
                    return gpu_type
        return None
    except Exception as e:
        print(f"❌ Error finding GPU type in parallel data for {hostname}: {e}")
        return None

def get_gpu_type_from_hostname_context_optimized(hostname):
    """Optimized GPU type detection using hostname pattern + cached data only
    
    Priority order:
    1. Fast hostname pattern matching (no API calls)
    2. Parallel agents cached data (uses cache if available)
    3. No expensive OpenStack discovery calls
    """
    try:
        # Try fast hostname pattern first
        gpu_type = get_gpu_type_from_hostname_fast(hostname)
        if gpu_type:
            print(f"✅ GPU type {gpu_type} extracted from hostname pattern: {hostname}")
            return gpu_type
        
        # Fallback to parallel cache lookup (still no OpenStack API calls)
        from .parallel_agents import get_all_data_parallel
        parallel_data = get_all_data_parallel()  # Uses cache if available
        gpu_type = find_gpu_type_in_parallel_data(hostname, parallel_data)
        
        if gpu_type:
            print(f"✅ GPU type {gpu_type} found in parallel cache for hostname: {hostname}")
            return gpu_type
        
        print(f"⚠️ GPU type not found for hostname {hostname} - no expensive discovery performed")
        return None
        
    except Exception as e:
        print(f"❌ Error in optimized GPU type detection for {hostname}: {e}")
        return None

def build_flavor_name_optimized(hostname):
    """Build dynamic flavor name using cache-first approach - NO OpenStack API calls
    
    This function should never trigger OpenStack API calls during RunPod operations.
    Uses hostname patterns + cached parallel data only, includes NVLink support.
    """
    try:
        # Get GPU type using optimized cache-first method
        gpu_type = get_gpu_type_from_hostname_context_optimized(hostname)
        
        # Get GPU count from hostname (this doesn't make API calls)
        from .utility_functions import get_gpu_count_from_hostname
        gpu_count = get_gpu_count_from_hostname(hostname)
        
        # Get NVLink info from parallel cache if available
        has_nvlinks = False
        try:
            from .parallel_agents import get_all_data_parallel
            parallel_data = get_all_data_parallel()  # Uses cache if available
            
            # Find hostname in parallel data to get NVLink info
            for gpu_data in parallel_data.values():
                hosts = gpu_data.get('hosts', [])
                for host_info in hosts:
                    if host_info.get('hostname') == hostname:
                        tenant_info = host_info.get('tenant_info', {})
                        has_nvlinks = tenant_info.get('nvlinks', False)
                        break
                if has_nvlinks:
                    break
        except Exception as e:
            print(f"⚠️ Could not get NVLink info from cache for {hostname}: {e}")
        
        if gpu_type:
            base_flavor = f"n3-{gpu_type}x{gpu_count}"
            
            # Add NVLink suffix for supported GPU types that have NVLinks
            if has_nvlinks and gpu_type in ['H100', 'A100']:
                flavor_name = f"{base_flavor}-NVLink"
                print(f"✅ Built NVLink flavor name {flavor_name} for {hostname} (cache-optimized, no API calls)")
            else:
                flavor_name = base_flavor
                print(f"✅ Built flavor name {flavor_name} for {hostname} (cache-optimized, no API calls)")
            
            return flavor_name
        
        # Fallback with default GPU type
        fallback_gpu = 'RTX-A6000'  # Safe default
        flavor_name = f"n3-{fallback_gpu}x{gpu_count}"
        print(f"⚠️ Using fallback flavor name {flavor_name} for {hostname}")
        return flavor_name
        
    except Exception as e:
        print(f"❌ Error building optimized flavor name for {hostname}: {e}")
        # Safe fallback
        return f"n3-RTX-A6000x8"

def get_target_aggregate_optimized(hostname, target_type, target_variant=None):
    """Determine target aggregate using cached parallel data only - NO OpenStack discovery
    
    This replaces the expensive discover_gpu_aggregates() call with cached data lookup.
    """
    try:
        # Get GPU type using optimized method (no API calls)
        gpu_type = get_gpu_type_from_hostname_context_optimized(hostname)
        
        if not gpu_type:
            print(f"❌ Could not determine GPU type for {hostname}")
            return None
        
        # Get configuration from parallel cache instead of discover_gpu_aggregates()
        from .parallel_agents import get_all_data_parallel
        parallel_data = get_all_data_parallel()  # Uses cache if available
        
        if gpu_type not in parallel_data:
            print(f"❌ GPU type {gpu_type} not found in cached parallel data")
            return None
        
        config = parallel_data[gpu_type]['config']
        
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
        
        if target_aggregate:
            print(f"✅ Target aggregate {target_aggregate} found for {hostname} -> {target_type} (cache-optimized)")
            return {
                'hostname': hostname,
                'gpu_type': gpu_type,
                'target_type': target_type,
                'target_aggregate': target_aggregate
            }
        
        print(f"❌ No target aggregate found for GPU type {gpu_type} and target type {target_type}")
        return None
        
    except Exception as e:
        print(f"❌ Error in optimized target aggregate lookup: {e}")
        return None