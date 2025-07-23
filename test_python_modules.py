#!/usr/bin/env python3
"""
Comprehensive test suite for OpenStack Spot Manager Python modules.
Tests the converted functionality to ensure all business logic is preserved.
"""

import unittest
import asyncio
import json
import tempfile
import os
from unittest.mock import Mock, patch, MagicMock, AsyncMock
from datetime import datetime
import threading
import time

# Import modules to test
from modules.utils import (
    HTTPError, check_response, fetch_with_timeout, get_status_class,
    get_status_icon, get_status_color, format_date, get_command_icon,
    safe_get, is_valid_url, truncate_string
)
from modules.logs import (
    LogLevel, CommandType, LogsManager, DebugEntry, DebugStats,
    CommandLogEntry, CommandStats, logs_manager
)
from modules.openstack import (
    OpenStackManager, MigrationCommand, openstack_manager,
    load_gpu_types, load_aggregate_data, preview_migration
)


class TestUtilsModule(unittest.TestCase):
    """Test utility functions for correctness and JavaScript compatibility."""
    
    def test_http_error_class(self):
        """Test HTTPError exception class."""
        error = HTTPError("Test error", 404)
        self.assertEqual(str(error), "Test error")
        self.assertEqual(error.status_code, 404)
        
        error_no_code = HTTPError("Test error")
        self.assertEqual(str(error_no_code), "Test error")
        self.assertIsNone(error_no_code.status_code)
    
    def test_check_response(self):
        """Test HTTP response checking."""
        # Mock successful response
        mock_response = Mock()
        mock_response.ok = True
        result = check_response(mock_response)
        self.assertEqual(result, mock_response)
        
        # Mock failed response
        mock_response.ok = False
        mock_response.status_code = 404
        with self.assertRaises(HTTPError) as context:
            check_response(mock_response)
        self.assertIn("HTTP error! status: 404", str(context.exception))
    
    @patch('modules.utils.requests.Session')
    def test_fetch_with_timeout(self, mock_session_class):
        """Test HTTP fetch with timeout functionality."""
        # Mock successful response
        mock_session = Mock()
        mock_response = Mock()
        mock_response.ok = True
        mock_session.request.return_value = mock_response
        mock_session_class.return_value = mock_session
        
        result = fetch_with_timeout("http://example.com")
        self.assertEqual(result, mock_response)
        
        # Verify request parameters
        mock_session.request.assert_called_once()
        args, kwargs = mock_session.request.call_args
        self.assertEqual(args[0], 'GET')  # method
        self.assertEqual(args[1], 'http://example.com')  # url
        self.assertEqual(kwargs['timeout'], 30)  # default timeout
    
    def test_status_utility_functions(self):
        """Test status utility functions match JavaScript behavior."""
        # Test get_status_class
        self.assertEqual(get_status_class('ACTIVE'), 'success')
        self.assertEqual(get_status_class('BUILD'), 'warning')
        self.assertEqual(get_status_class('ERROR'), 'danger')
        self.assertEqual(get_status_class('SHUTOFF'), 'secondary')
        self.assertEqual(get_status_class('UNKNOWN'), 'primary')
        
        # Test get_status_icon
        self.assertEqual(get_status_icon('ACTIVE'), 'fas fa-play-circle')
        self.assertEqual(get_status_icon('BUILD'), 'fas fa-spinner fa-spin')
        self.assertEqual(get_status_icon('ERROR'), 'fas fa-exclamation-triangle')
        self.assertEqual(get_status_icon('SHUTOFF'), 'fas fa-stop-circle')
        self.assertEqual(get_status_icon('UNKNOWN'), 'fas fa-question-circle')
        
        # Test get_status_color
        self.assertEqual(get_status_color('ACTIVE'), '#28a745')
        self.assertEqual(get_status_color('BUILD'), '#ffc107')
        self.assertEqual(get_status_color('ERROR'), '#dc3545')
        self.assertEqual(get_status_color('SHUTOFF'), '#6c757d')
        self.assertEqual(get_status_color('UNKNOWN'), '#007bff')
    
    def test_format_date(self):
        """Test date formatting utility."""
        # Test None/empty input
        self.assertEqual(format_date(None), 'N/A')
        self.assertEqual(format_date(''), 'N/A')
        
        # Test ISO format
        iso_date = "2023-12-25T10:30:00Z"
        formatted = format_date(iso_date)
        self.assertIsInstance(formatted, str)
        self.assertNotEqual(formatted, 'N/A')
        
        # Test invalid date
        self.assertEqual(format_date('invalid-date'), 'Invalid Date')
    
    def test_get_command_icon(self):
        """Test command icon utility."""
        self.assertEqual(get_command_icon('wait-command'), 'fas fa-clock')
        self.assertEqual(get_command_icon('hyperstack-launch'), 'fas fa-rocket')
        self.assertEqual(get_command_icon('aggregate-remove'), 'fas fa-minus-circle')
        self.assertEqual(get_command_icon('aggregate-add'), 'fas fa-plus-circle')
        self.assertEqual(get_command_icon('unknown'), 'fas fa-terminal')
    
    def test_utility_helpers(self):
        """Test additional utility helper functions."""
        # Test safe_get
        test_dict = {'key1': 'value1', 'key2': None}
        self.assertEqual(safe_get(test_dict, 'key1'), 'value1')
        self.assertEqual(safe_get(test_dict, 'key2'), None)
        self.assertEqual(safe_get(test_dict, 'missing'), None)
        self.assertEqual(safe_get(test_dict, 'missing', 'default'), 'default')
        
        # Test is_valid_url
        self.assertTrue(is_valid_url('http://example.com'))
        self.assertTrue(is_valid_url('https://example.com/path'))
        self.assertFalse(is_valid_url('not-a-url'))
        self.assertFalse(is_valid_url(''))
        
        # Test truncate_string
        self.assertEqual(truncate_string('short'), 'short')
        self.assertEqual(truncate_string('a' * 100, 10), 'a' * 7 + '...')
        self.assertEqual(truncate_string('test', 10, '***'), 'test')


