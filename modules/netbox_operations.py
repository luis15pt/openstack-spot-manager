#!/usr/bin/env python3

import requests
import os

# NetBox configuration
NETBOX_URL = os.getenv('NETBOX_URL')
NETBOX_API_KEY = os.getenv('NETBOX_API_KEY')

# Cache for NetBox tenant lookups to avoid repeated API calls
_tenant_cache = {}

def get_netbox_tenants_bulk(hostnames):
    """Get tenant information from NetBox for multiple hostnames at once"""
    global _tenant_cache
    
    # Return default if NetBox is not configured
    if not NETBOX_URL or not NETBOX_API_KEY:
        print("⚠️ NetBox not configured - using default tenant")
        default_result = {'tenant': 'Unknown', 'owner_group': 'Investors', 'nvlinks': False, 'netbox_device_id': None, 'netbox_url': None}
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
        
        # Debug: Show first device structure
        if all_devices and len(all_devices) > 0:
            print(f"🔍 Sample NetBox device structure:")
            sample_device = all_devices[0]
            print(f"  Device name: {sample_device.get('name')}")
            for key in sorted(sample_device.keys()):
                if 'url' in key.lower():
                    print(f"  - {key}: {sample_device.get(key)}")

        # Create a mapping of device name to tenant info
        device_map = {}
        print(f"🔍 Processing {len(all_devices)} devices from NetBox")
        for i, device in enumerate(all_devices):
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
                
                # Debug NetBox device fields for URL extraction
                device_id = device.get('id')
                display_url = device.get('display_url')
                api_url = device.get('url')
                
                print(f"🔍 NetBox device {device_name}:")
                print(f"  - ID: {device_id}")
                print(f"  - display_url: {display_url}")
                print(f"  - url: {api_url}")
                
                result = {
                    'tenant': tenant_name,
                    'owner_group': owner_group,
                    'nvlinks': nvlinks,
                    'netbox_device_id': device_id,
                    'netbox_url': display_url or api_url
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
                default_result = {'tenant': 'Unknown', 'owner_group': 'Investors', 'nvlinks': False, 'netbox_device_id': None, 'netbox_url': None}
                bulk_results[hostname] = default_result
                _tenant_cache[hostname] = default_result
                print(f"⚠️ Device {hostname} not found in NetBox")
        
        print(f"📊 Bulk NetBox lookup completed: {len(bulk_results)} new devices processed")
        
    except Exception as e:
        print(f"❌ NetBox bulk lookup failed: {e}")
        # Fall back to default for all uncached hostnames
        default_result = {'tenant': 'Unknown', 'owner_group': 'Investors', 'nvlinks': False, 'netbox_device_id': None, 'netbox_url': None}
        for hostname in uncached_hostnames:
            bulk_results[hostname] = default_result
            _tenant_cache[hostname] = default_result
    
    # Merge cached and bulk results
    return {**cached_results, **bulk_results}

def get_netbox_tenant(hostname):
    """Get tenant information from NetBox for a single hostname (wrapper for backward compatibility)"""
    return get_netbox_tenants_bulk([hostname])[hostname]

