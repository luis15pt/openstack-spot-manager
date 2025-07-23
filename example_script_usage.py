#!/usr/bin/env python3
"""
Example usage of the script.py module
Demonstrates how to use the converted JavaScript coordinator in Python
"""

from modules.script import (
    get_coordinator,
    initialize_coordinator,
    move_selected_hosts,
    refresh_data,
    commit_selected_commands,
    show_vm_details,
    clear_pending_operations
)

def main():
    """Main example function"""
    print("🚀 OpenStack Spot Manager Script Module Example")
    print("=" * 50)
    
    # Initialize the coordinator
    print("\n1. Initializing coordinator...")
    success = initialize_coordinator()
    print(f"   Initialization: {'✅ Success' if success else '❌ Failed'}")
    
    # Get coordinator instance
    coordinator = get_coordinator()
    print(f"   Coordinator type: {type(coordinator).__name__}")
    
    # Check initial state
    print("\n2. Checking initial state...")
    state = coordinator.get_application_state()
    print(f"   Current GPU type: '{state['current_gpu_type']}'")
    print(f"   Selected hosts: {state['selected_hosts_count']}")
    print(f"   Pending operations: {state['pending_operations_count']}")
    print(f"   Execution in progress: {state['is_execution_in_progress']}")
    
    # Simulate host selection
    print("\n3. Simulating host selection...")
    result = coordinator.handle_host_click('example-host-1', False)
    print(f"   Host selected: {result}")
    
    result = coordinator.handle_host_click('example-host-2', False)
    print(f"   Another host selected: {result}")
    
    # Check updated state
    state = coordinator.get_application_state()
    print(f"   Total selected hosts: {state['selected_hosts_count']}")
    
    # Move hosts to different aggregates
    print("\n4. Moving hosts to spot aggregate...")
    result = coordinator.move_selected_hosts('spot')
    print(f"   Move operation added: {'✅ Success' if result else '❌ Failed'}")
    
    # Check pending operations
    state = coordinator.get_application_state()
    print(f"   Pending operations: {state['pending_operations_count']}")
    
    # Demonstrate public API functions
    print("\n5. Testing public API functions...")
    
    # Refresh data
    result = refresh_data()
    print(f"   Refresh data: {'✅ Success' if result else '❌ No GPU type selected'}")
    
    # Show VM details (would normally connect to OpenStack)
    print("   Getting VM details for example-host-1...")
    vm_details = show_vm_details('example-host-1')
    if 'error' in vm_details:
        print(f"   VM details error (expected): {vm_details['error']}")
    
    # Clear pending operations
    result = clear_pending_operations()
    print(f"   Clear operations: {'✅ Success' if result else '❌ No operations to clear'}")
    
    # Event system example
    print("\n6. Testing event system...")
    coordinator.register_event_handler('example_event', lambda x: print(f"   Event received: {x}"))
    coordinator.emit_event('example_event', 'Hello from event system!')
    
    # Command execution example (simulated)
    print("\n7. Simulating command execution...")
    # Add a test operation
    coordinator.state.pending_operations.append({
        'hostname': 'test-host',
        'source_aggregate': 'ondemand',
        'target_aggregate': 'spot',
        'operation_type': 'move-to-spot'
    })
    
    print(f"   Added test operation. Pending count: {len(coordinator.state.pending_operations)}")
    
    # The commit would normally execute real operations
    print("   Note: commit_selected_commands() would execute real OpenStack operations")
    
    # Final state
    print("\n8. Final state...")
    final_state = coordinator.get_application_state()
    for key, value in final_state.items():
        print(f"   {key}: {value}")
    
    # Cleanup
    print("\n9. Cleaning up...")
    coordinator.shutdown()
    print("   ✅ Coordinator shutdown complete")
    
    print("\n🎉 Example completed successfully!")
    print("\nThe script.py module provides:")
    print("  • Application state management")
    print("  • Host selection and operation coordination")
    print("  • Pending operations management")
    print("  • Command execution orchestration")
    print("  • Event-driven architecture")
    print("  • Integration with all other modules")


if __name__ == "__main__":
    main()