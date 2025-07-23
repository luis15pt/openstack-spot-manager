#!/usr/bin/env python3

from flask import Flask, render_template, jsonify, request, redirect, url_for, send_file
import json
import os
from datetime import datetime
from dotenv import load_dotenv
import tempfile
import openstack
import requests
from concurrent.futures import ThreadPoolExecutor, as_completed
import time
import threading

# Import our converted Python modules
from modules.utils import check_response, fetch_with_timeout, get_status_class, get_status_icon, get_status_color, format_date
from modules.logs import LogsManager
from modules.openstack import OpenStackManager
from modules.frontend import FrontendManager
from modules.hyperstack import HyperstackManager
from modules.script import get_coordinator, initialize_coordinator

# Load environment variables
load_dotenv()

# Global OpenStack connection - standalone implementation
_openstack_connection = None

# NetBox configuration
NETBOX_URL = os.getenv('NETBOX_URL')
NETBOX_API_KEY = os.getenv('NETBOX_API_KEY')

# Cache for NetBox tenant lookups
_tenant_cache = {}

def get_openstack_connection():
    """Get or create OpenStack connection - standalone implementation"""
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
                region_name=os.getenv('OS_REGION_NAME', 'RegionOne')
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
        for aggregate in aggregates:
            if aggregate.name == aggregate_name:
                return aggregate
        return None
    except Exception as e:
        print(f"❌ Error finding aggregate {aggregate_name}: {e}")
        return None

def discover_gpu_aggregates():
    """Dynamically discover GPU aggregates from OpenStack with variant support"""
    try:
        conn = get_openstack_connection()
        if not conn:
            return {}
        
        aggregates = list(conn.compute.aggregates())
        gpu_aggregates = {}
        
        # Pattern matching for different GPU types and variants
        for aggregate in aggregates:
            name = aggregate.name
            
            # Extract GPU type from aggregate name
            gpu_type = None
            aggregate_type = None
            
            # Handle various naming patterns
            if 'H100' in name:
                if 'SXM5-GB' in name:
                    gpu_type = 'H100-SXM5-GB'
                elif 'SXM5' in name:
                    gpu_type = 'H100-SXM5'
                else:
                    gpu_type = 'H100'
            elif 'H200' in name:
                gpu_type = 'H200-SXM5'
            elif 'A100' in name:
                gpu_type = 'A100'
            elif 'RTX-A6000' in name:
                gpu_type = 'RTX-A6000'
            elif 'L40' in name:
                gpu_type = 'L40'
            
            if not gpu_type:
                continue
                
            # Determine aggregate type
            if 'spot' in name.lower():
                aggregate_type = 'spot'
            elif 'runpod' in name.lower():
                aggregate_type = 'runpod'
            else:
                aggregate_type = 'ondemand'
            
            # Initialize GPU type if not exists
            if gpu_type not in gpu_aggregates:
                gpu_aggregates[gpu_type] = {
                    'ondemand': None,
                    'ondemand_variants': [],
                    'spot': None,
                    'runpod': None
                }
            
            # Set the aggregate
            if aggregate_type == 'ondemand':
                if gpu_aggregates[gpu_type]['ondemand'] is None:
                    gpu_aggregates[gpu_type]['ondemand'] = name
                
                # Add to variants
                gpu_aggregates[gpu_type]['ondemand_variants'].append({
                    'aggregate': name,
                    'variant': name
                })
            else:
                gpu_aggregates[gpu_type][aggregate_type] = name
        
        print(f"📊 Discovered GPU aggregates: {gpu_aggregates}")
        return gpu_aggregates
        
    except Exception as e:
        print(f"❌ Error discovering GPU aggregates: {e}")
        return {}

