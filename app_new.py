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
import threading

# Import from modules
from modules.openstack_operations import get_openstack_connection, find_aggregate_by_name, run_openstack_command
from modules.netbox_operations import get_netbox_tenants_bulk, get_netbox_tenant
from modules.aggregate_operations import (discover_gpu_aggregates, get_aggregate_hosts, 
                                         find_host_current_aggregate, get_gpu_type_from_hostname_context, 
                                         build_flavor_name, get_contract_aggregates_for_gpu_type)
from modules.host_operations import (get_host_gpu_info, get_host_gpu_info_with_debug, get_bulk_gpu_info, 
                                    get_host_vm_count, get_host_vm_count_with_debug, get_bulk_vm_counts, get_host_vms)
from modules.utility_functions import (extract_gpu_count_from_flavor, get_gpu_type_from_aggregate, 
                                      get_gpu_count_from_hostname, mask_api_key, log_command, command_log, AGGREGATE_PAIRS)

# Load environment variables
load_dotenv()

app = Flask(__name__)

# NetBox configuration
NETBOX_URL = os.getenv('NETBOX_URL')
NETBOX_API_KEY = os.getenv('NETBOX_API_KEY')

# Hyperstack API configuration for Runpod launches
HYPERSTACK_API_URL = os.getenv('HYPERSTACK_API_URL', 'https://infrahub-api.nexgencloud.com/v1')
HYPERSTACK_API_KEY = os.getenv('HYPERSTACK_API_KEY')
RUNPOD_API_KEY = os.getenv('RUNPOD_API_KEY')
HYPERSTACK_FIREWALL_CA1_ID = os.getenv('HYPERSTACK_FIREWALL_CA1_ID', '971')  # Firewall ID for CA1 hosts

# Cache for NetBox tenant lookups to avoid repeated API calls
_tenant_cache = {}

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

# New route for contract aggregates
@app.route('/api/contract-aggregates/<gpu_type>')
def get_contract_aggregates(gpu_type):
    """Get contract aggregates for a specific GPU type"""
    try:
        contracts = get_contract_aggregates_for_gpu_type(gpu_type)
        
        # Get detailed information for each contract aggregate
        contract_details = []
        for contract in contracts:
            aggregate_name = contract['aggregate']
            hosts = get_aggregate_hosts(aggregate_name)
            
            # Get host details with tenant information
            host_details = []
            if hosts:
                tenant_info = get_netbox_tenants_bulk(hosts)
                vm_counts = get_bulk_vm_counts(hosts, max_workers=5)
                gpu_info = get_bulk_gpu_info(hosts, max_workers=5)
                
                for host in hosts:
                    host_detail = {
                        'hostname': host,
                        'tenant': tenant_info.get(host, {}).get('tenant', 'Unknown'),
                        'owner_group': tenant_info.get(host, {}).get('owner_group', 'Investors'),
                        'vm_count': vm_counts.get(host, 0),
                        'gpu_info': gpu_info.get(host, {'gpu_used': 0, 'gpu_capacity': 8, 'gpu_usage_ratio': '0/8'})
                    }
                    host_details.append(host_detail)
            
            contract_details.append({
                'name': aggregate_name,
                'aggregate': aggregate_name,
                'hosts': host_details,
                'host_count': len(hosts)
            })
        
        return jsonify({
            'gpu_type': gpu_type,
            'contracts': contract_details
        })
        
    except Exception as e:
        print(f"❌ Error getting contract aggregates for {gpu_type}: {e}")
        return jsonify({'error': str(e)}), 500