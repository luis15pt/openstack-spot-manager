#!/usr/bin/env python3

import re
from .openstack_operations import get_openstack_connection, find_aggregate_by_name
from .utility_functions import get_gpu_count_from_hostname, get_gpu_type_from_aggregate

def discover_gpu_aggregates():
    """Dynamically discover GPU aggregates from OpenStack with variant support and contract aggregates"""
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