def get_aggregate_hosts(aggregate_name):
    """Get hosts in an aggregate using OpenStack SDK - standalone implementation"""
    try:
        conn = get_openstack_connection()
        if not conn:
            print(f"❌ No OpenStack connection available")
            return None
        
        aggregate = find_aggregate_by_name(conn, aggregate_name)
        if not aggregate:
            print(f"❌ Aggregate '{aggregate_name}' not found")
            return None
        
        hosts = []
        gpu_used_total = 0
        gpu_capacity_total = 0
        
        for host_name in aggregate.hosts:
            try:
                # Get basic host info
                host_info = {
                    'name': host_name,
                    'has_vms': False,
                    'vm_count': 0,
                    'gpu_used': 0,
                    'gpu_capacity': 8,  # Default capacity
                    'owner_group': 'Production',
                    'tenant': 'Unknown'
                }
                
                # Get VM count for this host
                servers = list(conn.compute.servers(all_projects=True, host=host_name))
                host_info['vm_count'] = len(servers)
                host_info['has_vms'] = len(servers) > 0
                
                # Estimate GPU usage (simplified)
                host_info['gpu_used'] = min(len(servers) * 2, host_info['gpu_capacity'])
                
                gpu_used_total += host_info['gpu_used']
                gpu_capacity_total += host_info['gpu_capacity']
                
                hosts.append(host_info)
                
            except Exception as e:
                print(f"⚠️ Error getting info for host {host_name}: {e}")
                # Add host with minimal info
                hosts.append({
                    'name': host_name,
                    'has_vms': False,
                    'vm_count': 0,
                    'gpu_used': 0,
                    'gpu_capacity': 8,
                    'owner_group': 'Production',
                    'tenant': 'Unknown'
                })
        
        gpu_usage_ratio = f"{int((gpu_used_total/gpu_capacity_total)*100)}%" if gpu_capacity_total > 0 else "0%"
        
        return {
            'hosts': hosts,
            'gpu_summary': {
                'gpu_used': gpu_used_total,
                'gpu_capacity': gpu_capacity_total,
                'gpu_usage_ratio': gpu_usage_ratio
            }
        }
        
    except Exception as e:
        print(f"❌ Error getting aggregate hosts for {aggregate_name}: {e}")
        return None

app = Flask(__name__)
app.secret_key = os.getenv('SECRET_KEY', 'dev-secret-key')

# Global managers
logs_manager = LogsManager()
frontend_manager = FrontendManager()
openstack_manager = OpenStackManager()
hyperstack_manager = HyperstackManager()

# Initialize the coordinator
coordinator = get_coordinator()
initialize_coordinator()  # This just initializes it, but we need the actual coordinator object

# Internal data loading functions - standalone Python implementation
def load_gpu_types_internal():
    """Load GPU types using standalone Python implementation"""
    try:
        gpu_aggregates = discover_gpu_aggregates()
        gpu_types = list(gpu_aggregates.keys())
        
        if gpu_types:
            logs_manager.add_to_debug_log('System', f'Successfully loaded {len(gpu_types)} GPU types from OpenStack: {gpu_types}', 'SUCCESS')
            return gpu_types
        else:
            logs_manager.add_to_debug_log('System', 'No GPU types found in OpenStack - using demo data', 'WARNING')
            return ['A100', 'H100', 'RTX-A6000', 'V100']
            
    except Exception as e:
        logs_manager.add_to_debug_log('System', f'Error loading GPU types: {str(e)} - using demo data', 'WARNING')
        return ['A100', 'H100', 'RTX-A6000', 'V100']

