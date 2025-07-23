#!/usr/bin/env python3
"""
Validation script for OpenStack Spot Manager JavaScript to Python conversion.
This script validates that all business logic has been preserved correctly.
"""

import sys
import os
import json
import tempfile
import subprocess
from datetime import datetime
from typing import Dict, List, Any, Tuple
import importlib.util

# Add the current directory to Python path for module imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

def check_module_imports() -> Tuple[bool, List[str]]:
    """Check that all Python modules can be imported successfully."""
    modules_to_test = [
        'modules.utils',
        'modules.logs', 
        'modules.openstack',
        'modules.frontend',
        'modules.hyperstack',
        'modules.script'
    ]
    
    errors = []
    
    for module_name in modules_to_test:
        try:
            spec = importlib.util.find_spec(module_name)
            if spec is None:
                errors.append(f"Module {module_name} not found")
                continue
                
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            print(f"✅ {module_name} imports successfully")
            
        except Exception as e:
            errors.append(f"Failed to import {module_name}: {str(e)}")
            print(f"❌ {module_name} import failed: {str(e)}")
    
    return len(errors) == 0, errors


def validate_function_mappings() -> Tuple[bool, List[str]]:
    """Validate that key functions from JavaScript are available in Python."""
    errors = []
    
    try:
        # Test utils module functions
        from modules.utils import (
            get_status_class, get_status_icon, get_status_color,
            format_date, get_command_icon, fetch_with_timeout
        )
        
        # Test basic function calls
        assert get_status_class('ACTIVE') == 'success'
        assert get_status_icon('BUILD') == 'fas fa-spinner fa-spin'
        assert get_command_icon('aggregate-add') == 'fas fa-plus-circle'
        print("✅ Utils module functions validated")
        
        # Test logs module functions
        from modules.logs import (
            LogsManager, add_to_debug_log, get_debug_stats,
            increment_operations_count, LogLevel
        )
        
        # Test debug logging
        add_to_debug_log('Test', 'Validation test message', LogLevel.INFO)
        stats = get_debug_stats()
        assert 'operations_count' in stats
        print("✅ Logs module functions validated")
        
        # Test openstack module functions
        from modules.openstack import (
            OpenStackManager, generate_migration_commands,
            MigrationCommand
        )
        
        # Test command generation
        operation = {
            'hostname': 'test-host',
            'sourceAggregate': 'source-agg',
            'targetAggregate': 'target-agg'
        }
        commands = generate_migration_commands(operation)
        assert len(commands) == 3
        assert isinstance(commands[0], MigrationCommand)
        print("✅ OpenStack module functions validated")
        
    except ImportError as e:
        errors.append(f"Import error during function validation: {str(e)}")
    except AssertionError as e:
        errors.append(f"Function validation assertion failed: {str(e)}")
    except Exception as e:
        errors.append(f"Unexpected error during function validation: {str(e)}")
    
    return len(errors) == 0, errors


def validate_data_structures() -> Tuple[bool, List[str]]:
    """Validate that data structures match JavaScript equivalents."""
    errors = []
    
    try:
        from modules.logs import DebugEntry, DebugStats, CommandLogEntry
        from modules.openstack import MigrationCommand
        
        # Test DebugEntry structure
        debug_entry = DebugEntry(
            timestamp="2023-12-25T10:30:00",
            type="Test",
            message="Test message",
            level="info",
            hostname="test-host"
        )
        assert debug_entry.type == "Test"
        assert debug_entry.hostname == "test-host"
        print("✅ DebugEntry data structure validated")
        
        # Test MigrationCommand structure
        migration_cmd = MigrationCommand(
            type='aggregate-remove',
            hostname='test-host',
            parent_operation='migration',
            title='Test command',
            description='Test description',
            command='test command',
            verification_commands=['verify cmd'],
            estimated_duration='30s',
            dependencies=[],
            timestamp='2023-12-25T10:30:00'
        )
        assert migration_cmd.type == 'aggregate-remove'
        assert migration_cmd.hostname == 'test-host'
        print("✅ MigrationCommand data structure validated")
        
        # Test that dataclasses can be converted to dict (for JSON serialization)
        debug_dict = debug_entry.__dict__
        cmd_dict = migration_cmd.__dict__
        assert isinstance(debug_dict, dict)
        assert isinstance(cmd_dict, dict)
        print("✅ Data structure serialization validated")
        
    except Exception as e:
        errors.append(f"Data structure validation error: {str(e)}")
    
    return len(errors) == 0, errors


