#!/usr/bin/env python3

from flask import Flask, render_template, jsonify, request
import subprocess
import json
import re
from datetime import datetime
import openstack
from dotenv import load_dotenv
import os

# Load environment variables
load_dotenv()

app = Flask(__name__)

# Global command log storage
command_log = []

# OpenStack connection - initialized lazily
_openstack_connection = None

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

def find_aggregate_by_name(conn, aggregate_name):
    """Helper function to find aggregate by name"""
    try:
        aggregates = list(conn.compute.aggregates())
        for agg in aggregates:
            if agg.name == aggregate_name:
                return agg
        return None
    except Exception as e:
        print(f"❌ Error finding aggregate {aggregate_name}: {e}")
        return None

# Define aggregate pairs
AGGREGATE_PAIRS = {
    'L40': {'ondemand': 'L40-n3', 'spot': 'L40-n3-spot'},
    'RTX-A6000': {'ondemand': 'RTX-A6000-n3', 'spot': 'RTX-A6000-n3-spot'},
    'A100': {'ondemand': 'A100-n3', 'spot': 'A100-n3-spot'},
    'H100': {'ondemand': 'H100-n3', 'spot': 'H100-n3-spot'}
}

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
            print(f"📋 Found {len(hosts)} hosts in aggregate {aggregate_name}: {hosts}")
            return hosts
        else:
            print(f"⚠️ Aggregate {aggregate_name} not found")
            return []
            
    except Exception as e:
        print(f"❌ Error getting hosts for aggregate {aggregate_name}: {e}")
        return []

def get_host_vm_count(hostname):
    """Get VM count for a specific host using OpenStack SDK"""
    try:
        conn = get_openstack_connection()
        if not conn:
            print(f"❌ No OpenStack connection available")
            return 0
        
        print(f"🔍 Searching for VMs on host: {hostname}")
        
        # Method 1: Direct host filtering with all_projects (admin required)
        try:
            servers = list(conn.compute.servers(host=hostname, all_projects=True))
            vm_count = len(servers)
            print(f"📊 SDK Method 1 (host + all_projects): Found {vm_count} VMs")
            if vm_count > 0:
                for server in servers:
                    print(f"   - {server.name} ({server.id}) - Status: {server.status}")
                return vm_count
        except Exception as e:
            print(f"⚠️ Method 1 failed: {e}")
        
        # Method 2: Try without all_projects
        try:
            servers = list(conn.compute.servers(host=hostname))
            vm_count = len(servers)
            print(f"📊 SDK Method 2 (host only): Found {vm_count} VMs")
            if vm_count > 0:
                return vm_count
        except Exception as e:
            print(f"⚠️ Method 2 failed: {e}")
            
        # Method 3: Get all servers with details and filter by hypervisor_hostname
        try:
            print(f"🔍 Trying to get all servers and filter by hypervisor...")
            all_servers = list(conn.compute.servers(details=True, all_projects=True))
            print(f"🔍 Total servers found: {len(all_servers)}")
            
            # Debug: Show first server's attributes if any exist
            if len(all_servers) > 0:
                first_server = all_servers[0]
                print(f"🔍 First server hypervisor_hostname: {getattr(first_server, 'hypervisor_hostname', 'NOT_FOUND')}")
                print(f"🔍 First server host: {getattr(first_server, 'host', 'NOT_FOUND')}")
                print(f"🔍 Available attributes: {[attr for attr in dir(first_server) if 'host' in attr.lower()]}")
            
            filtered_servers = []
            for server in all_servers:
                server_host = getattr(server, 'hypervisor_hostname', None)
                if server_host == hostname:
                    filtered_servers.append(server)
                    print(f"   - Match: {server.name} on {server_host}")
            
            vm_count = len(filtered_servers)
            print(f"📊 SDK Method 3 (hypervisor filter): Found {vm_count} VMs")
            return vm_count
            
        except Exception as e:
            print(f"⚠️ Method 3 failed: {e}")
            
        print(f"📊 Host {hostname} has 0 VMs")
        return 0
        
    except Exception as e:
        print(f"❌ Error getting VM count for host {hostname}: {e}")
        return 0

def get_host_vms(hostname):
    """Get VMs running on a specific host using OpenStack SDK"""
    try:
        conn = get_openstack_connection()
        if not conn:
            print(f"❌ No OpenStack connection available")
            return []
        
        print(f"🔍 Getting VM details for host: {hostname}")
        
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
            
            print(f"📋 Found {len(vm_list)} VMs on host {hostname}")
            return vm_list
            
        except Exception as e:
            print(f"❌ Error getting VMs for host {hostname}: {e}")
            return []
        
    except Exception as e:
        print(f"❌ Error getting VMs for host {hostname}: {e}")
        return []

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/aggregates/<gpu_type>')
def get_aggregate_data(gpu_type):
    """Get aggregate data for a specific GPU type"""
    if gpu_type not in AGGREGATE_PAIRS:
        return jsonify({'error': 'Invalid GPU type'}), 400
    
    pair = AGGREGATE_PAIRS[gpu_type]
    ondemand_hosts = get_aggregate_hosts(pair['ondemand'])
    spot_hosts = get_aggregate_hosts(pair['spot'])
    
    # Get VM counts for each host
    ondemand_data = []
    for host in ondemand_hosts:
        vm_count = get_host_vm_count(host)
        ondemand_data.append({
            'name': host,
            'vm_count': vm_count,
            'has_vms': vm_count > 0
        })
    
    spot_data = []
    for host in spot_hosts:
        vm_count = get_host_vm_count(host)
        spot_data.append({
            'name': host,
            'vm_count': vm_count,
            'has_vms': vm_count > 0
        })
    
    return jsonify({
        'ondemand': {
            'name': pair['ondemand'],
            'hosts': ondemand_data
        },
        'spot': {
            'name': pair['spot'],
            'hosts': spot_data
        }
    })

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
    
    print(f"\n🚀 EXECUTING MIGRATION: {host} from {source_aggregate} to {target_aggregate}")
    
    if not all([host, source_aggregate, target_aggregate]):
        return jsonify({'error': 'Missing required parameters'}), 400
    
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
        
        # Remove from source aggregate
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
        
        # Add to target aggregate
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
        
        return jsonify({
            'success': True,
            'results': results,
            'message': f'Successfully migrated {host} from {source_aggregate} to {target_aggregate}'
        })
        
    except Exception as e:
        error_msg = f'Migration failed: {str(e)}'
        print(f"❌ {error_msg}")
        return jsonify({'error': error_msg}), 500

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

if __name__ == '__main__':
    print("=" * 60)
    print("🚀 OpenStack Spot Manager Starting...")
    print("=" * 60)
    print("📊 Debug mode: ENABLED")
    print("🌐 Server: http://0.0.0.0:6969")
    print("🔍 Command logging: ENABLED")
    print("=" * 60)
    app.run(debug=True, host='0.0.0.0', port=6969)