def load_aggregate_data_internal(gpu_type):
    """Load aggregate data using standalone Python implementation"""
    try:
        # Get GPU aggregates discovery data
        gpu_aggregates = discover_gpu_aggregates()
        
        if gpu_type not in gpu_aggregates:
            logs_manager.add_to_debug_log('System', f'GPU type {gpu_type} not found in discovered aggregates', 'WARNING')
            # Return demo data
            return create_demo_data(gpu_type)
            
        config = gpu_aggregates[gpu_type]
        
        # Get the aggregate data
        result = {
            'gpu_type': gpu_type,
            'spot': None,
            'ondemand': None,
            'runpod': None
        }
        
        # Process spot aggregate
        if config.get('spot'):
            try:
                spot_data = get_aggregate_hosts(config['spot'])
                if spot_data:
                    result['spot'] = {
                        'name': config['spot'],
                        'hosts': spot_data.get('hosts', []),
                        'gpu_summary': spot_data.get('gpu_summary', {})
                    }
            except Exception as e:
                logs_manager.add_to_debug_log('System', f'Error loading spot data: {str(e)}', 'ERROR')
        
        # Process ondemand aggregate  
        if config.get('ondemand'):
            try:
                ondemand_data = get_aggregate_hosts(config['ondemand'])
                if ondemand_data:
                    result['ondemand'] = {
                        'name': config['ondemand'],
                        'hosts': ondemand_data.get('hosts', []),
                        'gpu_summary': ondemand_data.get('gpu_summary', {}),
                        'variants': config.get('ondemand_variants', [])
                    }
            except Exception as e:
                logs_manager.add_to_debug_log('System', f'Error loading ondemand data: {str(e)}', 'ERROR')
        
        # Process runpod aggregate
        if config.get('runpod'):
            try:
                runpod_data = get_aggregate_hosts(config['runpod'])
                if runpod_data:
                    result['runpod'] = {
                        'name': config['runpod'], 
                        'hosts': runpod_data.get('hosts', [])
                    }
            except Exception as e:
                logs_manager.add_to_debug_log('System', f'Error loading runpod data: {str(e)}', 'ERROR')
        
        # If we got real data, return it
        if any([result['spot'], result['ondemand'], result['runpod']]):
            logs_manager.add_to_debug_log('System', f'Successfully loaded real data for {gpu_type}', 'SUCCESS')
            return result
        else:
            # Fall back to demo data
            logs_manager.add_to_debug_log('System', f'No real data found for {gpu_type} - using demo data', 'INFO')
            return create_demo_data(gpu_type)
        
    except Exception as e:
        logs_manager.add_to_debug_log('System', f'Error loading aggregate data for {gpu_type}: {str(e)} - using demo data', 'WARNING')
        return create_demo_data(gpu_type)

def create_demo_data(gpu_type):
    """Create demo data for testing purposes"""
    return {
        'gpu_type': gpu_type,
        'spot': {
            'name': f'{gpu_type}-spot',
            'hosts': [
                {'name': f'demo-host-01', 'has_vms': False, 'vm_count': 0, 'gpu_used': 0, 'gpu_capacity': 8, 'owner_group': 'Demo'},
                {'name': f'demo-host-02', 'has_vms': True, 'vm_count': 2, 'gpu_used': 4, 'gpu_capacity': 8, 'owner_group': 'Demo'}
            ],
            'gpu_summary': {'gpu_used': 4, 'gpu_capacity': 16, 'gpu_usage_ratio': '25%'}
        },
        'ondemand': {
            'name': f'{gpu_type}-ondemand',
            'hosts': [
                {'name': f'demo-host-03', 'has_vms': True, 'vm_count': 1, 'gpu_used': 2, 'gpu_capacity': 8, 'owner_group': 'Demo'}
            ],
            'gpu_summary': {'gpu_used': 2, 'gpu_capacity': 8, 'gpu_usage_ratio': '25%'}
        },
        'runpod': {
            'name': f'{gpu_type}-runpod',
            'hosts': [
                {'name': f'demo-host-04', 'has_vms': False, 'vm_count': 0, 'gpu_used': 0, 'gpu_capacity': 8, 'owner_group': 'Demo'}
            ]
        }
    }

# Template filters
@app.template_filter('safe')
def safe_filter(text):
    """Mark text as safe for template rendering"""
    from markupsafe import Markup
    return Markup(text)

