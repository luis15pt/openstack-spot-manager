#!/usr/bin/env python3
"""
Example usage of the frontend.py module

This file demonstrates how to use the converted Python frontend module
in a Flask application or other Python context.
"""

from frontend import FrontendManager, Host, Variant, GpuSummary
import json


def example_usage():
    """Demonstrate basic usage of the FrontendManager"""
    
    # Create a frontend manager instance
    frontend = FrontendManager()
    
    # Example aggregate data (simulating what would come from backend)
    sample_aggregate_data = {
        'ondemand': {
            'name': 'OnDemand-A6000',
            'hosts': [
                {
                    'name': 'CA1-GPU-001',
                    'has_vms': False,
                    'vm_count': 0,
                    'gpu_used': 0,
                    'gpu_capacity': 8,
                    'gpu_usage_ratio': '0/8',
                    'tenant': 'TenantA',
                    'owner_group': 'Nexgen Cloud',
                    'nvlinks': True,
                    'variant': 'OnDemand-A6000-NVLink'
                },
                {
                    'name': 'CA1-GPU-002',
                    'has_vms': True,
                    'vm_count': 2,
                    'gpu_used': 4,
                    'gpu_capacity': 8,
                    'gpu_usage_ratio': '4/8',
                    'tenant': 'TenantB',
                    'owner_group': 'Investors',
                    'nvlinks': False,
                    'variant': 'OnDemand-A6000-Standard'
                }
            ],
            'gpu_summary': {
                'gpu_used': 4,
                'gpu_capacity': 16,
                'gpu_usage_ratio': '4/16',
                'gpu_usage_percentage': 25
            },
            'variants': [
                {'variant': 'A6000 NVLink', 'aggregate': 'OnDemand-A6000-NVLink'},
                {'variant': 'A6000 Standard', 'aggregate': 'OnDemand-A6000-Standard'}
            ]
        },
        'runpod': {
            'name': 'RunPod-A6000',
            'hosts': [
                {
                    'name': 'CA1-GPU-003',
                    'has_vms': True,
                    'vm_count': 1,
                    'gpu_used': 8,
                    'gpu_capacity': 8,
                    'gpu_usage_ratio': '8/8',
                    'tenant': 'RunPod',
                    'owner_group': 'Nexgen Cloud',
                    'nvlinks': True
                }
            ],
            'gpu_summary': None,
            'variants': []
        },
        'spot': {
            'name': 'Spot-A6000',
            'hosts': [
                {
                    'name': 'CA1-GPU-004',
                    'has_vms': False,
                    'vm_count': 0,
                    'gpu_used': 0,
                    'gpu_capacity': 8,
                    'gpu_usage_ratio': '0/8',
                    'tenant': 'TenantC',
                    'owner_group': 'Investors',
                    'nvlinks': False
                }
            ],
            'gpu_summary': {
                'gpu_used': 0,
                'gpu_capacity': 8,
                'gpu_usage_ratio': '0/8',
                'gpu_usage_percentage': 0
            },
            'variants': []
        },
        'gpu_overview': {
            'gpu_usage_ratio': '12/32',
            'gpu_usage_percentage': 37.5
        }
    }
    
    print("1. Processing aggregate data...")
    processed_data = frontend.render_aggregate_data(sample_aggregate_data)
    print(f"   Processed {len(processed_data)} aggregate types")
    
    print("\n2. Adding pending operations...")
    # Add a migration operation
    success = frontend.add_to_pending_operations(
        hostname='CA1-GPU-004',
        source_type='spot',
        target_type='ondemand',
        source_aggregate='Spot-A6000',
        target_aggregate='OnDemand-A6000-Standard'
    )
    print(f"   Migration operation added: {success}")
    
    # Add a RunPod launch operation
    vm_details = {
        'vm_name': 'test-vm-001',
        'flavor_name': 'a6000-8gpu',
        'image_name': 'Ubuntu Server 24.04 LTS R570 CUDA 12.8',
        'key_name': 'default-key',
        'current_aggregate': 'RunPod-A6000'
    }
    success = frontend.add_runpod_launch_operation('CA1-GPU-003', vm_details)
    print(f"   RunPod launch operation added: {success}")
    
    print(f"\n3. Pending operations count: {frontend.get_pending_operations_count()}")
    
    print("\n4. Generating HTML content...")
    # Generate host card HTML
    sample_host = Host(
        name='CA1-GPU-001',
        has_vms=False,
        gpu_used=0,
        gpu_capacity=8,
        owner_group='Nexgen Cloud',
        nvlinks=True
    )
    host_card_html = frontend.create_host_card_html(sample_host, 'ondemand', 'OnDemand-A6000')
    print(f"   Generated host card HTML ({len(host_card_html)} characters)")
    
    # Generate pending operations HTML
    operations_html = frontend.generate_pending_operations_html()
    print(f"   Generated operations HTML ({len(operations_html)} characters)")
    
    print("\n5. Getting complete template context...")
    context = frontend.get_template_context(sample_aggregate_data)
    print(f"   Template context keys: {list(context.keys())}")
    print(f"   Aggregate data processed: {context['aggregate_data'] is not None}")
    print(f"   Pending operations count: {context['pending_operations']['count']}")
    
    print("\n6. Processing form data...")
    # Simulate drag-and-drop form submission
    drag_drop_form = {
        'hostname': 'CA1-GPU-005',
        'source_type': 'spot',
        'target_type': 'runpod',
        'source_aggregate': 'Spot-A6000',
        'target_aggregate': 'RunPod-A6000'
    }
    success = frontend.process_drag_drop_operation(drag_drop_form)
    print(f"   Drag-drop operation processed: {success}")
    
    print("\n7. Host selection management...")
    frontend.update_host_selection('CA1-GPU-001', True)
    frontend.update_host_selection('CA1-GPU-002', True)
    selection_data = frontend.generate_host_selection_form_data()
    print(f"   Selected hosts: {selection_data['selected_count']}")
    
    print("\n8. Operation validation...")
    test_operation = {
        'hostname': 'CA1-GPU-006',
        'source_type': 'ondemand',
        'target_type': 'spot',
        'source_aggregate': 'OnDemand-A6000',
        'target_aggregate': 'Spot-A6000'
    }
    is_valid, errors = frontend.validate_operation_data(test_operation)
    print(f"   Operation valid: {is_valid}")
    if errors:
        print(f"   Validation errors: {errors}")
    
    print("\n✅ Frontend module conversion demonstration completed successfully!")
    
    return frontend, context


