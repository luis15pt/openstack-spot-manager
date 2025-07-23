#!/usr/bin/env python3
"""
Example usage of the Python logs module
Demonstrates how to use the converted logs functionality
"""

from modules.logs import (
    LogsManager, LogLevel, 
    add_to_debug_log, increment_operations_count, increment_commands_executed,
    get_debug_stats, export_debug_log, format_command_log_for_display,
    generate_results_summary, export_analytics_data
)
import json
from datetime import datetime


def main():
    print("🔧 OpenStack Spot Manager - Logs Module Example")
    print("=" * 55)
    
    # Example 1: Debug logging
    print("\n📝 Adding debug log entries...")
    add_to_debug_log('System', 'Application started successfully', LogLevel.INFO)
    add_to_debug_log('Migration', 'Starting migration process', LogLevel.INFO, 'controller-1')
    add_to_debug_log('OpenStack', 'Connecting to Nova API', LogLevel.INFO, 'controller-1') 
    add_to_debug_log('Migration', 'Instance migration completed', LogLevel.SUCCESS, 'compute-1')
    add_to_debug_log('Error', 'Failed to connect to compute node', LogLevel.ERROR, 'compute-2')
    
    # Update counters
    increment_operations_count()
    increment_operations_count()
    increment_commands_executed()
    increment_commands_executed()
    increment_commands_executed()
    
    # Example 2: Get and display statistics
    print("\n📊 Current session statistics:")
    stats = get_debug_stats()
    for key, value in stats.items():
        print(f"   {key.replace('_', ' ').title()}: {value}")
    
    # Example 3: Sample command log data
    print("\n💻 Processing command log data...")
    sample_commands = [
        {
            'timestamp': datetime.now().isoformat() + 'Z',
            'command': 'nova list --all-tenants',
            'hostname': 'controller-1', 
            'success': True,
            'type': 'success',
            'stdout': '+------+--------+--------+\n| ID   | Name   | Status |\n+------+--------+--------+\n| 1234 | vm-001 | ACTIVE |\n+------+--------+--------+',
            'stderr': None
        },
        {
            'timestamp': datetime.now().isoformat() + 'Z',
            'command': 'nova live-migration vm-001 compute-2',
            'hostname': 'controller-1',
            'success': False, 
            'type': 'error',
            'stdout': None,
            'stderr': 'ERROR (BadRequest): Live migration of instance vm-001 to host compute-2 failed'
        },
        {
            'timestamp': datetime.now().isoformat() + 'Z',
            'command': 'nova show vm-001',
            'hostname': 'controller-1',
            'success': None,
            'type': 'preview', 
            'stdout': None,
            'stderr': None
        }
    ]
    
    # Example 4: Format command log for display
    formatted_commands = format_command_log_for_display(sample_commands)
    print(f"   Formatted {len(formatted_commands['commands'])} commands for display")
    
    # Example 5: Generate results summary
    summary = generate_results_summary(sample_commands)
    print(f"   Command execution summary:")
    print(f"     - Successful: {summary['stats']['successful']}")
    print(f"     - Failed: {summary['stats']['failed']}")
    print(f"     - Preview: {summary['stats']['preview']}")  
    print(f"     - Error Rate: {summary['error_rate']}%")
    
    # Example 6: Export functionality
    print("\n📤 Export functionality:")
    
    # Export debug log
    debug_export = export_debug_log()
    print(f"   Debug log exported: {len(debug_export['entries'])} entries")
    
    # Export analytics
    analytics_export = export_analytics_data(sample_commands)
    print(f"   Analytics exported: {len(analytics_export)} data points")
    
    # Example 7: JSON output samples
    print("\n📋 Sample JSON exports:")
    
    # Show a sample debug entry
    if debug_export['entries']:
        sample_entry = debug_export['entries'][0]
        print("   Debug entry sample:")
        print(f"     {json.dumps(sample_entry, indent=6)}")
    
    # Show analytics structure
    print("   Analytics structure:")
    print(f"     Session Start: {analytics_export['session_start']}")
    print(f"     Total Commands: {analytics_export['statistics']['total']}")
    print(f"     Error Rate: {analytics_export['statistics']['error_rate']}")
    
    print("\n" + "=" * 55)
    print("✅ Example completed successfully!")
    print("💡 The Python logs module provides the same functionality as the")
    print("   JavaScript version with added type safety and server-side capabilities.")


if __name__ == '__main__':
    main()