def render_hosts_html(hosts, host_type):
    """Template function to render hosts HTML"""
    if not hosts:
        return '<p class="text-muted">No hosts available</p>'
    
    html = []
    for host in hosts:
        checked = 'checked' if host.get('selected', False) else ''
        status_class = get_status_class(host.get('status', 'UNKNOWN'))
        
        html.append(f'''
        <div class="form-check mb-2">
            <input class="form-check-input" type="checkbox" name="selected_hosts" 
                   value="{host['name']}" id="host_{host['name']}" {checked}>
            <label class="form-check-label d-flex justify-content-between" for="host_{host['name']}">
                <span>
                    <i class="fas fa-server text-{status_class}"></i>
                    {host['name']}
                </span>
                <span class="text-muted small">
                    {host.get('vm_count', 0)} VMs
                    {f"| {host['gpu_used']}/{host.get('gpu_capacity', 0)} GPUs" if host.get('gpu_used') else ""}
                </span>
            </label>
        </div>
        ''')
    
    return ''.join(html)

def render_pending_operations_html(operations):
    """Template function to render pending operations HTML"""
    if not operations:
        return '<p class="text-muted">No pending operations</p>'
    
    html = []
    for i, op in enumerate(operations):
        op_type = op.get('type', 'unknown')
        icon = 'fas fa-arrows-alt-h' if op_type == 'migration' else 'fas fa-rocket'
        
        html.append(f'''
        <div class="card mb-2">
            <div class="card-body">
                <div class="d-flex justify-content-between align-items-center">
                    <div>
                        <h6 class="mb-1">
                            <i class="{icon}"></i>
                            {op.get('hostname', 'Unknown Host')}
                        </h6>
                        <small class="text-muted">
                            {op.get('source_type', '')} → {op.get('target_type', '')}
                            | {op.get('timestamp', '')}
                        </small>
                    </div>
                    <span class="badge bg-secondary">{op_type.title()}</span>
                </div>
        ''')
        
        if op.get('commands'):
            html.append(f'''
                <div class="mt-2">
                    <small class="text-muted">Commands: {len(op.get('commands', []))}</small>
                </div>
            ''')
        
        html.append('''
            </div>
        </div>
        ''')
    
    return ''.join(html)

# Add template functions to Jinja2 globals
app.jinja_env.globals.update(
    render_hosts_html=render_hosts_html,
    render_pending_operations_html=render_pending_operations_html
)

@app.route('/')
def index():
    """Redirect to dashboard"""
    return redirect(url_for('dashboard'))