class TestLogsModule(unittest.TestCase):
    """Test logging and debug system functionality."""
    
    def setUp(self):
        """Set up test environment."""
        self.logs_manager = LogsManager()
    
    def test_debug_entry_creation(self):
        """Test debug entry data structure."""
        entry = DebugEntry(
            timestamp="2023-12-25T10:30:00",
            type="Test",
            message="Test message",
            level="info",
            hostname="test-host"
        )
        self.assertEqual(entry.type, "Test")
        self.assertEqual(entry.message, "Test message")
        self.assertEqual(entry.level, "info")
        self.assertEqual(entry.hostname, "test-host")
    
    def test_debug_log_functionality(self):
        """Test debug log add/retrieve functionality."""
        # Add debug entries
        self.logs_manager.add_to_debug_log('System', 'Test message 1', LogLevel.INFO)
        self.logs_manager.add_to_debug_log('Operation', 'Test message 2', LogLevel.ERROR, 'host1')
        
        # Get display data
        display_data = self.logs_manager.get_debug_log_display_data()
        self.assertFalse(display_data['empty'])
        self.assertEqual(len(display_data['entries']), 2)
        
        # Check entry formatting
        entry1 = display_data['entries'][0]
        self.assertEqual(entry1['type'], 'System')
        self.assertEqual(entry1['message'], 'Test message 1')
        self.assertEqual(entry1['level'], 'INFO')
        
        entry2 = display_data['entries'][1]
        self.assertEqual(entry2['type'], 'Operation')
        self.assertEqual(entry2['hostname'], '[host1]')
        self.assertEqual(entry2['level'], 'ERROR')
    
    def test_debug_stats_tracking(self):
        """Test debug statistics tracking."""
        # Initial stats
        stats = self.logs_manager.get_debug_stats()
        self.assertEqual(stats['operations_count'], 0)
        self.assertEqual(stats['commands_executed'], 0)
        self.assertEqual(stats['errors_count'], 0)
        
        # Increment counters
        self.logs_manager.increment_operations_count()
        self.logs_manager.increment_commands_executed()
        self.logs_manager.add_to_debug_log('Test', 'Error message', LogLevel.ERROR)
        
        # Check updated stats
        stats = self.logs_manager.get_debug_stats()
        self.assertEqual(stats['operations_count'], 1)
        self.assertEqual(stats['commands_executed'], 1)
        self.assertEqual(stats['errors_count'], 1)
    
    def test_thread_safety(self):
        """Test thread safety of logs manager."""
        results = []
        errors = []
        
        def add_logs():
            try:
                for i in range(100):
                    self.logs_manager.add_to_debug_log('Thread', f'Message {i}', LogLevel.INFO)
                    self.logs_manager.increment_operations_count()
                results.append('success')
            except Exception as e:
                errors.append(str(e))
        
        # Create multiple threads
        threads = []
        for _ in range(5):
            thread = threading.Thread(target=add_logs)
            threads.append(thread)
            thread.start()
        
        # Wait for completion
        for thread in threads:
            thread.join()
        
        # Verify results
        self.assertEqual(len(errors), 0, f"Thread safety errors: {errors}")
        self.assertEqual(len(results), 5)
        
        # Check final counts
        stats = self.logs_manager.get_debug_stats()
        self.assertEqual(stats['operations_count'], 500)
        self.assertEqual(stats['debug_entries_count'], 500)
    
    def test_command_log_formatting(self):
        """Test command log formatting functionality."""
        # Create test commands
        commands = [
            {
                'timestamp': '2023-12-25T10:30:00Z',
                'command': 'nova aggregate-remove-host test-aggregate test-host',
                'hostname': 'test-host',
                'success': None,  # Preview
                'type': 'preview'
            },
            {
                'timestamp': '2023-12-25T10:31:00Z',
                'command': 'nova aggregate-add-host target-aggregate test-host',
                'hostname': 'test-host',
                'success': True,
                'type': 'success',
                'stdout': 'Host added successfully'
            },
            {
                'timestamp': '2023-12-25T10:32:00Z',
                'command': 'failed command',
                'hostname': 'test-host',
                'success': False,
                'type': 'error',
                'stderr': 'Command failed'
            }
        ]
        
        # Format for display
        display_data = self.logs_manager.format_command_log_for_display(commands)
        self.assertFalse(display_data['empty'])
        self.assertEqual(len(display_data['commands']), 3)
        
        # Check preview command
        preview_cmd = display_data['commands'][0]
        self.assertEqual(preview_cmd['status_text'], 'PREVIEW')
        self.assertEqual(preview_cmd['status_class'], 'preview')
        self.assertIsNone(preview_cmd['output'])
        
        # Check successful command
        success_cmd = display_data['commands'][1]
        self.assertEqual(success_cmd['status_text'], 'SUCCESS')
        self.assertEqual(success_cmd['status_class'], 'success')
        self.assertIsNotNone(success_cmd['output'])
        self.assertEqual(success_cmd['output']['text'], 'Host added successfully')
        
        # Check failed command
        error_cmd = display_data['commands'][2]
        self.assertEqual(error_cmd['status_text'], 'ERROR')
        self.assertEqual(error_cmd['status_class'], 'error')
        self.assertEqual(error_cmd['output']['text'], 'Command failed')
    
    def test_results_summary_generation(self):
        """Test results summary generation."""
        commands = [
            {'success': None},  # Preview
            {'success': True},  # Success
            {'success': True},  # Success
            {'success': False}, # Error
        ]
        
        summary = self.logs_manager.generate_results_summary(commands)
        
        self.assertEqual(summary['stats']['total'], 4)
        self.assertEqual(summary['stats']['successful'], 2)
        self.assertEqual(summary['stats']['failed'], 1)
        self.assertEqual(summary['stats']['preview'], 1)
        self.assertEqual(summary['error_rate'], 25)  # 1/4 = 25%
    
    def test_export_functionality(self):
        """Test debug log and command log export."""
        # Add some data
        self.logs_manager.add_to_debug_log('Test', 'Export test', LogLevel.INFO)
        self.logs_manager.increment_operations_count()
        
        # Test debug log export
        debug_export = self.logs_manager.export_debug_log()
        self.assertIn('export_time', debug_export)
        self.assertIn('stats', debug_export)
        self.assertIn('entries', debug_export)
        self.assertGreaterEqual(len(debug_export['entries']), 1)  # At least the original entry
        
        # Test command log export
        commands = [{'command': 'test', 'success': True}]
        cmd_export = self.logs_manager.export_command_log_data(commands)
        self.assertIn('export_time', cmd_export)
        self.assertIn('commands', cmd_export)
        self.assertEqual(cmd_export['count'], 1)


