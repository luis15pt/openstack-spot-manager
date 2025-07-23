#!/usr/bin/env python3

from flask import Flask, render_template, jsonify, request, redirect, url_for, send_file
import json
import os
from datetime import datetime
from dotenv import load_dotenv
import tempfile

# Import our converted Python modules
from modules.utils import check_response, fetch_with_timeout, get_status_class, get_status_icon, get_status_color, format_date
from modules.logs import LogsManager
from modules.openstack import OpenStackManager, load_gpu_types, load_aggregate_data
from modules.frontend import FrontendManager
from modules.hyperstack import HyperstackManager
from modules.script import get_coordinator, initialize_coordinator

# Load environment variables
load_dotenv()

app = Flask(__name__)
app.secret_key = os.getenv('SECRET_KEY', 'dev-secret-key')

# Global managers
logs_manager = LogsManager()
frontend_manager = FrontendManager()
openstack_manager = OpenStackManager()
hyperstack_manager = HyperstackManager()

# Initialize the coordinator
coordinator = initialize_coordinator()

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
                    {% if host.get('gpu_used') %}| {host['gpu_used']}/{host.get('gpu_capacity', 0)} GPUs{% endif %}
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
                {% if op.get('commands') %}
                <div class="mt-2">
                    <small class="text-muted">Commands: {len(op.get('commands', []))}</small>
                </div>
                {% endif %}
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
        available_gpu_types = load_gpu_types()
        cached_gpu_types = list(openstack_manager.gpu_data_cache.keys())
        
        # Initialize template context
        context = {
            'current_gpu_type': gpu_type,
            'available_gpu_types': available_gpu_types,
            'cached_gpu_types': cached_gpu_types,
            'aggregate_data': None,
            'pending_operations': coordinator.get_pending_operations(),
            'session_stats': logs_manager.get_debug_stats(),
            'debug_entries': logs_manager.get_debug_entries(),
            'total_gpu_used': 0,
            'total_gpu_capacity': 0,
            'total_gpu_usage_percentage': 0
        }
        
        # Load aggregate data if GPU type is selected
        if gpu_type:
            try:
                aggregate_data = load_aggregate_data(gpu_type)
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
        gpu_types = load_gpu_types()
        return jsonify({'gpu_types': gpu_types})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/aggregates/<gpu_type>')
def api_aggregates(gpu_type):
    """API endpoint for aggregate data"""
    try:
        data = load_aggregate_data(gpu_type)
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
        port=int(os.getenv('FLASK_PORT', 5000)), 
        debug=os.getenv('FLASK_DEBUG', 'False').lower() == 'true'
    )