@app.route('/dashboard')
def dashboard():
    """Main dashboard route"""
    try:
        # Get GPU type from query parameter
        gpu_type = request.args.get('gpu_type', '')
        
        # Load available GPU types
        available_gpu_types = load_gpu_types_internal()
        cached_gpu_types = list(openstack_manager.gpu_data_cache.keys())
        
        # Debug logging
        logs_manager.add_to_debug_log('Dashboard', f'Loading dashboard with GPU types: {available_gpu_types}', 'INFO')
        
        # Initialize template context
        context = {
            'current_gpu_type': gpu_type,
            'available_gpu_types': available_gpu_types,
            'cached_gpu_types': cached_gpu_types,
            'aggregate_data': None,
            'pending_operations': [op.__dict__ for op in frontend_manager.pending_operations],
            'session_stats': logs_manager.get_debug_stats(),
            'debug_entries': logs_manager._debug_entries,
            'total_gpu_used': 0,
            'total_gpu_capacity': 0,
            'total_gpu_usage_percentage': 0
        }
        
        # Load aggregate data if GPU type is selected
        if gpu_type:
            try:
                aggregate_data = load_aggregate_data_internal(gpu_type)
                if aggregate_data:
                    context['aggregate_data'] = aggregate_data
                    
                    # Calculate total GPU usage
                    total_used = 0
                    total_capacity = 0
                    
                    for section in ['spot', 'ondemand', 'runpod']:
                        if section in aggregate_data and aggregate_data[section]:
                            summary = aggregate_data[section].get('gpu_summary', {})
                            total_used += summary.get('gpu_used', 0)
                            total_capacity += summary.get('gpu_capacity', 0)
                    
                    context['total_gpu_used'] = total_used
                    context['total_gpu_capacity'] = total_capacity
                    context['total_gpu_usage_percentage'] = (
                        (total_used / total_capacity * 100) if total_capacity > 0 else 0
                    )
                    
                    # Log the data load
                    logs_manager.add_to_debug_log(
                        'Dashboard', 
                        f'Loaded aggregate data for {gpu_type}', 
                        'INFO'
                    )
                else:
                    logs_manager.add_to_debug_log(
                        'Dashboard', 
                        f'No aggregate data found for {gpu_type}', 
                        'WARNING'
                    )
            except Exception as e:
                logs_manager.add_to_debug_log(
                    'Dashboard', 
                    f'Error loading aggregate data for {gpu_type}: {str(e)}', 
                    'ERROR'
                )
        
        return render_template('dashboard.html', **context)
        
    except Exception as e:
        logs_manager.add_to_debug_log(
            'Dashboard', 
            f'Error rendering dashboard: {str(e)}', 
            'ERROR'
        )
        return render_template('dashboard.html', 
                             current_gpu_type='',
                             available_gpu_types=[],
                             cached_gpu_types=[],
                             error=str(e))

@app.route('/process_operations', methods=['POST'])
def process_operations():
    """Process host operations (move hosts, launch VMs)"""
    try:
        gpu_type = request.form.get('gpu_type', '')
        action = request.form.get('action', '')
        selected_hosts = request.form.getlist('selected_hosts')
        
        if not selected_hosts:
            logs_manager.add_to_debug_log(
                'Operations', 
                'No hosts selected for operation', 
                'WARNING'
            )
            return redirect(url_for('dashboard', gpu_type=gpu_type))
        
        logs_manager.add_to_debug_log(
            'Operations', 
            f'Processing {action} for {len(selected_hosts)} hosts', 
            'INFO'
        )
        
        # Process the action
        if action == 'move_to_spot':
            coordinator.move_selected_hosts(selected_hosts, 'spot')
        elif action == 'move_to_ondemand':
            coordinator.move_selected_hosts(selected_hosts, 'ondemand')
        elif action == 'launch_runpod':
            for hostname in selected_hosts:
                coordinator.add_runpod_launch_operation(hostname)
        else:
            logs_manager.add_to_debug_log(
                'Operations', 
                f'Unknown action: {action}', 
                'ERROR'
            )
        
        return redirect(url_for('dashboard', gpu_type=gpu_type))
        
    except Exception as e:
        logs_manager.add_to_debug_log(
            'Operations', 
            f'Error processing operations: {str(e)}', 
            'ERROR'
        )
        return redirect(url_for('dashboard', gpu_type=gpu_type))

@app.route('/execute_operations', methods=['POST'])
def execute_operations():
    """Execute all pending operations"""
    try:
        result = coordinator.commit_selected_commands()
        
        if result.get('success'):
            logs_manager.add_to_debug_log(
                'Operations', 
                f'Successfully executed {result.get("executed_count", 0)} operations', 
                'SUCCESS'
            )
        else:
            logs_manager.add_to_debug_log(
                'Operations', 
                f'Failed to execute operations: {result.get("error", "Unknown error")}', 
                'ERROR'
            )
        
        return redirect(url_for('dashboard'))
        
    except Exception as e:
        logs_manager.add_to_debug_log(
            'Operations', 
            f'Error executing operations: {str(e)}', 
            'ERROR'
        )
        return redirect(url_for('dashboard'))

