#!/usr/bin/env python3

from flask import Flask, render_template, jsonify, request
import subprocess
import json
import re
from datetime import datetime

app = Flask(__name__)

# Global command log storage
command_log = []

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
    """Get hosts in an aggregate"""
    command = f"openstack aggregate show {aggregate_name} -c hosts -f value"
    result = run_openstack_command(command, log_execution=False)  # Don't log routine queries
    
    if result['success']:
        stdout = result['stdout'].strip()
        if not stdout:
            return []
        
        # OpenStack CLI outputs hosts as comma-separated values, not newline-separated
        # Handle both formats for compatibility
        if ',' in stdout:
            hosts = [host.strip() for host in stdout.split(',') if host.strip()]
        else:
            hosts = [host.strip() for host in stdout.split('\n') if host.strip()]
        
        return hosts
    return []

def get_host_vm_count(hostname):
    """Get VM count for a specific host"""
    command = f"openstack server list --host {hostname} -f value -c ID"
    result = run_openstack_command(command, log_execution=False)  # Don't log routine queries
    
    if result['success']:
        vm_ids = [vm.strip() for vm in result['stdout'].split('\n') if vm.strip()]
        return len(vm_ids)
    return 0

def get_host_vms(hostname):
    """Get VMs running on a specific host"""
    command = f"openstack server list --host {hostname} -f json -c Name -c Status -c ID"
    result = run_openstack_command(command, log_execution=False)  # Don't log routine queries
    
    if result['success']:
        try:
            return json.loads(result['stdout'])
        except json.JSONDecodeError:
            return []
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
    """Execute the migration commands"""
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
    
    results = []
    
    # Remove from source aggregate
    remove_command = f"openstack aggregate remove host {source_aggregate} {host}"
    remove_result = run_openstack_command(remove_command)
    results.append({
        'command': remove_command,
        'success': remove_result['success'],
        'output': remove_result['stdout'] or remove_result['stderr']
    })
    
    if not remove_result['success']:
        return jsonify({
            'error': 'Failed to remove host from source aggregate',
            'results': results
        }), 500
    
    # Add to target aggregate
    add_command = f"openstack aggregate add host {target_aggregate} {host}"
    add_result = run_openstack_command(add_command)
    results.append({
        'command': add_command,
        'success': add_result['success'],
        'output': add_result['stdout'] or add_result['stderr']
    })
    
    if not add_result['success']:
        return jsonify({
            'error': 'Failed to add host to target aggregate',
            'results': results
        }), 500
    
    return jsonify({
        'success': True,
        'results': results,
        'message': f'Successfully migrated {host} from {source_aggregate} to {target_aggregate}'
    })

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
    print("🌐 Server: http://0.0.0.0:5000")
    print("🔍 Command logging: ENABLED")
    print("=" * 60)
    app.run(debug=True, host='0.0.0.0', port=6969)