class TestOpenStackModule(unittest.TestCase):
    """Test OpenStack operations module functionality."""
    
    def setUp(self):
        """Set up test environment."""
        self.openstack_manager = OpenStackManager()
    
    def test_migration_command_generation(self):
        """Test migration command generation matches JavaScript logic."""
        operation = {
            'hostname': 'test-host',
            'sourceAggregate': 'source-agg',
            'targetAggregate': 'target-agg'
        }
        
        commands = OpenStackManager.generate_migration_commands(operation)
        
        # Should generate 3 commands: remove, wait, add
        self.assertEqual(len(commands), 3)
        
        # Check remove command
        remove_cmd = commands[0]
        self.assertEqual(remove_cmd.type, 'aggregate-remove')
        self.assertEqual(remove_cmd.hostname, 'test-host')
        self.assertIn('nova aggregate-remove-host source-agg test-host', remove_cmd.command)
        self.assertEqual(remove_cmd.estimated_duration, '30s')
        
        # Check wait command
        wait_cmd = commands[1]
        self.assertEqual(wait_cmd.type, 'wait-command')
        self.assertIn('sleep 60', wait_cmd.command)
        self.assertEqual(wait_cmd.estimated_duration, '60s')
        self.assertIn('aggregate-remove', wait_cmd.dependencies)
        
        # Check add command
        add_cmd = commands[2]
        self.assertEqual(add_cmd.type, 'aggregate-add')
        self.assertIn('nova aggregate-add-host target-agg test-host', add_cmd.command)
        self.assertIn('wait-command', add_cmd.dependencies)
    
    @patch('modules.openstack.requests.get')
    def test_load_gpu_types(self, mock_get):
        """Test GPU types loading functionality."""
        # Mock successful response
        mock_response = Mock()
        mock_response.raise_for_status.return_value = None
        mock_response.json.return_value = {'gpu_types': ['RTX4090', 'A100']}
        mock_get.return_value = mock_response
        
        gpu_types = self.openstack_manager.load_gpu_types()
        
        self.assertEqual(gpu_types, ['RTX4090', 'A100'])
        self.assertEqual(self.openstack_manager.available_gpu_types, ['RTX4090', 'A100'])
        mock_get.assert_called_once_with(
            '/api/gpu-types',
            timeout=10
        )
    
    @patch('modules.openstack.requests.get')
    def test_load_aggregate_data_sync(self, mock_get):
        """Test synchronous aggregate data loading with caching."""
        # Mock response data
        test_data = {
            'gpu_type': 'RTX4090',
            'spot': {'name': 'spot-agg', 'hosts': []},
            'ondemand': {'name': 'ondemand-agg', 'hosts': []},
            'runpod': {'name': 'runpod-agg', 'hosts': []}
        }
        
        mock_response = Mock()
        mock_response.raise_for_status.return_value = None
        mock_response.json.return_value = test_data
        mock_get.return_value = mock_response
        
        # First call - should hit API
        result1 = self.openstack_manager.load_aggregate_data_sync('RTX4090')
        self.assertEqual(result1, test_data)
        self.assertTrue(self.openstack_manager.is_gpu_type_cached('RTX4090'))
        
        # Second call - should use cache
        result2 = self.openstack_manager.load_aggregate_data_sync('RTX4090')
        self.assertEqual(result2, test_data)
        
        # Should only call API once due to caching
        mock_get.assert_called_once()
    
    def test_async_interface_exists(self):
        """Test that async interfaces exist (without running them)."""
        # Just verify the async methods exist and are properly defined
        self.assertTrue(hasattr(self.openstack_manager, 'load_aggregate_data'))
        self.assertTrue(hasattr(self.openstack_manager, 'execute_host_migration'))
        
        # Verify they are async functions
        import inspect
        self.assertTrue(inspect.iscoroutinefunction(self.openstack_manager.load_aggregate_data))
        self.assertTrue(inspect.iscoroutinefunction(self.openstack_manager.execute_host_migration))
    
    @patch('modules.openstack.requests.post')
    def test_preview_migration(self, mock_post):
        """Test migration preview functionality."""
        # Mock response
        preview_data = {
            'commands': ['cmd1', 'cmd2'],
            'estimated_time': '2 minutes'
        }
        mock_response = Mock()
        mock_response.raise_for_status.return_value = None
        mock_response.json.return_value = preview_data
        mock_post.return_value = mock_response
        
        result = self.openstack_manager.preview_migration(
            'test-host', 'source-agg', 'target-agg'
        )
        
        self.assertEqual(result, preview_data)
        
        # Verify correct API call
        mock_post.assert_called_once()
        call_args = mock_post.call_args
        self.assertEqual(call_args[0][0], '/api/preview-migration')
        self.assertEqual(call_args[1]['json']['host'], 'test-host')
    
    def test_cache_management(self):
        """Test cache management functionality."""
        # Add test data to cache
        test_data = {'gpu_type': 'RTX4090'}
        self.openstack_manager.gpu_data_cache['RTX4090'] = test_data
        
        # Test cache queries
        self.assertTrue(self.openstack_manager.is_gpu_type_cached('RTX4090'))
        self.assertFalse(self.openstack_manager.is_gpu_type_cached('A100'))
        self.assertEqual(self.openstack_manager.get_cached_gpu_types(), ['RTX4090'])
        
        # Test cache clearing
        self.openstack_manager.clear_cache()
        self.assertFalse(self.openstack_manager.is_gpu_type_cached('RTX4090'))
        self.assertEqual(self.openstack_manager.get_cached_gpu_types(), [])
    
    @patch('modules.openstack.requests.post')
    def test_network_command_execution(self, mock_post):
        """Test OpenStack network command execution."""
        # Test server list command
        mock_response = Mock()
        mock_response.raise_for_status.return_value = None
        mock_response.json.return_value = {'success': True, 'server_uuid': 'test-uuid'}
        mock_post.return_value = mock_response
        
        result = self.openstack_manager.execute_network_command(
            'openstack server list --all-projects --name test-server'
        )
        
        self.assertEqual(result, 'test-uuid')
        
        # Verify API call
        mock_post.assert_called_once()
        call_args = mock_post.call_args
        self.assertIn('/api/openstack/server/get-uuid', call_args[0][0])
        self.assertEqual(call_args[1]['json']['server_name'], 'test-server')