@app.route('/clear_operations', methods=['POST'])
def clear_operations():
    """Clear all pending operations"""
    try:
        coordinator.clear_pending_operations()
        logs_manager.add_to_debug_log(
            'Operations', 
            'Cleared all pending operations', 
            'INFO'
        )
        return redirect(url_for('dashboard'))
        
    except Exception as e:
        logs_manager.add_to_debug_log(
            'Operations', 
            f'Error clearing operations: {str(e)}', 
            'ERROR'
        )
        return redirect(url_for('dashboard'))

@app.route('/reset_session', methods=['POST'])
def reset_session():
    """Reset session statistics"""
    try:
        logs_manager.reset_session_stats()
        logs_manager.clear_debug_log()
        coordinator.clear_pending_operations()
        
        logs_manager.add_to_debug_log(
            'System', 
            'Session reset completed', 
            'INFO'
        )
        return redirect(url_for('dashboard'))
        
    except Exception as e:
        logs_manager.add_to_debug_log(
            'System', 
            f'Error resetting session: {str(e)}', 
            'ERROR'
        )
        return redirect(url_for('dashboard'))

@app.route('/export_debug_log')
def export_debug_log():
    """Export debug log as JSON file"""
    try:
        debug_data = logs_manager.export_debug_log()
        
        # Create temporary file
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            json.dump(debug_data, f, indent=2, default=str)
            temp_path = f.name
        
        filename = f"debug-log-{datetime.now().strftime('%Y-%m-%d')}.json"
        
        logs_manager.add_to_debug_log(
            'Export', 
            f'Exported debug log: {filename}', 
            'INFO'
        )
        
        return send_file(temp_path, as_attachment=True, download_name=filename)
        
    except Exception as e:
        logs_manager.add_to_debug_log(
            'Export', 
            f'Error exporting debug log: {str(e)}', 
            'ERROR'
        )
        return redirect(url_for('dashboard'))

@app.route('/export_analytics')
def export_analytics():
    """Export analytics data as JSON file"""
    try:
        analytics_data = logs_manager.export_analytics()
        
        # Create temporary file
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            json.dump(analytics_data, f, indent=2, default=str)
            temp_path = f.name
        
        filename = f"analytics-{datetime.now().strftime('%Y-%m-%d')}.json"
        
        logs_manager.add_to_debug_log(
            'Export', 
            f'Exported analytics: {filename}', 
            'INFO'
        )
        
        return send_file(temp_path, as_attachment=True, download_name=filename)
        
    except Exception as e:
        logs_manager.add_to_debug_log(
            'Export', 
            f'Error exporting analytics: {str(e)}', 
            'ERROR'
        )
        return redirect(url_for('dashboard'))

# API endpoints for compatibility with existing system
@app.route('/api/gpu-types')
def api_gpu_types():
    """API endpoint for GPU types"""
    try:
        gpu_types = load_gpu_types_internal()
        return jsonify({'gpu_types': gpu_types})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/aggregates/<gpu_type>')
def api_aggregates(gpu_type):
    """API endpoint for aggregate data"""
    try:
        data = load_aggregate_data_internal(gpu_type)
        return jsonify(data)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/debug-log')
def api_debug_log():
    """API endpoint for debug log"""
    try:
        entries = logs_manager.get_debug_entries()
        stats = logs_manager.get_debug_stats()
        return jsonify({
            'entries': [entry.__dict__ for entry in entries],
            'stats': stats.__dict__
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/pending-operations')
def api_pending_operations():
    """API endpoint for pending operations"""
    try:
        operations = coordinator.get_pending_operations()
        return jsonify({'operations': operations})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    # Initialize logging
    logs_manager.add_to_debug_log(
        'System', 
        'OpenStack Spot Manager (Python Edition) starting up', 
        'INFO'
    )
    
    # Run the Flask app
    app.run(
        host='0.0.0.0', 
        port=int(os.getenv('FLASK_PORT', 6969)), 
        debug=os.getenv('FLASK_DEBUG', 'False').lower() == 'true'
    )