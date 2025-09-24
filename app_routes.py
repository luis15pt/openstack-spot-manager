#!/usr/bin/env python3

from flask import render_template, jsonify, request, send_from_directory
import json
import requests
import time
import threading

# Import all business logic functions
from app_business_logic import *

def register_routes(app):
    """Register all routes with the Flask app"""
    
    def get_parallel_gpu_types():
        """Get GPU types from parallel agents data instead of discover_gpu_aggregates()"""
        try:
            parallel_data = get_all_data_parallel()
            return list(parallel_data.keys())
        except Exception as e:
            print(f"❌ Error getting GPU types from parallel data: {e}")
            return []
    
    def get_parallel_gpu_config(gpu_type):
        """Get GPU configuration from parallel agents data"""
        try:
            parallel_data = get_all_data_parallel()
            return parallel_data.get(gpu_type, {}).get('config')
        except Exception as e:
            print(f"❌ Error getting GPU config for {gpu_type}: {e}")
            return None
    
    @app.route('/')
    def index():
        return render_template('index.html')
    
    @app.route('/dashboard')
    def dashboard():
        return render_template('index.html')
    
    @app.route('/docs')
    def api_docs():
        """Swagger UI for API documentation"""
        return render_template('swagger.html')
    
    @app.route('/api/openapi.json')
    def openapi_spec():
        """OpenAPI specification"""
        return send_from_directory('static', 'openapi.json')

    @app.route('/api/gpu-types')
    def get_gpu_types():
        """Get available GPU types from parallel agents data - OPTIMIZED"""
        try:
            parallel_data = get_all_data_parallel()
            # Filter out internal keys (starting with _) from GPU types
            gpu_types = [key for key in parallel_data.keys() if not key.startswith('_')]
            
            # Build aggregates info from parallel data (excluding internal keys)
            aggregates_info = {}
            for gpu_type, data in parallel_data.items():
                if not gpu_type.startswith('_'):
                    aggregates_info[gpu_type] = data.get('config', {})
            
            return jsonify({
                'gpu_types': gpu_types,
                'aggregates': aggregates_info,
                'parallel_data': parallel_data  # Include full parallel data for frontend optimization
            })
        except Exception as e:
            print(f"❌ Error getting GPU types: {e}")
            return jsonify({'error': str(e)}), 500

    @app.route('/api/contract-aggregates/<gpu_type>')
    def get_contract_aggregates(gpu_type):
        """Get contract aggregates for a specific GPU type - OPTIMIZED"""
        try:
            parallel_data = get_all_data_parallel()
            
            if gpu_type not in parallel_data:
                return jsonify({'error': f'GPU type {gpu_type} not found'}), 400
            
            gpu_config = parallel_data[gpu_type].get('config', {})
            contracts = gpu_config.get('contracts', [])
            
            # Get detailed information for each contract aggregate using pre-collected data
            all_hosts_data = parallel_data[gpu_type].get('hosts', [])
            contract_details = []
            
            for contract in contracts:
                aggregate_name = contract['aggregate']
                
                # Filter hosts that belong to this contract aggregate from pre-collected data
                contract_hosts = [
                    host for host in all_hosts_data 
                    if host.get('aggregate') == aggregate_name
                ]
                
                print(f"⚡ Using pre-collected data for {len(contract_hosts)} hosts in contract {aggregate_name}")
                
                contract_details.append({
                    'name': aggregate_name,
                    'aggregate': aggregate_name,
                    'hosts': contract_hosts,
                    'host_count': len(contract_hosts)
                })
            
            return jsonify({
                'gpu_type': gpu_type,
                'contracts': contract_details
            })
            
        except Exception as e:
            print(f"❌ Error getting contract aggregates for {gpu_type}: {e}")
            return jsonify({'error': str(e)}), 500

    @app.route('/api/aggregates/<gpu_type>/<aggregate_type>')
    def get_specific_aggregate_data(gpu_type, aggregate_type):
        """Get data for a specific aggregate type (runpod, ondemand, or spot) - OPTIMIZED"""
        try:
            # This endpoint is temporarily disabled during optimization
            return jsonify({
                'error': 'Endpoint temporarily disabled during optimization',
                'message': 'Please use /api/aggregates/<gpu_type> for complete data',
                'status': 'under_optimization'
            }), 501
            
        except Exception as e:
            print(f"❌ Error in specific aggregate data: {e}")
            return jsonify({'error': str(e)}), 500

    @app.route('/api/aggregates/<gpu_type>')
    def get_aggregate_data(gpu_type):
        """Get aggregate data for a specific GPU type using parallel agents system
        
        Query Parameters:
        - summary_only=true: Return only host counts and basic info (fast)
        - include_vms=false: Skip VM count queries (faster)  
        - include_gpu_info=false: Skip GPU info queries (faster)
        """
        try:
            from modules.parallel_agents import get_all_data_parallel
            from flask import request
            
            # Parse optimization flags
            summary_only = request.args.get('summary_only', 'false').lower() == 'true'
            include_vms = request.args.get('include_vms', 'true').lower() == 'true'
            include_gpu_info = request.args.get('include_gpu_info', 'true').lower() == 'true'
            
            # Performance tracking
            start_time = time.time()
            optimization_note = ""
            if summary_only:
                optimization_note = " (SUMMARY MODE - counts only)"
            elif not include_vms or not include_gpu_info:
                optimization_note = f" (OPTIMIZED - vms={include_vms}, gpu={include_gpu_info})"
            
            print(f"🚀 Loading GPU type '{gpu_type}' using PARALLEL AGENTS system{optimization_note}...")
            
            # Get all data using parallel agents
            organized_data = get_all_data_parallel()
            
            if gpu_type not in organized_data:
                return jsonify({'error': 'Invalid GPU type'}), 400
            
            gpu_data = organized_data[gpu_type]
            
            # Special handling for outofstock which has different structure
            if gpu_type == 'outofstock':
                hosts_data = gpu_data.get('hosts', [])
                print(f"🔍 DEBUG: Outofstock API called")
                print(f"🔍 DEBUG: organized_data keys: {list(organized_data.keys())}")
                print(f"🔍 DEBUG: gpu_data type: {type(gpu_data)}, keys: {list(gpu_data.keys()) if gpu_data else 'None'}")
                print(f"🔍 DEBUG: Outofstock hosts count: {len(hosts_data)}")
                if hosts_data:
                    print(f"🔍 DEBUG: First 3 outofstock hostnames: {[h.get('hostname', 'unknown') for h in hosts_data[:3]]}")
                
                return jsonify({
                    'gpu_type': 'outofstock',
                    'outofstock': {
                        'name': gpu_data.get('name', 'Out of Stock'),
                        'hosts': hosts_data,
                        'gpu_summary': gpu_data.get('gpu_summary', {
                            'gpu_used': 0,
                            'gpu_capacity': 0,
                            'gpu_usage_ratio': '0/0'
                        })
                    },
                    'performance_stats': {
                        'total_time': 0.01,  # Already cached
                        'total_hosts': len(hosts_data),
                        'hosts_per_second': 0,
                        'method': 'parallel_agents_cached'
                    }
                })
            
            config = gpu_data['config']
            all_hosts = gpu_data['hosts']
            
            # Check if new outofstock structure exists
            outofstock_hosts = []
            if 'outofstock' in gpu_data:
                outofstock_hosts = gpu_data['outofstock'].get('hosts', [])
                print(f"🔍 DEBUG: Found {len(outofstock_hosts)} outofstock hosts in parallel data")
            
            # Organize hosts by aggregate type from parallel data
            ondemand_hosts = []
            runpod_hosts = []
            spot_hosts = []
            contract_hosts = []
            ondemand_host_variants = {}
            contract_host_mappings = {}  # hostname -> contract info
            
            for host_data in all_hosts:
                hostname = host_data['hostname']
                aggregate = host_data['aggregate']

                # Determine aggregate type
                if config.get('runpod') and aggregate == config['runpod']:
                    runpod_hosts.append(hostname)
                elif config.get('spot') and aggregate == config['spot']:
                    spot_hosts.append(hostname)
                elif config.get('ondemand_variants'):
                    for variant in config['ondemand_variants']:
                        if aggregate == variant['aggregate']:
                            ondemand_hosts.append(hostname)
                            ondemand_host_variants[hostname] = variant['variant']
                            break

                # Check contracts separately (not elif - contracts can coexist with other types)
                if config.get('contracts'):
                    for contract in config['contracts']:
                        if aggregate == contract['aggregate']:
                            contract_hosts.append(hostname)
                            # Store contract info for this host (similar to ondemand variants)
                            contract_host_mappings[hostname] = {
                                'contract_aggregate': contract['aggregate'],
                                'contract_name': contract['name']
                            }
                            break
            
            def process_hosts_from_parallel_data(host_list, aggregate_type):
                """Process hosts using data from parallel agents"""
                processed = []
                for hostname in host_list:
                    # Find the host data from parallel results
                    host_info = next((h for h in all_hosts if h['hostname'] == hostname), None)
                    if not host_info:
                        print(f"⚠️ Host {hostname} not found in parallel data for {aggregate_type}")
                        continue
                    
                    # Handle tenant_info from both old and new data structures
                    tenant_info = host_info.get('tenant_info', {
                        'tenant': host_info.get('tenant', 'Unknown'),
                        'owner_group': host_info.get('owner_group', 'Investors'), 
                        'nvlinks': host_info.get('nvlinks', False),
                        'netbox_device_id': host_info.get('netbox_device_id'),
                        'netbox_url': host_info.get('netbox_url')
                    })
                    
                    # OPTIMIZATION: Skip expensive data based on flags
                    vm_count = host_info['vm_count'] if include_vms else 0
                    
                    # GPU data is stored directly in host_info, not nested under 'gpu_info'
                    if include_gpu_info:
                        gpu_info = {
                            'gpu_used': host_info.get('gpu_used', 0),
                            'gpu_capacity': host_info.get('gpu_capacity', 8), 
                            'gpu_usage_ratio': host_info.get('gpu_usage_ratio', '0/8')
                        }
                    else:
                        gpu_info = {'gpu_used': 0, 'gpu_capacity': 8, 'gpu_usage_ratio': '0/8'}
                    
                    if aggregate_type in ['spot', 'ondemand', 'contracts']:
                        host_data = {
                            'name': hostname,
                            'vm_count': vm_count,
                            'has_vms': vm_count > 0,
                            'tenant': tenant_info['tenant'],
                            'owner_group': tenant_info['owner_group'],
                            'nvlinks': tenant_info['nvlinks'],
                            'netbox_device_id': tenant_info['netbox_device_id'],
                            'netbox_url': tenant_info['netbox_url'],
                            'gpu_used': gpu_info['gpu_used'],
                            'gpu_capacity': gpu_info['gpu_capacity'],
                            'gpu_usage_ratio': gpu_info['gpu_usage_ratio']
                        }
                        # Add variant information for on-demand hosts
                        if aggregate_type == 'ondemand' and hostname in ondemand_host_variants:
                            host_data['variant'] = ondemand_host_variants[hostname]
                        # Add contract information for contract hosts
                        elif aggregate_type == 'contracts' and hostname in contract_host_mappings:
                            contract_info = contract_host_mappings[hostname]
                            host_data['contract_aggregate'] = contract_info['contract_aggregate']
                            host_data['contract_name'] = contract_info['contract_name']
                    else:
                        # For Runpod hosts
                        host_data = {
                            'name': hostname,
                            'vm_count': vm_count,
                            'has_vms': vm_count > 0,
                            'tenant': tenant_info['tenant'],
                            'owner_group': tenant_info['owner_group'],
                            'nvlinks': tenant_info['nvlinks'],
                            'netbox_device_id': tenant_info['netbox_device_id'],
                            'netbox_url': tenant_info['netbox_url'],
                            'gpu_used': gpu_info['gpu_used'],
                            'gpu_capacity': gpu_info['gpu_capacity'],
                            'gpu_usage_ratio': gpu_info['gpu_usage_ratio']
                        }
                    
                    processed.append(host_data)
                
                return processed
            
            # OPTIMIZATION: Fast path for summary_only requests
            if summary_only:
                total_time = time.time() - start_time
                print(f"📊 SUMMARY MODE: {len(ondemand_hosts)} ondemand, {len(runpod_hosts)} runpod, {len(spot_hosts)} spot, {len(contract_hosts)} contracts")
                print(f"⚡ Summary completed in {total_time:.2f}s (skipped expensive processing)")
                
                return jsonify({
                    'gpu_type': gpu_type,
                    'summary_only': True,
                    'ondemand': {
                        'name': config.get('ondemand_variants', [{}])[0].get('variant', f'{gpu_type}-n3'),
                        'host_count': len(ondemand_hosts),
                        'host_names': ondemand_hosts
                    },
                    'runpod': {
                        'name': config.get('runpod', 'N/A'),
                        'host_count': len(runpod_hosts),
                        'host_names': runpod_hosts
                    },
                    'spot': {
                        'name': config.get('spot', 'N/A'),
                        'host_count': len(spot_hosts),
                        'host_names': spot_hosts
                    },
                    'contracts': {
                        'name': f'Contracts ({len(config.get("contracts", []))} contracts)',
                        'host_count': len(contract_hosts),
                        'host_names': contract_hosts
                    },
                    'performance': {
                        'total_time': total_time,
                        'total_hosts': len(ondemand_hosts) + len(runpod_hosts) + len(spot_hosts) + len(contract_hosts)
                    }
                })

            # Process all four aggregate types using parallel data
            processing_start = time.time()
            print(f"🏗️ Processing {len(ondemand_hosts)} ondemand hosts from parallel data...")
            ondemand_data = process_hosts_from_parallel_data(ondemand_hosts, 'ondemand')
            
            print(f"🏗️ Processing {len(runpod_hosts)} runpod hosts from parallel data...")
            runpod_data = process_hosts_from_parallel_data(runpod_hosts, 'runpod')
            
            print(f"🏗️ Processing {len(spot_hosts)} spot hosts from parallel data...")
            spot_data = process_hosts_from_parallel_data(spot_hosts, 'spot')
            
            print(f"🏗️ Processing {len(contract_hosts)} contract hosts from parallel data...")
            contract_data = process_hosts_from_parallel_data(contract_hosts, 'contracts')
            
            processing_time = time.time() - processing_start
            print(f"🏁 All host processing completed in {processing_time:.2f}s")
            
            # Calculate GPU summary statistics for On-Demand and Spot only
            # Use pre-calculated GPU summaries from backend instead of recalculating
            # The backend finalize_gpu_column() already calculated these correctly
            ondemand_gpu_summary = gpu_data.get('ondemand', {}).get('gpu_summary', {'gpu_used': 0, 'gpu_capacity': 0, 'gpu_usage_ratio': '0/0'})
            runpod_gpu_summary = gpu_data.get('runpod', {}).get('gpu_summary', {'gpu_used': 0, 'gpu_capacity': 0, 'gpu_usage_ratio': '0/0'})  
            spot_gpu_summary = gpu_data.get('spot', {}).get('gpu_summary', {'gpu_used': 0, 'gpu_capacity': 0, 'gpu_usage_ratio': '0/0'})
            contract_gpu_summary = gpu_data.get('contract', {}).get('gpu_summary', {'gpu_used': 0, 'gpu_capacity': 0, 'gpu_usage_ratio': '0/0'})
            outofstock_gpu_summary = gpu_data.get('outofstock', {}).get('gpu_summary', {'gpu_used': 0, 'gpu_capacity': 0, 'gpu_usage_ratio': '0/0'})
            
            # Debug GPU summaries to understand frontend issue
            print(f"🔍 DEBUG API: {gpu_type} GPU summaries:")
            print(f"  OnDemand: {ondemand_gpu_summary}")  
            print(f"  RunPod: {runpod_gpu_summary}")
            print(f"  Spot: {spot_gpu_summary}")
            print(f"  Contracts: {contract_gpu_summary}")
            print(f"  OutOfStock: {outofstock_gpu_summary}")
            
            # Overall GPU summary (On-Demand + RunPod + Spot + Contracts)
            total_gpu_used = ondemand_gpu_summary['gpu_used'] + runpod_gpu_summary['gpu_used'] + spot_gpu_summary['gpu_used'] + contract_gpu_summary['gpu_used']
            total_gpu_capacity = ondemand_gpu_summary['gpu_capacity'] + runpod_gpu_summary['gpu_capacity'] + spot_gpu_summary['gpu_capacity'] + contract_gpu_summary['gpu_capacity']
            gpu_usage_percentage = round((total_gpu_used / total_gpu_capacity * 100) if total_gpu_capacity > 0 else 0, 1)
            
            # Build on-demand name display
            ondemand_name = config.get('ondemand', 'N/A')
            if config.get('ondemand_variants') and len(config['ondemand_variants']) > 1:
                variant_names = [variant['variant'] for variant in config['ondemand_variants']]
                ondemand_name = f"{gpu_type}-n3 ({len(variant_names)} variants)"
            elif config.get('ondemand_variants') and len(config['ondemand_variants']) == 1:
                ondemand_name = config['ondemand_variants'][0]['variant']
            
            total_time = time.time() - start_time
            total_hosts = len(ondemand_hosts) + len(runpod_hosts) + len(spot_hosts) + len(contract_hosts)
            
            # Performance logging
            print(f"🚀 PARALLEL AGENTS PERFORMANCE SUMMARY:")
            print(f"   📊 GPU Type: {gpu_type}")
            print(f"   ⏱️  Total Time: {total_time:.2f}s") 
            print(f"   🖥️  Total Hosts: {total_hosts}")
            print(f"   📈 Hosts/Second: {total_hosts/total_time:.1f}")
            print(f"   🔄 Data Sources: 4 agents in parallel (NetBox, Aggregates, VM Counts, GPU Info)")
            print(f"   ✅ Speedup: ~{max(1, int(total_hosts * 3 / total_time))}x vs individual queries")
            
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
                    'hosts': runpod_data,
                    'gpu_summary': runpod_gpu_summary
                },
                'spot': {
                    'name': config.get('spot', 'N/A'),
                    'hosts': spot_data,
                    'gpu_summary': spot_gpu_summary
                },
                'contracts': {
                    'name': f'Contracts ({len(config.get("contracts", []))} contracts)',
                    'hosts': contract_data,
                    'gpu_summary': contract_gpu_summary,
                    'contracts_list': config.get('contracts', [])
                },
                'outofstock': {
                    'name': 'Out of Stock',
                    'hosts': outofstock_hosts,
                    'gpu_summary': outofstock_gpu_summary
                },
                'gpu_overview': {
                    'total_gpu_used': total_gpu_used,
                    'total_gpu_capacity': total_gpu_capacity,
                    'gpu_usage_ratio': f"{total_gpu_used}/{total_gpu_capacity}",
                    'gpu_usage_percentage': gpu_usage_percentage
                },
                'performance_stats': {
                    'total_time': round(total_time, 2),
                    'total_hosts': total_hosts,
                    'hosts_per_second': round(total_hosts/total_time, 1) if total_time > 0 else 0,
                    'method': 'parallel_agents'
                }
            })
            
        except Exception as e:
            print(f"❌ Error in parallel agents system: {e}")
            return jsonify({'error': str(e)}), 500

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
        operation = data.get('operation', 'full')  # 'remove', 'add', or 'full' (default)
        
        print(f"\n🚀 EXECUTING MIGRATION: {host} from {source_aggregate} to {target_aggregate} (operation: {operation})")
        
        if not all([host, target_aggregate]):
            return jsonify({'error': 'Missing required parameters (host and target_aggregate)'}), 400
        
        # CRITICAL VALIDATION: Prevent cross-GPU-type migrations
        import re
        source_gpu_type = None
        target_gpu_type = None
        
        # Extract GPU types from aggregate names
        if source_aggregate:
            source_match = re.match(r'^([A-Z0-9-]+)(?:-n3)', source_aggregate)
            if source_match:
                source_gpu_type = source_match.group(1)
        
        if target_aggregate:
            target_match = re.match(r'^([A-Z0-9-]+)(?:-n3)', target_aggregate)
            if target_match:
                target_gpu_type = target_match.group(1)
        
        # Validate GPU types match (unless it's a contract aggregate)
        if source_gpu_type and target_gpu_type and not target_aggregate.startswith('Contract-'):
            if source_gpu_type != target_gpu_type:
                error_msg = f"❌ INVALID MIGRATION: Cannot move host with {source_gpu_type} GPUs to {target_gpu_type} aggregate! Hardware mismatch detected."
                print(error_msg)
                return jsonify({
                    'error': error_msg,
                    'source_gpu_type': source_gpu_type,
                    'target_gpu_type': target_gpu_type,
                    'validation_failed': True
                }), 400
        
        # OPTIMIZATION: Skip expensive aggregate discovery - trust the frontend's source_aggregate
        # If source_aggregate is not provided, fall back to discovery as a safety net
        if not source_aggregate:
            print(f"⚠️ No source_aggregate provided, using expensive discovery as fallback...")
            actual_source_aggregate = find_host_current_aggregate(host)
            if not actual_source_aggregate:
                return jsonify({'error': f'Host {host} not found in any aggregate'}), 404
            source_aggregate = actual_source_aggregate
            print(f"🔍 Discovered: {host} is in aggregate: {actual_source_aggregate}")
        else:
            print(f"✅ Using provided source aggregate: {source_aggregate} (no discovery needed)")
        
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
            
            # Step 1: Remove from source aggregate (if requested)
            if operation in ['remove', 'full']:
                if not source_aggregate:
                    return jsonify({'error': 'source_aggregate required for remove operation'}), 400
                    
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
            
            # Step 2: Add to target aggregate (if requested)
            if operation in ['add', 'full']:
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
            
            # Step 3: Verify operation completed successfully (only for full migrations)
            if operation == 'full':
                verify_command = f"Verify {host} location after migration"
                print(f"🔍 Verifying migration: checking if {host} is in {target_aggregate}...")
                
                try:
                    # Check if host is in target aggregate
                    target_agg_verify = find_aggregate_by_name(conn, target_aggregate)
                    if not target_agg_verify:
                        verification_error = f"Target aggregate {target_aggregate} not found during verification"
                        print(f"❌ {verification_error}")
                        results.append({
                            'command': verify_command,
                            'success': False,
                            'output': verification_error
                        })
                        return jsonify({
                            'error': 'Migration verification failed - target aggregate not found',
                            'results': results
                        }), 500
                    
                    target_hosts = target_agg_verify.hosts or []
                    is_in_target = host in target_hosts
                    
                    # Check if host is NOT in source aggregate  
                    source_agg_verify = find_aggregate_by_name(conn, source_aggregate) if source_aggregate else None
                    source_hosts = source_agg_verify.hosts or [] if source_agg_verify else []
                    is_in_source = host in source_hosts
                    
                    # Determine verification result
                    if is_in_target and not is_in_source:
                        # Perfect! Host is in target and not in source
                        verification_msg = f"✅ Verified: {host} successfully migrated to {target_aggregate}"
                        print(verification_msg)
                        results.append({
                            'command': verify_command,
                            'success': True,
                            'output': verification_msg
                        })
                        
                        # Log successful verification
                        log_command(verify_command, {
                            'success': True,
                            'stdout': verification_msg,
                            'stderr': '',
                            'returncode': 0
                        }, 'executed')
                        
                        # Smart cache update: move host between aggregates instead of full refresh
                        from modules.parallel_agents import update_host_aggregate_in_cache
                        cache_updated = update_host_aggregate_in_cache(host, source_aggregate, target_aggregate)
                        if cache_updated:
                            print(f"✅ Smart cache update: moved {host} from {source_aggregate} to {target_aggregate}")
                        else:
                            print(f"⚠️ Cache update failed - will fall back to normal cache expiry")
                        
                    elif is_in_target and is_in_source:
                        # Host is in both aggregates - partial migration
                        verification_msg = f"⚠️ Partial migration: {host} is in both {source_aggregate} and {target_aggregate}"
                        print(verification_msg)
                        results.append({
                            'command': verify_command,
                            'success': False,
                            'output': verification_msg
                        })
                        return jsonify({
                            'error': 'Migration partially completed - host exists in both aggregates',
                            'results': results
                        }), 500
                        
                    elif not is_in_target and not is_in_source:
                        # Host is in neither aggregate - lost!
                        verification_msg = f"❌ Host lost: {host} is not in {source_aggregate} or {target_aggregate}"
                        print(verification_msg)
                        results.append({
                            'command': verify_command,
                            'success': False,
                            'output': verification_msg
                        })
                        return jsonify({
                            'error': 'Migration failed - host not found in any expected aggregate',
                            'results': results
                        }), 500
                        
                    else:
                        # Host is still in source aggregate only - migration failed
                        verification_msg = f"❌ Migration failed: {host} is still in {source_aggregate}, not in {target_aggregate}"
                        print(verification_msg)
                        results.append({
                            'command': verify_command,
                            'success': False,
                            'output': verification_msg
                        })
                        return jsonify({
                            'error': 'Migration failed - host remains in source aggregate',
                            'results': results
                        }), 500
                        
                except Exception as e:
                    verification_error = f"Verification failed: {str(e)}"
                    print(f"❌ {verification_error}")
                    results.append({
                        'command': verify_command,
                        'success': False,
                        'output': verification_error
                    })
                    # Don't fail the entire migration for verification errors - the operations might have worked
                    print("⚠️ Continuing despite verification error - migration operations may have succeeded")
            else:
                # For individual operations, just verify the operation completed
                if operation == 'remove' and source_aggregate:
                    print(f"🔍 Verifying remove operation: checking if {host} is NOT in {source_aggregate}...")
                    try:
                        source_agg_verify = find_aggregate_by_name(conn, source_aggregate)
                        source_hosts = source_agg_verify.hosts or [] if source_agg_verify else []
                        is_in_source = host in source_hosts
                        
                        if not is_in_source:
                            verification_msg = f"✅ Verified: {host} successfully removed from {source_aggregate}"
                            print(verification_msg)
                        else:
                            verification_msg = f"⚠️ Remove operation may have failed: {host} still in {source_aggregate}"
                            print(verification_msg)
                    except Exception as e:
                        print(f"⚠️ Could not verify remove operation: {str(e)}")
                
                elif operation == 'add':
                    print(f"🔍 Verifying add operation: checking if {host} is in {target_aggregate}...")
                    try:
                        target_agg_verify = find_aggregate_by_name(conn, target_aggregate)
                        target_hosts = target_agg_verify.hosts or [] if target_agg_verify else []
                        is_in_target = host in target_hosts
                        
                        if is_in_target:
                            verification_msg = f"✅ Verified: {host} successfully added to {target_aggregate}"
                            print(verification_msg)
                        else:
                            verification_msg = f"⚠️ Add operation may have failed: {host} not in {target_aggregate}"
                            print(verification_msg)
                    except Exception as e:
                        print(f"⚠️ Could not verify add operation: {str(e)}")

            # For successful full migrations, the smart cache update was already done above
            # For partial operations (add/remove only), we may need cache updates too
            cache_update_success = True  # Assume success for full migrations
            
            # For individual add/remove operations, clear parallel cache to ensure UI updates
            if operation in ['add', 'remove'] and len(results) > 0 and results[-1]['success']:
                print(f"✅ Individual {operation} operation completed - clearing parallel cache for UI update")
                try:
                    from modules.parallel_agents import clear_parallel_cache
                    from modules.aggregate_operations import clear_host_aggregate_cache
                    
                    # Clear both caches to ensure UI reflects changes
                    cleared_host = clear_host_aggregate_cache()
                    cleared_parallel = clear_parallel_cache()
                    print(f"✅ Cleared caches: {cleared_host} aggregate + {cleared_parallel} parallel entries")
                    cache_update_success = True
                except Exception as e:
                    print(f"⚠️ Failed to clear caches: {e}")
                    cache_update_success = False
            
            # Fallback to full cache refresh only if smart updates failed or for non-full operations
            if not cache_update_success:
                print("🔄 Falling back to full cache refresh due to complex operation")
                try:
                    from modules.parallel_agents import clear_parallel_cache, get_all_data_parallel
                    from modules.aggregate_operations import clear_host_aggregate_cache, clear_gpu_aggregates_cache
                    
                    cleared_parallel = clear_parallel_cache()
                    cleared_host = clear_host_aggregate_cache()
                    clear_gpu_aggregates_cache()
                    print(f"✅ Cache cleared: {cleared_parallel} parallel + {cleared_host} host entries")
                    
                    fresh_parallel_data = get_all_data_parallel()
                    print(f"✅ Fresh data loaded after cache refresh")
                    
                except Exception as e:
                    print(f"⚠️ Warning: Cache refresh failed: {e}")
            
            return jsonify({
                'success': True,
                'results': results,
                'message': f'Successfully completed {operation} operation: {host}',
                'cache_intelligently_updated': cache_update_success,  # Tell frontend if we used smart updates
                'cache_refreshed': not cache_update_success  # Tell frontend if we did full refresh
            })
            
        except Exception as e:
            error_msg = f'Migration failed: {str(e)}'
            print(f"❌ {error_msg}")
            return jsonify({'error': error_msg}), 500

    @app.route('/api/get-target-aggregate', methods=['POST'])
    def get_target_aggregate():
        """Determine the correct target aggregate based on source hostname and target type"""
        data = request.json
        hostname = data.get('hostname')
        target_type = data.get('target_type')
        target_variant = data.get('target_variant')
        
        if not hostname or not target_type:
            return jsonify({'error': 'Missing hostname or target_type'}), 400
        
        # OPTIMIZATION: Use cache-optimized target aggregate lookup - NO OpenStack discovery
        from modules.aggregate_operations import get_target_aggregate_optimized
        
        result = get_target_aggregate_optimized(hostname, target_type, target_variant)
        
        if not result:
            return jsonify({'error': f'Could not determine target aggregate for hostname {hostname}'}), 404
        
        return jsonify(result)

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
        image_name = data.get('image_name')
        image_id = data.get('image_id')
        
        print(f"\n👁️  PREVIEW RUNPOD LAUNCH: {hostname} with image: {image_name}")
        
        if not hostname:
            return jsonify({'error': 'Missing hostname parameter'}), 400
        
        if not image_name:
            return jsonify({'error': 'Missing image_name parameter. Please select an image before launching VM.'}), 400
        
        if not HYPERSTACK_API_KEY or not RUNPOD_API_KEY:
            return jsonify({'error': 'Hyperstack or Runpod API keys not configured'}), 500
        
        # Build dynamic flavor name using cache-optimized method (no OpenStack API calls)
        from modules.aggregate_operations import build_flavor_name_optimized, get_gpu_type_from_hostname_context_optimized
        flavor_name = build_flavor_name_optimized(hostname)
        gpu_type = get_gpu_type_from_hostname_context_optimized(hostname)
        
        # Build the curl command for preview (with masked API keys)
        masked_hyperstack_key = mask_api_key(HYPERSTACK_API_KEY)
        masked_runpod_key = mask_api_key(RUNPOD_API_KEY)
        
        # Create user_data with masked API key for preview
        user_data_preview = '"Content-Type: multipart/mixed...api_key=' + masked_runpod_key + '...power_state: reboot"'
        
        curl_command = f"""curl -X POST {HYPERSTACK_API_URL}/core/virtual-machines \\
  -H "api_key: {masked_hyperstack_key}" \\
  -H "Content-Type: application/json" \\
  -d '{{
    "name": "{hostname}",
    "environment_name": "CA1-RunPod",
    "image_name": "{image_name}",
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
        print(f"🔥 CRITICAL: /api/execute-runpod-launch route was accessed!")
        """Execute the runpod VM launch using Hyperstack API"""
        print(f"\n🔥 DEBUG: execute_runpod_launch function called")
        print(f"🔥 DEBUG: Request method: {request.method}")
        print(f"🔥 DEBUG: Request content type: {request.content_type}")

        data = request.json
        print(f"🔥 DEBUG: Request data: {data}")

        hostname = data.get('hostname') if data else None
        image_name = data.get('image_name') if data else None
        image_id = data.get('image_id') if data else None

        print(f"\n🚀 EXECUTING RUNPOD LAUNCH: {hostname} with image: {image_name}")
        print(f"🔥 DEBUG: Parsed hostname: {hostname}, image_name: {image_name}, image_id: {image_id}")
        
        if not hostname:
            return jsonify({'error': 'Missing hostname parameter'}), 400
        
        if not image_name:
            return jsonify({'error': 'Missing image_name parameter. Please select an image before launching VM.'}), 400
        
        if not HYPERSTACK_API_KEY or not RUNPOD_API_KEY:
            return jsonify({'error': 'Hyperstack or Runpod API keys not configured'}), 500
        
        # Build dynamic flavor name using cache-optimized method (no OpenStack API calls)
        from modules.aggregate_operations import build_flavor_name_optimized
        flavor_name = build_flavor_name_optimized(hostname)
        
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
        
        # Build the payload with selected image
        payload = {
            "name": hostname,
            "environment_name": "CA1-RunPod",
            "image_name": image_name,
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
        
        # Build command for logging (with masked API key) - define before try block
        masked_command = f"curl -X POST {HYPERSTACK_API_URL}/core/virtual-machines -H 'api_key: {mask_api_key(HYPERSTACK_API_KEY)}' -d '{{\"name\": \"{hostname}\", \"flavor_name\": \"{flavor_name}\", ...}}'"
        
        try:
            # Make the API call to Hyperstack
            headers = {
                'api_key': HYPERSTACK_API_KEY,
                'Content-Type': 'application/json'
            }
            
            response = requests.post(
                f"{HYPERSTACK_API_URL}/core/virtual-machines",
                headers=headers,
                json=payload,
                timeout=120  # Increased timeout to 2 minutes for VM creation
            )
            
            if response.status_code in [200, 201]:
                result_data = response.json()
                
                # Extract VM ID from response
                vm_id = None
                if result_data.get('instances') and len(result_data['instances']) > 0:
                    vm_id = result_data['instances'][0].get('id')
                    print(f"🆔 Extracted VM ID: {vm_id} for VM {hostname}")
                
                # Log the successful command
                log_command(masked_command, {
                    'success': True,
                    'stdout': f'Successfully launched VM {hostname} with flavor {flavor_name} (ID: {vm_id})',
                    'stderr': '',
                    'returncode': 0
                }, 'executed')
                
                # Note: Storage network attachment is now handled by frontend commands
                # attach_runpod_storage_network(hostname, delay_seconds=120)  # Disabled to prevent conflicts
                
                # Schedule firewall attachment after 180 seconds (Hyperstack API) - Canada hosts only
                firewall_scheduled = False
                if vm_id and hostname.startswith('CA1-') and HYPERSTACK_FIREWALL_CA1_ID:
                    attach_firewall_to_vm(vm_id, hostname, delay_seconds=180)
                    firewall_scheduled = True
                elif vm_id and hostname.startswith('CA1-'):
                    print(f"⚠️ No CA1 firewall ID configured - firewall attachment will be skipped for {hostname}")
                elif vm_id:
                    print(f"🌍 VM {hostname} is not in Canada - firewall attachment will be skipped")
                else:
                    print(f"⚠️ No VM ID found in response - skipping firewall attachment for {hostname}")
                
                # Smart cache update: increment VM count for this host instead of clearing everything
                from modules.parallel_agents import update_host_vm_count_in_cache
                cache_updated = update_host_vm_count_in_cache(hostname, 1)  # VM launched, so count = 1
                
                return jsonify({
                    'success': True,
                    'message': f'Successfully launched VM {hostname} on Hyperstack',
                    'vm_name': hostname,
                    'vm_id': vm_id,
                    'flavor_name': flavor_name,
                    'response': result_data,
                    'storage_network_scheduled': False,  # Now handled by frontend commands
                    'firewall_scheduled': firewall_scheduled,
                    'cache_updated': cache_updated  # Indicate that cache was intelligently updated
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
            error_msg = f'Timeout launching VM {hostname} - request took longer than 2 minutes'
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

    # OpenStack SDK endpoints for network operations
    @app.route('/api/openstack/network/show', methods=['POST'])
    def openstack_network_show():
        """Find network by name using OpenStack SDK"""
        try:
            data = request.get_json()
            network_name = data.get('network_name')
            
            if not network_name:
                return jsonify({'success': False, 'error': 'Network name is required'})
            
            print(f"🌐 Looking up network: {network_name}")
            
            conn = get_openstack_connection()
            if not conn:
                return jsonify({'success': False, 'error': 'OpenStack connection failed'})
            
            # Find the network
            network = conn.network.find_network(network_name)
            if not network:
                return jsonify({'success': False, 'error': f'Network {network_name} not found'})
            
            print(f"✅ Found network {network_name} with ID: {network.id}")
            return jsonify({'success': True, 'network_id': network.id})
            
        except Exception as e:
            print(f"❌ Error finding network: {e}")
            return jsonify({'success': False, 'error': str(e)})

    @app.route('/api/openstack/port/create', methods=['POST'])
    def openstack_port_create():
        """Create port on network using OpenStack SDK"""
        try:
            data = request.get_json()
            network_name = data.get('network_name')
            port_name = data.get('port_name')
            
            if not network_name or not port_name:
                return jsonify({'success': False, 'error': 'Network name and port name are required'})
            
            print(f"🌐 Creating port {port_name} on network {network_name}")
            
            conn = get_openstack_connection()
            if not conn:
                return jsonify({'success': False, 'error': 'OpenStack connection failed'})
            
            # Find the network
            network = conn.network.find_network(network_name)
            if not network:
                return jsonify({'success': False, 'error': f'Network {network_name} not found'})
            
            # Create the port
            port = conn.network.create_port(
                network_id=network.id,
                name=port_name
            )
            
            print(f"✅ Created port {port_name} with ID: {port.id}")
            return jsonify({'success': True, 'port_id': port.id})
            
        except Exception as e:
            print(f"❌ Error creating port: {e}")
            return jsonify({'success': False, 'error': str(e)})

    @app.route('/api/openstack/server/add-network', methods=['POST'])
    def openstack_server_add_network():
        """Attach network to server using OpenStack SDK (server add network approach)"""
        try:
            data = request.get_json()
            server_name = data.get('server_name')
            network_name = data.get('network_name')
            
            if not server_name or not network_name:
                return jsonify({'success': False, 'error': 'Server name and network name are required'})
            
            print(f"🌐 Attaching network {network_name} to server {server_name}")
            
            conn = get_openstack_connection()
            if not conn:
                return jsonify({'success': False, 'error': 'OpenStack connection failed'})
            
            # First get server list with all projects to find UUID - matching your example command
            # openstack server list --all-projects --name {server_name}
            servers = list(conn.compute.servers(all_projects=True, name=server_name))
            
            if not servers:
                return jsonify({'success': False, 'error': f'Server {server_name} not found'})
            
            if len(servers) > 1:
                print(f"⚠️ Multiple servers found with name {server_name}, using first one")
            
            server = servers[0]
            server_uuid = server.id
            print(f"📋 Found server {server_name} with UUID: {server_uuid}")
            
            # Find the network
            network = conn.network.find_network(network_name)
            if not network:
                return jsonify({'success': False, 'error': f'Network {network_name} not found'})
            
            print(f"📋 Found network {network_name} with UUID: {network.id}")
            
            # Wait 10 seconds after server is found to ensure networking stack is fully initialized
            print(f"⏳ Waiting 10 seconds for server {server_name} networking to fully initialize...")
            time.sleep(10)
            
            # Attach the network to the server using server UUID with improved retry logic
            # This is equivalent to: openstack server add network {server_uuid} {network_name}
            max_retries = 12  # 12 attempts = 120 seconds maximum wait time
            retry_delay = 10  # seconds between retries
            retry_log = []
            
            print(f"🔄 Starting network attachment with retry loop (10s intervals, 120s timeout)")
            
            for attempt in range(max_retries):
                try:
                    conn.compute.create_server_interface(server_uuid, net_id=network.id)
                    success_msg = f"✅ Attached network {network_name} to server {server_name} (UUID: {server_uuid})"
                    if attempt > 0:
                        success_msg += f" (succeeded on attempt {attempt + 1} after {attempt * retry_delay}s)"
                    print(success_msg)
                    break
                except Exception as attach_error:
                    error_str = str(attach_error).lower()
                    elapsed_time = attempt * retry_delay
                    
                    # Check for various states that indicate we should retry
                    should_retry = (
                        "vm_state building" in error_str or
                        "failed to attach network adapter" in error_str or
                        "server error" in error_str or
                        "task_state" in error_str or
                        "instance is not ready" in error_str
                    )
                    
                    if should_retry and attempt < max_retries - 1:
                        retry_msg = f"⏳ Network attachment failed (VM not ready), retrying in {retry_delay}s (attempt {attempt + 1}/{max_retries}, elapsed: {elapsed_time}s)"
                        print(retry_msg)
                        retry_log.append(f"Attempt {attempt + 1}: {str(attach_error)}")
                        time.sleep(retry_delay)
                        continue
                    else:
                        # Either not a retryable error, or we've exhausted retries
                        total_elapsed = elapsed_time + retry_delay if attempt == max_retries - 1 else elapsed_time
                        error_details = f"Failed after {attempt + 1} attempts over {total_elapsed}s: {str(attach_error)}"
                        if retry_log:
                            error_details = "\n".join(retry_log) + f"\nFinal error: {str(attach_error)}"
                        
                        # Log the failed command with detailed retry information
                        log_command(f'openstack server add network {server_uuid} "{network_name}"', {
                            'success': False,
                            'stdout': '',
                            'stderr': error_details,
                            'returncode': 1
                        }, 'executed')
                        
                        raise attach_error
            
            # Log the successful command with retry details if applicable
            stdout_msg = f'Network {network_name} successfully attached to server {server_name} (UUID: {server_uuid})'
            if retry_log:
                stdout_msg = "\n".join(retry_log) + f"\n{stdout_msg}"
                
            log_command(f'openstack server add network {server_uuid} "{network_name}"', {
                'success': True,
                'stdout': stdout_msg,
                'stderr': '',
                'returncode': 0
            }, 'executed')
            
            return jsonify({'success': True, 'message': f'Network {network_name} attached to server {server_name}'})
            
        except Exception as e:
            error_msg = f"❌ Error attaching network: {e}"
            print(error_msg)
            
            # Log the failed command (if not already logged above)
            if 'server_uuid' in locals():
                log_command(f'openstack server add network {server_uuid} "{network_name}"', {
                    'success': False,
                    'stdout': '',
                    'stderr': error_msg,
                    'returncode': 1
                }, 'executed')
            
            return jsonify({'success': False, 'error': str(e)})

    @app.route('/api/openstack/server/get-uuid', methods=['POST'])
    def openstack_server_get_uuid():
        """Get server UUID by name using OpenStack SDK"""
        try:
            data = request.get_json()
            server_name = data.get('server_name')
            
            if not server_name:
                return jsonify({'success': False, 'error': 'Server name is required'})
            
            print(f"🔍 Looking up UUID for server: {server_name}")
            
            conn = get_openstack_connection()
            if not conn:
                return jsonify({'success': False, 'error': 'OpenStack connection failed'})
            
            # Get server list with all projects to find UUID - matching openstack server list --all-projects --name
            servers = list(conn.compute.servers(all_projects=True, name=server_name))
            
            if not servers:
                return jsonify({'success': False, 'error': f'Server {server_name} not found'})
            
            if len(servers) > 1:
                print(f"⚠️ Multiple servers found with name {server_name}, using first one")
            
            server = servers[0]
            server_uuid = server.id
            print(f"✅ Found server {server_name} with UUID: {server_uuid}")
            
            # Log the command
            log_command(f'openstack server list --all-projects --name "{server_name}" -c ID -f value', {
                'success': True,
                'stdout': f'Server UUID: {server_uuid}',
                'stderr': '',
                'returncode': 0
            }, 'executed')
            
            return jsonify({
                'success': True, 
                'server_uuid': server_uuid,
                'server_name': server_name,
                'status': server.status
            })
            
        except Exception as e:
            print(f"❌ Error getting server UUID: {e}")
            return jsonify({'success': False, 'error': str(e)})

    @app.route('/api/openstack/server/status', methods=['POST'])
    def openstack_server_status():
        """Get current server status by name using OpenStack SDK"""
        try:
            data = request.get_json()
            server_name = data.get('server_name')
            
            if not server_name:
                return jsonify({'success': False, 'error': 'Server name is required'})
            
            print(f"🔍 Checking status for server: {server_name}")
            
            conn = get_openstack_connection()
            if not conn:
                return jsonify({'success': False, 'error': 'OpenStack connection failed'})
            
            # Get server list with all projects to find server by name
            servers = list(conn.compute.servers(all_projects=True, name=server_name))
            
            if not servers:
                return jsonify({'success': False, 'error': f'Server {server_name} not found'})
            
            if len(servers) > 1:
                print(f"⚠️ Multiple servers found with name {server_name}, using first one")
            
            server = servers[0]
            
            # Get fresh server details to ensure status is current
            server = conn.compute.get_server(server.id)
            
            print(f"📊 Server {server_name} status: {server.status}")
            
            return jsonify({
                'success': True,
                'server_name': server_name,
                'server_uuid': server.id,
                'status': server.status,
                'power_state': getattr(server, 'power_state', None),
                'task_state': getattr(server, 'task_state', None),
                'vm_state': getattr(server, 'vm_state', None)
            })
            
        except Exception as e:
            print(f"❌ Error getting server status: {e}")
            return jsonify({'success': False, 'error': str(e)})

    @app.route('/api/hyperstack/firewall/get-attachments', methods=['POST'])
    def hyperstack_firewall_get_attachments():
        """Get current VM attachments for a firewall"""
        try:
            data = request.get_json()
            firewall_id = data.get('firewall_id', HYPERSTACK_FIREWALL_CA1_ID)
            
            if not firewall_id:
                return jsonify({'success': False, 'error': 'No firewall ID configured'})
            
            print(f"🔍 Getting firewall attachments for firewall ID: {firewall_id}")
            
            # Get current attachments using existing function
            existing_vm_ids = get_firewall_current_attachments(firewall_id)
            
            # Log the command
            log_command(f'curl -X GET https://infrahub-api.nexgencloud.com/v1/core/firewalls/{firewall_id}', {
                'success': True,
                'stdout': f'Retrieved {len(existing_vm_ids)} VM attachments: {", ".join(map(str, existing_vm_ids))}',
                'stderr': '',
                'returncode': 0
            }, 'executed')
            
            return jsonify({
                'success': True,
                'firewall_id': firewall_id,
                'vm_ids': existing_vm_ids,
                'count': len(existing_vm_ids)
            })
            
        except Exception as e:
            print(f"❌ Error getting firewall attachments: {e}")
            return jsonify({'success': False, 'error': str(e)})

    @app.route('/api/hyperstack/firewall/update-attachments', methods=['POST'])
    def hyperstack_firewall_update_attachments():
        """Update firewall with new VM attachments"""
        try:
            data = request.get_json()
            firewall_id = data.get('firewall_id', HYPERSTACK_FIREWALL_CA1_ID)
            new_vm_id = data.get('vm_id')
            
            if not firewall_id:
                return jsonify({'success': False, 'error': 'No firewall ID configured'})
            
            if not new_vm_id:
                return jsonify({'success': False, 'error': 'VM ID is required'})
            
            print(f"🔥 Adding VM ID {new_vm_id} to firewall {firewall_id}")
            
            # Get current attachments
            existing_vm_ids = get_firewall_current_attachments(firewall_id)
            print(f"📋 Current VMs on firewall: {existing_vm_ids}")
            
            # Add new VM ID to the list
            if new_vm_id not in existing_vm_ids:
                updated_vm_ids = existing_vm_ids + [new_vm_id]
                print(f"➕ Adding VM ID {new_vm_id} to firewall attachments")
            else:
                updated_vm_ids = existing_vm_ids
                print(f"ℹ️ VM ID {new_vm_id} already attached to firewall")
            
            # Update firewall with all VMs (existing + new)
            headers = {
                'api_key': HYPERSTACK_API_KEY,
                'Content-Type': 'application/json'
            }
            
            payload = {
                'vms': updated_vm_ids
            }
            
            response = requests.post(
                f'{HYPERSTACK_API_URL}/core/firewalls/{firewall_id}/update-attachments',
                headers=headers,
                json=payload,
                timeout=30
            )
            
            if response.status_code == 200:
                print(f"✅ Successfully updated firewall {firewall_id} with VM ID {new_vm_id}")
                
                # Log the command
                log_command(f'curl -X POST https://infrahub-api.nexgencloud.com/v1/core/firewalls/{firewall_id}/update-attachments', {
                    'success': True,
                    'stdout': f'Successfully updated firewall {firewall_id} with {len(updated_vm_ids)} VMs: {", ".join(map(str, updated_vm_ids))}',
                    'stderr': '',
                    'returncode': 0
                }, 'executed')
                
                return jsonify({
                    'success': True,
                    'firewall_id': firewall_id,
                    'vm_id': new_vm_id,
                    'total_vms': len(updated_vm_ids),
                    'vm_list': updated_vm_ids
                })
            else:
                error_msg = f'Failed to update firewall: HTTP {response.status_code}'
                if response.text:
                    error_msg += f' - {response.text}'
                print(f"❌ {error_msg}")
                return jsonify({'success': False, 'error': error_msg})
            
        except Exception as e:
            print(f"❌ Error updating firewall attachments: {e}")
            return jsonify({'success': False, 'error': str(e)})

    @app.route('/api/hyperstack/images')
    def hyperstack_list_images():
        """Get available images from Hyperstack API with optional filtering"""
        try:
            if not HYPERSTACK_API_KEY:
                return jsonify({'success': False, 'error': 'Hyperstack API key not configured'})
            
            # Get optional query parameters
            region = request.args.get('region')
            include_public = request.args.get('include_public', 'true').lower() == 'true'
            search = request.args.get('search')
            page = request.args.get('page')
            per_page = request.args.get('per_page')
            
            print("🖼️ Fetching available images from Hyperstack...")
            if region:
                print(f"  📍 Region filter: {region}")
            if search:
                print(f"  🔍 Search filter: {search}")
            
            headers = {
                'api_key': HYPERSTACK_API_KEY,
                'Content-Type': 'application/json'
            }
            
            # Build query parameters
            params = {}
            if region:
                params['region'] = region
            if not include_public:
                params['include_public'] = 'false'
            if search:
                params['search'] = search
            if page:
                params['page'] = page
            if per_page:
                params['per_page'] = per_page
            
            response = requests.get(
                f'{HYPERSTACK_API_URL}/core/images',
                headers=headers,
                params=params,
                timeout=30
            )
            
            if response.status_code == 200:
                data = response.json()
                image_groups = data.get('images', [])
                
                # Flatten the nested structure for easier frontend consumption
                formatted_images = []
                total_count = 0
                
                for group in image_groups:
                    region_name = group.get('region_name', 'Unknown')
                    group_type = group.get('type', 'Unknown')
                    logo = group.get('logo', '')
                    green_status = group.get('green_status', 'UNKNOWN')
                    
                    # Get images from this group
                    group_images = group.get('images', [])
                    
                    for image in group_images:
                        formatted_images.append({
                            'id': image.get('id'),
                            'name': image.get('name'),
                            'type': group_type,  # Use group type
                            'version': image.get('version'),
                            'region_name': region_name,  # Use group region
                            'size': image.get('size'),
                            'display_size': image.get('display_size'),
                            'description': image.get('description', ''),
                            'is_public': image.get('is_public', True),
                            'created_at': image.get('created_at'),
                            'logo': logo,
                            'green_status': green_status,
                            'snapshot': image.get('snapshot'),
                            'labels': image.get('labels', [])
                        })
                        total_count += 1
                
                # Sort by region first, then type, then name for easier selection
                formatted_images.sort(key=lambda x: (x['region_name'], x['type'], x['name']))
                
                print(f"✅ Retrieved {total_count} images from {len(image_groups)} groups from Hyperstack")
                
                # Debug: Log all unique regions found
                unique_regions = set()
                for group in image_groups:
                    region_name = group.get('region_name', 'Unknown')
                    unique_regions.add(region_name)
                print(f"🌍 Available regions in API response: {', '.join(sorted(unique_regions))}")
                
                # Log the command
                log_command('curl -X GET https://infrahub-api.nexgencloud.com/v1/core/images', {
                    'success': True,
                    'stdout': f'Retrieved {total_count} available images from {len(image_groups)} groups',
                    'stderr': '',
                    'returncode': 0
                }, 'executed')
                
                return jsonify({
                    'success': True,
                    'images': formatted_images,
                    'count': total_count,
                    'groups': len(image_groups)
                })
            else:
                error_msg = f'Failed to fetch images: HTTP {response.status_code}'
                if response.text:
                    error_msg += f' - {response.text}'
                print(f"❌ {error_msg}")
                return jsonify({'success': False, 'error': error_msg})
            
        except Exception as e:
            print(f"❌ Error fetching Hyperstack images: {e}")
            return jsonify({'success': False, 'error': str(e)})

    # =============================================================================
    # CACHE MANAGEMENT ENDPOINTS
    # =============================================================================

    @app.route('/api/refresh-all-data', methods=['POST'])
    def refresh_all_data():
        """Clear all caches and refresh all currently loaded data using parallel agents"""
        try:
            # Import cache functions
            from modules.aggregate_operations import clear_host_aggregate_cache, get_host_cache_stats, clear_gpu_aggregates_cache
            from app_business_logic import clear_netbox_cache, get_netbox_cache_stats
            from modules.parallel_agents import clear_parallel_cache, get_all_data_parallel
            
            print("🔄 Refreshing all cached data using PARALLEL AGENTS with OPTIMIZATIONS...")
            start_time = time.time()
            
            # Clear all caches and get counts - including new GPU aggregates cache
            host_cache_count = clear_host_aggregate_cache()
            netbox_cache_count = clear_netbox_cache()
            parallel_cache_count = clear_parallel_cache()
            gpu_agg_cache_cleared = clear_gpu_aggregates_cache()
            
            print(f"⚡ Cache clearing: {host_cache_count} hosts, {netbox_cache_count} netbox, {parallel_cache_count} parallel, GPU aggregates cleared")
            
            # Force refresh using parallel agents (this will rebuild all data)
            organized_data = get_all_data_parallel()
            
            refresh_time = time.time() - start_time
            total_hosts = sum(data.get('total_hosts', data.get('device_count', 0)) for data in organized_data.values())
            
            hosts_per_sec = round(total_hosts/refresh_time, 1) if refresh_time > 0 else 0
            print(f"✅ OPTIMIZED refresh completed: {len(organized_data)} GPU types, {total_hosts} hosts in {refresh_time:.2f}s ({hosts_per_sec} hosts/sec)")
            
            return jsonify({
                'success': True,
                'message': 'All caches cleared and data refreshed with OPTIMIZED parallel agents',
                'cleared': {
                    'host_aggregate_cache': host_cache_count,
                    'netbox_cache': netbox_cache_count,
                    'parallel_cache': parallel_cache_count,
                    'gpu_aggregates_cache': gpu_agg_cache_cleared,
                    'gpu_types_refreshed': len(organized_data),
                    'total_hosts_refreshed': total_hosts
                },
                'performance': {
                    'refresh_time': round(refresh_time, 2),
                    'hosts_per_second': hosts_per_sec,
                    'optimization_note': '⚡ Using cached GPU aggregates discovery + reduced polling'
                },
                'timestamp': datetime.now().isoformat()
            })
            
        except Exception as e:
            print(f"❌ Error refreshing all data: {e}")
            return jsonify({'success': False, 'error': str(e)}), 500

    @app.route('/api/clear-cache', methods=['POST'])
    def clear_all_caches():
        """Clear all application caches without refreshing data"""
        try:
            # Import cache functions
            from modules.aggregate_operations import clear_host_aggregate_cache
            from app_business_logic import clear_netbox_cache
            from modules.parallel_agents import clear_parallel_cache
            
            # Clear all caches and get counts
            host_cache_count = clear_host_aggregate_cache()
            netbox_cache_count = clear_netbox_cache()
            parallel_cache_count = clear_parallel_cache()
            
            return jsonify({
                'success': True,
                'message': 'All caches cleared successfully (including parallel agents cache)',
                'cleared': {
                    'host_aggregate_cache': host_cache_count,
                    'netbox_cache': netbox_cache_count,
                    'parallel_cache': parallel_cache_count
                }
            })
            
        except Exception as e:
            print(f"❌ Error clearing caches: {e}")
            return jsonify({'success': False, 'error': str(e)}), 500

    @app.route('/api/clear-cache/<hostname>', methods=['POST'])
    def clear_host_cache(hostname):
        """Clear cache for specific hostname"""
        try:
            # Import cache functions
            from modules.aggregate_operations import clear_host_aggregate_cache
            from app_business_logic import clear_netbox_cache
            
            # Clear caches for specific hostname
            host_cleared = clear_host_aggregate_cache(hostname)
            netbox_cleared = clear_netbox_cache(hostname)
            
            all_cleared = host_cleared + netbox_cleared
            
            return jsonify({
                'success': True,
                'message': f'Cache cleared for {hostname}',
                'hostname': hostname,
                'cleared': all_cleared
            })
            
        except Exception as e:
            print(f"❌ Error clearing cache for {hostname}: {e}")
            return jsonify({'success': False, 'error': str(e)}), 500

    @app.route('/api/cache-status')
    def get_cache_status():
        """Get current cache statistics including parallel agents cache"""
        try:
            # Import cache functions
            from modules.aggregate_operations import get_host_cache_stats, discover_gpu_aggregates
            from app_business_logic import get_netbox_cache_stats
            from modules.parallel_agents import get_parallel_cache_stats
            
            host_stats = get_host_cache_stats()
            netbox_stats = get_netbox_cache_stats()
            parallel_stats = get_parallel_cache_stats()
            
            # Get additional detailed stats
            detailed_stats = {}
            try:
                # Get total number of aggregates
                gpu_aggregates = discover_gpu_aggregates()
                total_aggregates = 0
                total_gpu_types = len(gpu_aggregates)
                
                for gpu_type, config in gpu_aggregates.items():
                    # Count all aggregate types for this GPU
                    if config.get('ondemand_variants'):
                        total_aggregates += len(config['ondemand_variants'])
                    if config.get('spot'):
                        total_aggregates += 1
                    if config.get('runpod'):
                        total_aggregates += 1
                    if config.get('contracts'):
                        total_aggregates += len(config['contracts'])
                
                detailed_stats = {
                    'total_aggregates': total_aggregates,
                    'total_gpu_types': total_gpu_types,
                    'aggregate_breakdown': {
                        'ondemand': sum(len(config.get('ondemand_variants', [])) for config in gpu_aggregates.values()),
                        'spot': sum(1 for config in gpu_aggregates.values() if config.get('spot')),
                        'runpod': sum(1 for config in gpu_aggregates.values() if config.get('runpod')),
                        'contracts': sum(len(config.get('contracts', [])) for config in gpu_aggregates.values())
                    }
                }
            except Exception as e:
                print(f"⚠️ Could not get detailed aggregate stats: {e}")
                detailed_stats = {
                    'total_aggregates': 0,
                    'total_gpu_types': 0,
                    'aggregate_breakdown': {'ondemand': 0, 'spot': 0, 'runpod': 0, 'contracts': 0}
                }
            
            return jsonify({
                'success': True,
                'host_aggregate_cache': host_stats,
                'netbox_cache': netbox_stats,
                'parallel_cache': parallel_stats,
                'detailed_stats': detailed_stats,
                'total_cached_hosts': host_stats['host_aggregate_cache_size'] + netbox_stats['tenant_cache_size'],
                'cache_method': 'parallel_agents' if parallel_stats['cached_datasets'] > 0 else 'individual'
            })
            
        except Exception as e:
            print(f"❌ Error getting cache status: {e}")
            return jsonify({'success': False, 'error': str(e)}), 500

    # =============================================================================
    # PARALLEL AGENTS TEST ENDPOINTS
    # =============================================================================

    @app.route('/api/parallel-test')
    def test_parallel_agents():
        """Test the new parallel agents system"""
        try:
            from modules.parallel_agents import get_all_data_parallel
            
            start_time = time.time()
            print("🧪 Testing parallel agents system...")
            
            # Run parallel data collection
            organized_data = get_all_data_parallel()
            
            total_time = time.time() - start_time
            
            # Count totals for summary
            total_hosts = sum(data.get('total_hosts', data.get('device_count', 0)) for data in organized_data.values())
            gpu_types = list(organized_data.keys())
            
            summary = {
                'success': True,
                'total_time': round(total_time, 2),
                'gpu_types_found': len(gpu_types),
                'gpu_types': gpu_types,
                'total_hosts': total_hosts,
                'data_preview': {
                    gpu_type: {
                        'host_count': data.get('total_hosts', data.get('device_count', 0)),
                        'has_runpod': bool(data.get('config', {}).get('runpod')),
                        'has_spot': bool(data.get('config', {}).get('spot')),
                        'ondemand_variants': len(data.get('config', {}).get('ondemand_variants', [])),
                        'contracts': len(data.get('config', {}).get('contracts', []))
                    } 
                    for gpu_type, data in organized_data.items()
                }
            }
            
            print(f"✅ Parallel test completed: {total_hosts} hosts, {len(gpu_types)} GPU types in {total_time:.2f}s")
            return jsonify(summary)
            
        except Exception as e:
            print(f"❌ Parallel test failed: {e}")
            return jsonify({'success': False, 'error': str(e)}), 500

    @app.route('/api/parallel-cache-status')
    def get_parallel_cache_status():
        """Get parallel cache statistics"""
        try:
            from modules.parallel_agents import get_parallel_cache_stats
            
            stats = get_parallel_cache_stats()
            return jsonify({
                'success': True,
                'parallel_cache': stats
            })
            
        except Exception as e:
            return jsonify({'success': False, 'error': str(e)}), 500

    # Debug: Log all registered routes at the end
    print("\n🔥 DEBUG: All routes registered in register_routes():")
    for rule in app.url_map.iter_rules():
        if 'execute-runpod-launch' in rule.rule:
            print(f"🔥 DEBUG: Found execute-runpod-launch route: {rule.rule} -> {rule.endpoint}")
    print("🔥 DEBUG: Route registration complete\n")