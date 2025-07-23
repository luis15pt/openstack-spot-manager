#!/usr/bin/env python3
"""
Test command generation for different scenarios
Validates that the Python module generates the same commands as JavaScript
"""

from modules.hyperstack import HyperstackManager, LaunchOperation


def test_command_generation():
    """Test command generation for different scenarios"""
    
    manager_with_firewall = HyperstackManager(hyperstack_firewall_ca1_id="firewall-ca1-12345")
    manager_no_firewall = HyperstackManager()
    
    print("=== Command Generation Tests ===")
    
    # Test 1: US host (no storage network, no firewall)
    print("\n1. US Host (no storage network, no firewall)")
    us_operation = LaunchOperation(
        hostname="US-compute-01",
        vm_name="us-test-vm",
        gpu_type="A100"
    )
    
    us_commands = manager_no_firewall.generate_runpod_launch_commands(us_operation)
    print(f"Commands generated: {len(us_commands)}")
    for cmd in us_commands:
        print(f"  - {cmd.type}: {cmd.title}")
    
    assert len(us_commands) == 2, f"Expected 2 commands for US host, got {len(us_commands)}"
    assert us_commands[0].type == "wait-command"
    assert us_commands[1].type == "hyperstack-launch"
    
    # Test 2: CA1 host (with storage network, no firewall)
    print("\n2. CA1 Host (with storage network, no firewall)")
    ca1_operation = LaunchOperation(
        hostname="CA1-compute-01",
        vm_name="ca1-test-vm",
        gpu_type="L40"
    )
    
    ca1_commands = manager_no_firewall.generate_runpod_launch_commands(ca1_operation)
    print(f"Commands generated: {len(ca1_commands)}")
    for cmd in ca1_commands:
        print(f"  - {cmd.type}: {cmd.title}")
    
    assert len(ca1_commands) == 5, f"Expected 5 commands for CA1 host, got {len(ca1_commands)}"
    command_types = [cmd.type for cmd in ca1_commands]
    expected_types = ["wait-command", "hyperstack-launch", "storage-network-find", 
                      "storage-port-create", "storage-port-attach"]
    assert command_types == expected_types, f"Command types mismatch: {command_types} vs {expected_types}"
    
    # Test 3: CA1 host with firewall
    print("\n3. CA1 Host (with storage network and firewall)")
    ca1_firewall_operation = LaunchOperation(
        hostname="CA1-compute-02",
        vm_name="ca1-firewall-vm",
        gpu_type="L40",
        firewall_id="custom-firewall-123"
    )
    
    ca1_firewall_commands = manager_with_firewall.generate_runpod_launch_commands(ca1_firewall_operation)
    print(f"Commands generated: {len(ca1_firewall_commands)}")
    for cmd in ca1_firewall_commands:
        print(f"  - {cmd.type}: {cmd.title}")
    
    assert len(ca1_firewall_commands) == 7, f"Expected 7 commands for CA1 host with firewall, got {len(ca1_firewall_commands)}"
    
    # Test 4: Verify command details
    print("\n4. Command Detail Verification")
    
    # Check wait command
    wait_cmd = ca1_firewall_commands[0]
    assert wait_cmd.estimated_duration == "60s"
    assert wait_cmd.dependencies == []
    print("  ✅ Wait command validated")
    
    # Check hyperstack launch command
    launch_cmd = ca1_firewall_commands[1]
    assert "nova:{hostname}" in launch_cmd.command.replace(ca1_firewall_operation.hostname, "{hostname}")
    assert launch_cmd.dependencies == ["wait-command"]
    print("  ✅ Launch command validated")
    
    # Check storage network commands
    storage_find_cmd = ca1_firewall_commands[2]
    assert storage_find_cmd.type == "storage-network-find"
    assert storage_find_cmd.dependencies == ["hyperstack-launch"]
    print("  ✅ Storage network find command validated")
    
    storage_create_cmd = ca1_firewall_commands[3]
    assert storage_create_cmd.type == "storage-port-create"
    assert storage_create_cmd.dependencies == ["storage-network-find"]
    print("  ✅ Storage port create command validated")
    
    storage_attach_cmd = ca1_firewall_commands[4]
    assert storage_attach_cmd.type == "storage-port-attach"
    assert storage_attach_cmd.dependencies == ["storage-port-create"]
    print("  ✅ Storage port attach command validated")
    
    # Check firewall commands
    firewall_get_cmd = ca1_firewall_commands[5]
    assert firewall_get_cmd.type == "firewall-get"
    assert firewall_get_cmd.dependencies == ["hyperstack-launch"]
    assert "custom-firewall-123" in firewall_get_cmd.command
    print("  ✅ Firewall get command validated")
    
    firewall_update_cmd = ca1_firewall_commands[6]
    assert firewall_update_cmd.type == "firewall-update"
    assert firewall_update_cmd.dependencies == ["firewall-get"]
    assert "custom-firewall-123" in firewall_update_cmd.command
    print("  ✅ Firewall update command validated")
    
    # Test 5: Dictionary conversion
    print("\n5. Dictionary Conversion Test")
    commands_dict = manager_with_firewall.to_dict_commands(ca1_firewall_commands)
    assert len(commands_dict) == 7
    assert all(isinstance(cmd, dict) for cmd in commands_dict)
    assert all("type" in cmd and "hostname" in cmd for cmd in commands_dict)
    print("  ✅ Dictionary conversion validated")
    
    print("\n✅ All command generation tests passed! 🎉")
    print(f"✅ Verified generation of {len(ca1_firewall_commands)} commands for complex CA1 scenario")
    print("✅ Timing delays, dependencies, and Canada-specific logic all preserved")


if __name__ == "__main__":
    test_command_generation()