def validate_business_logic() -> Tuple[bool, List[str]]:
    """Validate core business logic preservation."""
    errors = []
    
    try:
        from modules.openstack import OpenStackManager
        from modules.logs import LogsManager, LogLevel
        
        # Test migration command generation logic
        manager = OpenStackManager()
        operation = {
            'hostname': 'test-host',
            'sourceAggregate': 'source-agg',
            'targetAggregate': 'target-agg'
        }
        
        commands = manager.generate_migration_commands(operation)
        
        # Validate the 3-step migration process
        assert len(commands) == 3, f"Expected 3 commands, got {len(commands)}"
        
        # Validate command order and types
        assert commands[0].type == 'aggregate-remove', f"First command should be remove, got {commands[0].type}"
        assert commands[1].type == 'wait-command', f"Second command should be wait, got {commands[1].type}"
        assert commands[2].type == 'aggregate-add', f"Third command should be add, got {commands[2].type}"
        
        # Validate dependencies
        assert 'aggregate-remove' in commands[1].dependencies, "Wait command should depend on remove"
        assert 'wait-command' in commands[2].dependencies, "Add command should depend on wait"
        
        print("✅ Migration command generation logic validated")
        
        # Test logging business logic
        logs_mgr = LogsManager()
        
        # Test debug log functionality
        logs_mgr.add_to_debug_log('System', 'Test message', LogLevel.INFO)
        logs_mgr.increment_operations_count()
        
        stats = logs_mgr.get_debug_stats()
        assert stats['operations_count'] == 1, "Operations count should be incremented"
        
        display_data = logs_mgr.get_debug_log_display_data()
        assert not display_data['empty'], "Debug log should not be empty"
        assert len(display_data['entries']) >= 1, "Should have at least one debug entry"
        
        print("✅ Logging business logic validated")
        
        # Test caching logic
        test_data = {'gpu_type': 'RTX4090', 'test': 'data'}
        manager.gpu_data_cache['RTX4090'] = test_data
        
        assert manager.is_gpu_type_cached('RTX4090'), "Cache should contain RTX4090"
        assert not manager.is_gpu_type_cached('A100'), "Cache should not contain A100"
        
        cached_types = manager.get_cached_gpu_types()
        assert 'RTX4090' in cached_types, "Cached types should include RTX4090"
        
        print("✅ Caching business logic validated")
        
    except AssertionError as e:
        errors.append(f"Business logic assertion failed: {str(e)}")
    except Exception as e:
        errors.append(f"Business logic validation error: {str(e)}")
    
    return len(errors) == 0, errors


def validate_error_handling() -> Tuple[bool, List[str]]:
    """Validate error handling mechanisms."""
    errors = []
    
    try:
        from modules.utils import HTTPError, check_response
        from modules.openstack import OpenStackManager
        from unittest.mock import Mock
        
        # Test HTTPError exception
        try:
            raise HTTPError("Test error", 404)
        except HTTPError as e:
            assert str(e) == "Test error"
            assert e.status_code == 404
            print("✅ HTTPError exception validated")
        
        # Test response checking
        mock_response = Mock()
        mock_response.ok = False
        mock_response.status_code = 500
        
        try:
            check_response(mock_response)
            errors.append("check_response should have raised HTTPError")
        except HTTPError:
            print("✅ Response error handling validated")
        except Exception as e:
            errors.append(f"Unexpected error in response checking: {str(e)}")
        
        # Test manager error handling
        manager = OpenStackManager()
        
        # Test invalid operation handling
        try:
            invalid_operation = {}  # Missing required fields
            commands = manager.generate_migration_commands(invalid_operation)
            errors.append("Should have failed with invalid operation")
        except KeyError:
            print("✅ Invalid operation error handling validated")
        except Exception as e:
            errors.append(f"Unexpected error in operation validation: {str(e)}")
        
    except Exception as e:
        errors.append(f"Error handling validation error: {str(e)}")
    
    return len(errors) == 0, errors


def validate_performance_features() -> Tuple[bool, List[str]]:
    """Validate performance-related features like caching and async operations."""
    errors = []
    
    try:
        from modules.openstack import OpenStackManager
        import asyncio
        
        manager = OpenStackManager()
        
        # Test cache functionality
        test_data = {'test': 'cache_data'}
        gpu_type = 'test_gpu'
        
        # Initially should not be cached
        assert not manager.is_gpu_type_cached(gpu_type)
        
        # Add to cache
        manager.gpu_data_cache[gpu_type] = test_data
        
        # Should now be cached
        assert manager.is_gpu_type_cached(gpu_type)
        
        # Test cache retrieval
        cached_data = manager.gpu_data_cache.get(gpu_type)
        assert cached_data == test_data
        
        # Test cache clearing
        manager.clear_cache()
        assert not manager.is_gpu_type_cached(gpu_type)
        
        print("✅ Caching functionality validated")
        
        # Test async function exists (we won't actually run it without mocking)
        assert hasattr(manager, 'load_aggregate_data'), "Async load function should exist"
        assert hasattr(manager, 'execute_host_migration'), "Async migration function should exist"
        
        print("✅ Async functionality interface validated")
        
    except Exception as e:
        errors.append(f"Performance features validation error: {str(e)}")
    
    return len(errors) == 0, errors