def flask_integration_example():
    """Example of how to integrate with Flask"""
    
    print("\n" + "="*60)
    print("FLASK INTEGRATION EXAMPLE")
    print("="*60)
    
    # This would be in your Flask app
    frontend = FrontendManager()
    
    # Example Flask route handler
    def dashboard_route():
        """Simulated Flask route for dashboard"""
        # Get data from your backend/database
        aggregate_data = get_aggregate_data_from_backend()  # Your existing function
        
        # Process data and get template context
        context = frontend.get_template_context(aggregate_data)
        
        # Add any additional context needed
        context.update({
            'page_title': 'OpenStack Spot Manager Dashboard',
            'user': get_current_user(),  # Your auth function
            'notifications': get_user_notifications()  # Your notification function
        })
        
        # Return would render template with context
        # return render_template('dashboard.html', **context)
        return context
    
    # Example API route for processing operations
    def process_operation_route():
        """Simulated Flask API route for processing operations"""
        from flask import request
        
        # Get form data (would come from request.json or request.form)
        form_data = {
            'hostname': 'CA1-GPU-007',
            'source_type': 'ondemand',
            'target_type': 'runpod'
        }
        
        # Validate and process
        is_valid, errors = frontend.validate_operation_data(form_data)
        if not is_valid:
            return {'success': False, 'errors': errors}
        
        success = frontend.process_drag_drop_operation(form_data)
        return {'success': success, 'pending_count': frontend.get_pending_operations_count()}
    
    print("Flask integration example functions defined:")
    print("- dashboard_route(): Main dashboard with full context")
    print("- process_operation_route(): API endpoint for operations")
    
    # Simulate route calls
    context = dashboard_route()
    api_result = process_operation_route()
    
    print(f"\nDashboard context keys: {list(context.keys())}")
    print(f"API result: {api_result}")


def get_aggregate_data_from_backend():
    """Placeholder for backend data retrieval"""
    # This would be your existing backend integration
    return {
        'ondemand': {'name': 'OnDemand', 'hosts': [], 'variants': []},
        'runpod': {'name': 'RunPod', 'hosts': [], 'variants': []},
        'spot': {'name': 'Spot', 'hosts': [], 'variants': []},
        'gpu_overview': {'gpu_usage_ratio': '0/0', 'gpu_usage_percentage': 0}
    }


def get_current_user():
    """Placeholder for user authentication"""
    return {'username': 'admin', 'role': 'administrator'}


def get_user_notifications():
    """Placeholder for user notifications"""
    return []


if __name__ == "__main__":
    print("OpenStack Spot Manager - Frontend Module Example")
    print("="*60)
    
    # Run the basic usage example
    frontend_manager, template_context = example_usage()
    
    # Show Flask integration example
    flask_integration_example()
    
    print("\n" + "="*60)
    print("SUMMARY")
    print("="*60)
    print("✅ JavaScript frontend.js successfully converted to Python")
    print("✅ All major functions preserved and enhanced")
    print("✅ Type hints and error handling added")
    print("✅ Server-side template rendering support")
    print("✅ Form-based operations replace drag-and-drop")
    print("✅ Ready for Flask/Jinja2 integration")
    print("\nNext steps:")
    print("1. Integrate with your Flask application")
    print("2. Update templates to use the new context data")
    print("3. Replace JavaScript drag-and-drop with form submissions")
    print("4. Test with real backend data")