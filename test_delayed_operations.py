#!/usr/bin/env python3
"""
Test script for delayed operations in hyperstack module
Demonstrates the timing-critical delayed operations
"""

import asyncio
import time
from modules.hyperstack import HyperstackManager


async def test_delayed_operations():
    """Test the delayed operations with shorter delays for demonstration"""
    
    def logs_callback(module, message, level, context=None):
        timestamp = time.strftime("%H:%M:%S")
        context_str = f" [{context}]" if context else ""
        print(f"[{timestamp}] LOG{context_str} [{module}] {level.upper()}: {message}")
    
    def notification_callback(message, level):
        timestamp = time.strftime("%H:%M:%S")
        print(f"[{timestamp}] NOTIFICATION [{level.upper()}]: {message}")
    
    manager = HyperstackManager(
        logs_callback=logs_callback,
        notification_callback=notification_callback
    )
    
    print("=== Testing Delayed Operations ===")
    print("Simulating successful VM launch with delayed operations...")
    
    hostname = "CA1-test-host"
    
    # Simulate the successful launch data that would trigger delayed operations
    launch_data = {
        'success': True,
        'vm_id': 'vm-12345',
        'vm_name': 'test-vm',
        'storage_network_scheduled': True,
        'firewall_scheduled': True
    }
    
    print(f"\n[{time.strftime('%H:%M:%S')}] Starting simulated launch for {hostname}")
    
    # Trigger the successful launch handler with shorter delays for testing
    start_time = time.time()
    
    # Create tasks for delayed operations with shorter delays (5s and 10s instead of 120s and 180s)
    storage_task = asyncio.create_task(manager._delayed_storage_network_operation(hostname, 5))
    firewall_task = asyncio.create_task(manager._delayed_firewall_operation(hostname, 10))
    
    # Show immediate success message
    await manager._handle_successful_launch(launch_data, hostname)
    
    print(f"\n[{time.strftime('%H:%M:%S')}] Waiting for delayed operations...")
    
    # Wait for delayed operations to complete
    await asyncio.gather(storage_task, firewall_task)
    
    end_time = time.time()
    print(f"\n[{time.strftime('%H:%M:%S')}] All operations completed in {end_time - start_time:.1f}s")
    print("✅ Delayed operations test successful!")


if __name__ == "__main__":
    asyncio.run(test_delayed_operations())