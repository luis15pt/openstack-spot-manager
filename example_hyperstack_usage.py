#!/usr/bin/env python3
"""
Example usage of the hyperstack module
Demonstrates how to use the Python equivalent of hyperstack.js
"""

import asyncio
import logging
from modules.hyperstack import HyperstackManager, LaunchOperation, execute_runpod_launch

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')


def example_logs_callback(module: str, message: str, level: str, context: str = None):
    """Example callback for handling logs"""
    context_str = f" [{context}]" if context else ""
    print(f"LOG{context_str} [{module}] {level.upper()}: {message}")


def example_notification_callback(message: str, level: str):
    """Example callback for handling notifications"""
    print(f"NOTIFICATION [{level.upper()}]: {message}")


def example_frontend_callback(hostname: str):
    """Example callback for frontend updates"""
    print(f"FRONTEND UPDATE: Host {hostname} status updated")


async def main():
    """Main example function"""
    
    # Example 1: Using the manager class with callbacks
    print("=== Example 1: HyperstackManager with callbacks ===")
    
    manager = HyperstackManager(
        base_url="http://localhost:5000",
        logs_callback=example_logs_callback,
        notification_callback=example_notification_callback,
        frontend_callback=example_frontend_callback,
        hyperstack_firewall_ca1_id="firewall-12345"
    )
    
    # Schedule a launch
    hostname = "CA1-compute-01"
    success = manager.schedule_runpod_launch(hostname)
    print(f"Scheduled launch for {hostname}: {success}")
    
    # Generate commands for a launch operation
    print("\n=== Example 2: Generate launch commands ===")
    
    operation = LaunchOperation(
        hostname="CA1-compute-01",
        vm_name="test-vm-01",
        gpu_type="L40",
        firewall_id="firewall-12345"
    )
    
    commands = manager.generate_runpod_launch_commands(operation)
    print(f"Generated {len(commands)} commands:")
    for i, cmd in enumerate(commands, 1):
        print(f"  {i}. {cmd.title} ({cmd.type})")
        print(f"     Duration: {cmd.estimated_duration}")
        print(f"     Dependencies: {cmd.dependencies}")
    
    # Convert to dictionaries (for JSON serialization)
    commands_dict = manager.to_dict_commands(commands)
    print(f"\nCommands as dictionaries: {len(commands_dict)} items")
    
    # Example 3: Execute a launch (would normally connect to real API)
    print("\n=== Example 3: Execute launch (simulation) ===")
    
    try:
        # This would normally execute against a real API
        # For demonstration, we'll show what would happen
        print("Would execute launch for CA1-compute-01...")
        print("Note: This would normally make real API calls")
        
        # Uncomment the following line to test with a real API endpoint
        # result = await manager.execute_runpod_launch("CA1-compute-01")
        # print(f"Launch result: {result}")
        
    except Exception as e:
        print(f"Launch would fail with: {e}")
    
    # Example 4: Using convenience functions
    print("\n=== Example 4: Convenience functions ===")
    
    # Schedule using convenience function
    success = manager.schedule_runpod_launch("US-compute-01")
    print(f"Scheduled US launch: {success}")
    
    # Generate commands for US host (no storage network)
    us_operation = LaunchOperation(
        hostname="US-compute-01",
        vm_name="us-test-vm",
        gpu_type="A100"
    )
    
    us_commands = manager.generate_runpod_launch_commands(us_operation)
    print(f"US host commands: {len(us_commands)} (no storage network commands)")
    
    print("\n=== Example completed ===")


if __name__ == "__main__":
    asyncio.run(main())