class TestIntegration(unittest.TestCase):
    """Integration tests for module interactions."""
    
    def test_logs_and_openstack_integration(self):
        """Test integration between logs and openstack modules."""
        logs_mgr = LogsManager()
        openstack_mgr = OpenStackManager()
        
        # Simulate operation with logging
        logs_mgr.add_to_debug_log('System', 'Starting migration test', LogLevel.INFO)
        logs_mgr.increment_operations_count()
        
        # Generate migration commands
        operation = {
            'hostname': 'test-host',
            'sourceAggregate': 'source',
            'targetAggregate': 'target'
        }
        commands = openstack_mgr.generate_migration_commands(operation)
        
        # Log the commands
        for cmd in commands:
            logs_mgr.add_to_debug_log(
                'Migration', 
                f'Generated command: {cmd.type}', 
                LogLevel.INFO, 
                cmd.hostname
            )
        
        # Verify integration
        stats = logs_mgr.get_debug_stats()
        self.assertEqual(stats['operations_count'], 1)
        
        debug_data = logs_mgr.get_debug_log_display_data()
        self.assertEqual(len(debug_data['entries']), 4)  # 1 start + 3 commands


class TestBusinessLogicPreservation(unittest.TestCase):
    """Test that critical business logic from JavaScript is preserved."""
    
    def test_gpu_type_workflow(self):
        """Test the complete GPU type loading workflow."""
        manager = OpenStackManager()
        
        # Simulate the workflow that happens in JavaScript
        # 1. Load GPU types (equivalent to loadGpuTypes())
        with patch('modules.openstack.requests.get') as mock_get:
            mock_response = Mock()
            mock_response.raise_for_status.return_value = None
            mock_response.json.return_value = {'gpu_types': ['RTX4090', 'A100']}
            mock_get.return_value = mock_response
            
            gpu_types = manager.load_gpu_types()
            self.assertEqual(len(gpu_types), 2)
            self.assertIn('RTX4090', gpu_types)
            self.assertIn('A100', gpu_types)
    
    def test_migration_workflow_preservation(self):
        """Test that migration workflow logic is preserved from JavaScript."""
        # This tests the equivalent of the JavaScript migration flow:
        # moveSelectedHosts() -> previewMigration() -> executeMigration()
        
        manager = OpenStackManager()
        
        # 1. Preview migration (equivalent to previewMigration())
        with patch('modules.openstack.requests.post') as mock_post:
            mock_response = Mock()
            mock_response.raise_for_status.return_value = None
            mock_response.json.return_value = {
                'commands': ['remove', 'wait', 'add'],
                'estimated_time': '2 minutes'
            }
            mock_post.return_value = mock_response
            
            preview = manager.preview_migration('host1', 'source', 'target')
            self.assertIn('commands', preview)
            self.assertIn('estimated_time', preview)
        
        # 2. Generate commands (equivalent to generateCommandsForOperation())
        operation = {'hostname': 'host1', 'sourceAggregate': 'source', 'targetAggregate': 'target'}
        commands = manager.generate_migration_commands(operation)
        
        # Verify the 3-step process is preserved
        self.assertEqual(len(commands), 3)
        self.assertEqual(commands[0].type, 'aggregate-remove')
        self.assertEqual(commands[1].type, 'wait-command')
        self.assertEqual(commands[2].type, 'aggregate-add')
        
        # Verify dependencies are correct
        self.assertEqual(commands[1].dependencies, ['aggregate-remove'])
        self.assertEqual(commands[2].dependencies, ['wait-command'])
    
    def test_debug_logging_workflow(self):
        """Test that debug logging workflow matches JavaScript behavior."""
        # Equivalent to JavaScript addToDebugLog() and related functions
        
        logs_mgr = LogsManager()
        
        # Add various log types (matches JavaScript usage patterns)
        logs_mgr.add_to_debug_log('System', 'Application started', LogLevel.INFO)
        logs_mgr.add_to_debug_log('Operation', 'Migration started', LogLevel.INFO, 'host1')
        logs_mgr.add_to_debug_log('Error', 'Connection failed', LogLevel.ERROR)
        
        # Test statistics tracking (equivalent to updateDebugStats())
        logs_mgr.increment_operations_count()
        logs_mgr.increment_commands_executed()
        
        # Verify JavaScript-like behavior
        stats = logs_mgr.get_debug_stats()
        self.assertEqual(stats['operations_count'], 1)
        self.assertEqual(stats['commands_executed'], 1)
        self.assertEqual(stats['errors_count'], 1)  # Auto-incremented on ERROR level
        
        # Test display formatting (equivalent to updateDebugLogDisplay())
        display_data = logs_mgr.get_debug_log_display_data()
        self.assertFalse(display_data['empty'])
        self.assertEqual(len(display_data['entries']), 3)
        
        # Verify hostname formatting matches JavaScript
        operation_entry = next(e for e in display_data['entries'] if e['type'] == 'Operation')
        self.assertEqual(operation_entry['hostname'], '[host1]')