def run_unit_tests() -> Tuple[bool, List[str]]:
    """Run the comprehensive unit test suite."""
    errors = []
    
    try:
        # Check if test file exists
        test_file = os.path.join(os.path.dirname(__file__), 'test_python_modules.py')
        if not os.path.exists(test_file):
            errors.append("test_python_modules.py file not found")
            return False, errors
        
        # Run the test suite
        result = subprocess.run([
            sys.executable, test_file
        ], capture_output=True, text=True, timeout=60)
        
        if result.returncode == 0:
            print("✅ Unit test suite passed")
            # Extract summary from output
            output_lines = result.stdout.split('\n')
            for line in output_lines:
                if 'TEST SUMMARY' in line or 'Overall Result:' in line or 'Success Rate:' in line:
                    print(f"  {line}")
        else:
            errors.append(f"Unit tests failed with return code {result.returncode}")
            if result.stderr:
                errors.append(f"Test errors: {result.stderr}")
        
    except subprocess.TimeoutExpired:
        errors.append("Unit tests timed out after 60 seconds")
    except FileNotFoundError:
        errors.append("Python interpreter not found or test file missing")
    except Exception as e:
        errors.append(f"Error running unit tests: {str(e)}")
    
    return len(errors) == 0, errors


def generate_validation_report(results: Dict[str, Tuple[bool, List[str]]]) -> str:
    """Generate a comprehensive validation report."""
    report = []
    report.append("OpenStack Spot Manager - JavaScript to Python Conversion Validation Report")
    report.append("=" * 80)
    report.append(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    report.append("")
    
    total_tests = len(results)
    passed_tests = sum(1 for success, _ in results.values() if success)
    
    report.append(f"SUMMARY: {passed_tests}/{total_tests} validation tests passed")
    report.append("")
    
    for test_name, (success, errors) in results.items():
        status = "PASS" if success else "FAIL"
        report.append(f"{test_name}: {status}")
        
        if errors:
            for error in errors:
                report.append(f"  ❌ {error}")
        
        report.append("")
    
    # Overall assessment
    if passed_tests == total_tests:
        report.append("✅ OVERALL RESULT: CONVERSION VALIDATION SUCCESSFUL")
        report.append("All critical business logic has been preserved in the Python conversion.")
    else:
        report.append("❌ OVERALL RESULT: CONVERSION VALIDATION FAILED")
        report.append("Some issues were found that need to be addressed.")
    
    return "\n".join(report)


def main():
    """Main validation function."""
    print("OpenStack Spot Manager - Conversion Validation")
    print("=" * 60)
    print("Validating JavaScript to Python conversion...")
    print()
    
    # Run all validation tests
    validation_tests = {
        "Module Imports": check_module_imports,
        "Function Mappings": validate_function_mappings,
        "Data Structures": validate_data_structures,
        "Business Logic": validate_business_logic,
        "Error Handling": validate_error_handling,
        "Performance Features": validate_performance_features,
        "Unit Tests": run_unit_tests
    }
    
    results = {}
    
    for test_name, test_func in validation_tests.items():
        print(f"\nRunning {test_name} validation...")
        try:
            success, errors = test_func()
            results[test_name] = (success, errors)
            
            if success:
                print(f"✅ {test_name} validation passed")
            else:
                print(f"❌ {test_name} validation failed")
                for error in errors:
                    print(f"   - {error}")
                    
        except Exception as e:
            print(f"❌ {test_name} validation crashed: {str(e)}")
            results[test_name] = (False, [f"Validation crashed: {str(e)}"])
    
    # Generate and save report
    report = generate_validation_report(results)
    
    # Save report to file
    report_file = os.path.join(os.path.dirname(__file__), 'VALIDATION_REPORT.md')
    with open(report_file, 'w') as f:
        f.write(report)
    
    print("\n" + "=" * 60)
    print("VALIDATION COMPLETE")
    print("=" * 60)
    
    total_tests = len(results)
    passed_tests = sum(1 for success, _ in results.values() if success)
    
    print(f"Tests Passed: {passed_tests}/{total_tests}")
    print(f"Success Rate: {(passed_tests/total_tests*100):.1f}%")
    
    if passed_tests == total_tests:
        print("✅ All validations passed! Conversion is successful.")
        print(f"📄 Detailed report saved to: {report_file}")
        return 0
    else:
        print("❌ Some validations failed. Review the issues above.")
        print(f"📄 Detailed report saved to: {report_file}")
        return 1


if __name__ == '__main__':
    exit(main())