def run_all_tests():
    """Run all test suites and return results."""
    test_suites = [
        TestUtilsModule,
        TestLogsModule, 
        TestOpenStackModule,
        TestIntegration,
        TestBusinessLogicPreservation
    ]
    
    results = {}
    total_tests = 0
    total_failures = 0
    total_errors = 0
    
    for suite_class in test_suites:
        suite = unittest.TestLoader().loadTestsFromTestCase(suite_class)
        runner = unittest.TextTestRunner(verbosity=2, stream=open(os.devnull, 'w'))
        result = runner.run(suite)
        
        suite_name = suite_class.__name__
        results[suite_name] = {
            'tests_run': result.testsRun,
            'failures': len(result.failures),
            'errors': len(result.errors),
            'success': result.wasSuccessful()
        }
        
        total_tests += result.testsRun
        total_failures += len(result.failures)
        total_errors += len(result.errors)
        
        # Print individual suite results
        print(f"\n{suite_name}:")
        print(f"  Tests run: {result.testsRun}")
        print(f"  Failures: {len(result.failures)}")
        print(f"  Errors: {len(result.errors)}")
        print(f"  Success: {result.wasSuccessful()}")
        
        if result.failures:
            print("  Failures:")
            for test, traceback in result.failures:
                print(f"    - {test}: {traceback.split('AssertionError:')[-1].strip()}")
        
        if result.errors:
            print("  Errors:")
            for test, traceback in result.errors:
                print(f"    - {test}: {traceback.split('Exception:')[-1].strip()}")
    
    # Print summary
    print("\n" + "="*60)
    print("TEST SUMMARY")
    print("="*60)
    print(f"Total Tests Run: {total_tests}")
    print(f"Total Failures: {total_failures}")
    print(f"Total Errors: {total_errors}")
    print(f"Success Rate: {((total_tests - total_failures - total_errors) / total_tests * 100):.1f}%")
    
    overall_success = total_failures == 0 and total_errors == 0
    print(f"Overall Result: {'PASS' if overall_success else 'FAIL'}")
    
    return results, overall_success


if __name__ == '__main__':
    print("OpenStack Spot Manager Python Module Test Suite")
    print("=" * 60)
    print("Testing JavaScript to Python conversion correctness...")
    print()
    
    results, success = run_all_tests()
    
    if success:
        print("\n✅ All tests passed! JavaScript logic successfully preserved in Python.")
    else:
        print("\n❌ Some tests failed. Review the failures above.")
        exit(1)