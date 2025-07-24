"""
Main coordinator module for OpenStack Spot Manager
Coordinates between modules and handles application initialization and orchestration
This is the Python equivalent of the JavaScript script.js file
"""

import asyncio
import logging
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from typing import Dict, List, Optional, Any, Callable, Set, Union
from dataclasses import dataclass, field

# Import other modules
from . import utils
from . import logs
from . import openstack
from . import frontend
from . import hyperstack


# Configure logging
logger = logging.getLogger(__name__)


@dataclass
class ApplicationState:
    """Application state management - equivalent to window globals in JS"""
    current_gpu_type: str = ''
    gpu_data_cache: Dict[str, Any] = field(default_factory=dict)
    selected_hosts: Set[str] = field(default_factory=set)
    pending_operations: List[Dict[str, Any]] = field(default_factory=list)
    is_execution_in_progress: bool = False
    command_context: Dict[str, Any] = field(default_factory=dict)


@dataclass
class OperationData:
    """Data structure for host operations"""
    hostname: str
    source_aggregate: str
    target_aggregate: str
    operation_type: str  # 'move-to-spot', 'move-to-ondemand', 'move-to-runpod'
    completed_commands: List[int] = field(default_factory=list)


class OpenStackSpotManagerCoordinator:
    """
    Main coordinator class for OpenStack Spot Manager
    Handles application initialization, event coordination, and operation execution
    """
    
    def __init__(self):
        """Initialize the coordinator with necessary components"""
        self.state = ApplicationState()
        self.utils = utils
        self.logs = logs
        self.openstack = openstack
        self.hyperstack = hyperstack
        
        # Initialize frontend manager instance
        self.frontend_manager = frontend.FrontendManager()
        
        # Thread pool for async operations
        self.thread_pool = ThreadPoolExecutor(max_workers=10)
        
        # Event handlers storage
        self.event_handlers: Dict[str, List[Callable]] = {}
        
        logger.info("🚀 Initializing OpenStack Spot Manager Coordinator")
    
    def initialize_application(self) -> bool:
        """
        Initialize the application - equivalent to DOMContentLoaded handler
        
        Returns:
            bool: True if initialization successful, False otherwise
        """
        try:
            logger.info('🚀 Initializing OpenStack Spot Manager')
            
            # Check if modules are available
            logger.info('📋 Checking module availability:')
            modules_status = {
                'utils': self.utils is not None,
                'logs': self.logs is not None,
                'openstack': self.openstack is not None,
                'frontend': self.frontend_manager is not None,
                'hyperstack': self.hyperstack is not None
            }
            
            for module_name, available in modules_status.items():
                status = "✅" if available else "❌"
                logger.info(f'  - {module_name}: {status}')
            
            if not all(modules_status.values()):
                missing_modules = [name for name, available in modules_status.items() if not available]
                logger.error(f'❌ Missing modules: {missing_modules}')
                self.logs.add_to_debug_log('System', f'Missing modules: {missing_modules}', 'error')
                return False
            
            self.logs.add_to_debug_log('System', 'Application starting up', 'info')
            
            # Initialize event listeners (server-side equivalent)
            logger.info('🔧 Initializing event handlers...')
            self._initialize_event_handlers()
            
            # Initialize debug functionality
            logger.info('🐛 Initializing debug system...')
            # Debug system is automatically available through logs module
            
            logger.info('✅ Application initialization complete')
            return True
            
        except Exception as e:
            logger.error(f'❌ Application initialization failed: {e}')
            self.logs.add_to_debug_log('System', f'Application initialization failed: {str(e)}', 'error')
            return False
    
    def _initialize_event_handlers(self):
        """Initialize event handlers - server-side equivalent of addEventListener"""
        # Register event handlers for different operations
        self.register_event_handler('gpu_type_changed', self._handle_gpu_type_change)
        self.register_event_handler('hosts_selected', self._handle_hosts_selection)
        self.register_event_handler('refresh_requested', self._handle_refresh_request)
        self.register_event_handler('operations_commit', self._handle_operations_commit)
        
        logger.info('🔧 Event handlers initialized')
    
    def register_event_handler(self, event_type: str, handler: Callable):
        """Register an event handler for a specific event type"""
        if event_type not in self.event_handlers:
            self.event_handlers[event_type] = []
        self.event_handlers[event_type].append(handler)
    
    def emit_event(self, event_type: str, *args, **kwargs):
        """Emit an event to all registered handlers"""
        if event_type in self.event_handlers:
            for handler in self.event_handlers[event_type]:
                try:
                    handler(*args, **kwargs)
                except Exception as e:
                    logger.error(f'Error in event handler for {event_type}: {e}')
    
    def _handle_gpu_type_change(self, selected_type: str):
        """Handle GPU type selection change"""
        if selected_type:
            self.state.current_gpu_type = selected_type
            logger.info(f'📊 Loading data for GPU type: {selected_type}')
            self.load_aggregate_data(selected_type)
        else:
            self.hide_main_content()
    
    def _handle_hosts_selection(self, selected_hosts: Set[str]):
        """Handle hosts selection change"""
        self.state.selected_hosts = selected_hosts
        self.update_control_buttons_state()
    
    def _handle_refresh_request(self):
        """Handle refresh data request"""
        self.refresh_data()
    
    def _handle_operations_commit(self):
        """Handle commit operations request"""
        self.commit_selected_commands()
    
    def load_aggregate_data(self, gpu_type: str) -> bool:
        """
        Load aggregate data for specified GPU type
        
        Args:
            gpu_type: The GPU type to load data for
            
        Returns:
            bool: True if successful, False otherwise
        """
        try:
            # Delegate to openstack module
            return self.openstack.load_aggregate_data(gpu_type)
        except Exception as e:
            logger.error(f'Error loading aggregate data for {gpu_type}: {e}')
            self.logs.add_to_debug_log('System', f'Error loading aggregate data: {str(e)}', 'error')
            return False
    
    def hide_main_content(self):
        """Hide main content when no GPU type selected"""
        # This would be handled by returning empty template context
        # or setting a flag in the frontend manager
        self.frontend_manager.clear_state()
    
    def move_selected_hosts(self, target_type: str) -> bool:
        """
        Move selected hosts to target type
        
        Args:
            target_type: Target aggregate type ('ondemand', 'runpod', 'spot')
            
        Returns:
            bool: True if operations added successfully, False otherwise
        """
        try:
            if not self.state.selected_hosts:
                logger.warning('No hosts selected for move operation')
                return False
            
            logger.info(f'🔄 Moving {len(self.state.selected_hosts)} hosts to {target_type}')
            self.logs.add_to_debug_log('System', f'Moving {len(self.state.selected_hosts)} hosts to {target_type}', 'info')
            
            operations_added = 0
            for hostname in self.state.selected_hosts:
                # Get source type for this host (would need to be passed or looked up)
                source_type = self._get_host_current_type(hostname)
                
                if source_type == target_type:
                    logger.warning(f'⚠️ {hostname} is already in {target_type}')
                    continue
                
                # Add to pending operations
                operation = OperationData(
                    hostname=hostname,
                    source_aggregate=source_type,
                    target_aggregate=target_type,
                    operation_type=f'move-to-{target_type}'
                )
                
                self.state.pending_operations.append(operation.__dict__)
                operations_added += 1
                
                # Add to frontend manager using proper interface
                self.frontend_manager.add_to_pending_operations(
                    hostname=hostname,
                    source_type=source_type,
                    target_type=target_type,
                    source_aggregate=source_type,
                    target_aggregate=target_type
                )
            
            # Clear selection
            self.state.selected_hosts.clear()
            self.update_control_buttons_state()
            
            logger.info(f'✅ Added {operations_added} operations to pending list')
            return operations_added > 0
            
        except Exception as e:
            logger.error(f'Error moving selected hosts: {e}')
            self.logs.add_to_debug_log('System', f'Error moving hosts: {str(e)}', 'error')
            return False
    
    def _get_host_current_type(self, hostname: str) -> str:
        """
        Get current aggregate type for a host
        This would typically query the OpenStack module or use cached data
        
        Args:
            hostname: The hostname to check
            
        Returns:
            str: Current aggregate type
        """
        # This is a placeholder - in reality would query current host aggregate
        # For now, return a default or delegate to openstack module
        return self.openstack.get_host_current_aggregate(hostname) if hasattr(self.openstack, 'get_host_current_aggregate') else 'unknown'
    
    def handle_host_click(self, hostname: str, current_selection: bool) -> bool:
        """
        Handle host card clicks for selection
        
        Args:
            hostname: The hostname that was clicked
            current_selection: Current selection state
            
        Returns:
            bool: New selection state
        """
        try:
            if current_selection:
                self.state.selected_hosts.discard(hostname)
                new_state = False
            else:
                self.state.selected_hosts.add(hostname)
                new_state = True
            
            self.update_control_buttons_state()
            return new_state
            
        except Exception as e:
            logger.error(f'Error handling host click for {hostname}: {e}')
            return current_selection
    
    def update_control_buttons_state(self):
        """Update control buttons based on current selection"""
        selected_count = len(self.state.selected_hosts)
        # Update frontend manager with selection state
        # This would be used when rendering templates
        logger.debug(f'Control buttons state: {selected_count > 0} (selected: {selected_count})')
    
    def refresh_data(self) -> bool:
        """
        Refresh data for currently selected GPU type
        
        Returns:
            bool: True if refresh initiated successfully, False otherwise
        """
        try:
            if self.state.current_gpu_type:
                logger.info(f'🔄 Refreshing data for {self.state.current_gpu_type}')
                self.logs.add_to_debug_log('System', f'Refreshing data for {self.state.current_gpu_type}', 'info')
                return self.load_aggregate_data(self.state.current_gpu_type)
            else:
                logger.warning('No GPU type selected for refresh')
                return False
                
        except Exception as e:
            logger.error(f'Error refreshing data: {e}')
            return False
    
    def show_vm_details(self, hostname: str) -> Dict[str, Any]:
        """
        Show VM details for a specific host
        
        Args:
            hostname: The hostname to show details for
            
        Returns:
            Dict containing VM details or error information
        """
        try:
            logger.info(f'📋 Showing VM details for {hostname}')
            self.logs.add_to_debug_log('System', f'Showing VM details for {hostname}', 'info', hostname)
            
            # Delegate to openstack module
            vm_details = self.openstack.get_host_vm_details(hostname)
            
            if vm_details and not vm_details.get('error'):
                logger.info(f'✅ Retrieved VM details for {hostname}')
                return vm_details
            else:
                error_msg = vm_details.get('error', 'Unknown error') if vm_details else 'No data returned'
                logger.error(f'❌ Error getting VM details for {hostname}: {error_msg}')
                return {'error': error_msg}
                
        except Exception as e:
            logger.error(f'Error showing VM details for {hostname}: {e}')
            self.logs.add_to_debug_log('System', f'Error showing VM details: {str(e)}', 'error', hostname)
            return {'error': str(e)}
    
    def commit_selected_commands(self) -> bool:
        """
        Commit selected commands for execution
        
        Returns:
            bool: True if execution started successfully, False otherwise
        """
        try:
            if not self.state.pending_operations:
                logger.warning('No pending operations to commit')
                return False
            
            if self.state.is_execution_in_progress:
                logger.warning('Execution already in progress')
                return False
            
            logger.info(f'🚀 Committing {len(self.state.pending_operations)} pending operations')
            self.logs.add_to_debug_log('System', f'Committing {len(self.state.pending_operations)} pending operations', 'info')
            
            # Execute all pending operations
            return self.execute_all_pending_operations()
            
        except Exception as e:
            logger.error(f'Error committing selected commands: {e}')
            return False
    
    def execute_all_pending_operations(self) -> bool:
        """
        Execute all pending operations sequentially
        
        Returns:
            bool: True if execution started successfully, False otherwise
        """
        try:
            operations = self.state.pending_operations.copy()
            self.state.is_execution_in_progress = True
            
            # Execute operations in a separate thread to avoid blocking
            future = self.thread_pool.submit(self._execute_operations_worker, operations)
            
            # Could add callback handling here if needed
            return True
            
        except Exception as e:
            logger.error(f'Error starting operation execution: {e}')
            self.state.is_execution_in_progress = False
            return False
    
    def _execute_operations_worker(self, operations: List[Dict[str, Any]]):
        """
        Worker method to execute operations sequentially
        
        Args:
            operations: List of operations to execute
        """
        completed = 0
        errors = []
        
        try:
            for i, operation in enumerate(operations):
                try:
                    hostname = operation['hostname']
                    source_aggregate = operation['source_aggregate']
                    target_aggregate = operation['target_aggregate']
                    
                    logger.info(f'🔄 Executing operation {i+1}/{len(operations)}: {hostname}')
                    
                    # Execute the migration
                    success = self._execute_migration(hostname, source_aggregate, target_aggregate)
                    
                    if success:
                        completed += 1
                        # Remove this operation from pending list
                        self._remove_completed_operation(operation)
                        logger.info(f'✅ Completed operation for {hostname}')
                    else:
                        errors.append(hostname)
                        logger.error(f'❌ Failed operation for {hostname}')
                        
                except Exception as e:
                    errors.append(operation.get('hostname', 'unknown'))
                    logger.error(f'❌ Error executing operation {i+1}: {e}')
            
            # Update final status
            self.state.is_execution_in_progress = False
            
            if errors:
                logger.warning(f'Completed with {len(errors)} errors: {", ".join(errors)}')
            else:
                logger.info(f'Successfully executed {completed} operations')
                self.state.pending_operations.clear()
            
            # Refresh data and logs
            self.refresh_data()
            logger.info('Operations execution completed, data refreshed')
            
        except Exception as e:
            logger.error(f'Critical error in operations worker: {e}')
            self.state.is_execution_in_progress = False
    
    def _execute_migration(self, hostname: str, source_aggregate: str, target_aggregate: str) -> bool:
        """
        Execute a single migration operation
        
        Args:
            hostname: Host to migrate
            source_aggregate: Source aggregate name
            target_aggregate: Target aggregate name
            
        Returns:
            bool: True if successful, False otherwise
        """
        try:
            # Delegate to openstack module for actual migration
            migration_data = {
                'host': hostname,
                'source_aggregate': source_aggregate,
                'target_aggregate': target_aggregate
            }
            
            return self.openstack.execute_migration(migration_data)
            
        except Exception as e:
            logger.error(f'Error executing migration for {hostname}: {e}')
            return False
    
    def _remove_completed_operation(self, completed_operation: Dict[str, Any]):
        """Remove a completed operation from the pending list"""
        try:
            # Find and remove the matching operation
            for i, operation in enumerate(self.state.pending_operations):
                if (operation.get('hostname') == completed_operation.get('hostname') and
                    operation.get('source_aggregate') == completed_operation.get('source_aggregate') and
                    operation.get('target_aggregate') == completed_operation.get('target_aggregate')):
                    
                    self.state.pending_operations.pop(i)
                    break
                    
        except Exception as e:
            logger.error(f'Error removing completed operation: {e}')
    
    def select_all_pending_operations(self):
        """Select all pending operations"""
        # This would typically update UI state
        logger.debug('Selecting all pending operations')
    
    def deselect_all_pending_operations(self):
        """Deselect all pending operations"""
        # This would typically update UI state
        logger.debug('Deselecting all pending operations')
    
    def get_pending_operations(self) -> List[Dict[str, Any]]:
        """Get all pending operations"""
        return self.state.pending_operations.copy()
    
    def clear_pending_operations(self) -> bool:
        """
        Clear all pending operations
        
        Returns:
            bool: True if cleared successfully, False otherwise
        """
        try:
            if not self.state.pending_operations:
                logger.info('No pending operations to clear')
                return False
            
            # In a real application, would show confirmation dialog
            logger.info('🗑️ Clearing all pending operations')
            self.logs.add_to_debug_log('System', 'Clearing all pending operations', 'info')
            
            self.state.pending_operations.clear()
            self.frontend_manager.clear_pending_operations()
            logger.info('All pending operations cleared')
            
            return True
            
        except Exception as e:
            logger.error(f'Error clearing pending operations: {e}')
            return False
    
    def remove_pending_operation(self, index: int) -> bool:
        """
        Remove a specific pending operation
        
        Args:
            index: Index of operation to remove
            
        Returns:
            bool: True if removed successfully, False otherwise
        """
        try:
            if 0 <= index < len(self.state.pending_operations):
                operation = self.state.pending_operations[index]
                hostname = operation.get('hostname', 'unknown')
                
                logger.info(f'🗑️ Removing pending operation: {hostname}')
                self.logs.add_to_debug_log('System', f'Removing pending operation: {hostname}', 'info')
                
                self.state.pending_operations.pop(index)
                self.frontend_manager.remove_pending_operation(index)
                logger.info(f'Removed {hostname} from pending operations')
                
                return True
            else:
                logger.warning(f'Invalid operation index: {index}')
                return False
                
        except Exception as e:
            logger.error(f'Error removing pending operation at index {index}: {e}')
            return False
    
    def execute_commands_sequentially(self, commands_by_operation: Dict[str, Any]) -> bool:
        """
        Execute commands sequentially for multiple operations
        
        Args:
            commands_by_operation: Dictionary of operations and their commands
            
        Returns:
            bool: True if execution started successfully, False otherwise
        """
        try:
            # This would implement the complex command execution logic
            # For now, delegate to a worker method
            future = self.thread_pool.submit(self._execute_commands_worker, commands_by_operation)
            return True
            
        except Exception as e:
            logger.error(f'Error starting sequential command execution: {e}')
            return False
    
    def _execute_commands_worker(self, commands_by_operation: Dict[str, Any]):
        """
        Worker method for executing commands sequentially
        
        Args:
            commands_by_operation: Dictionary of operations and their commands
        """
        try:
            errors = []
            completed_commands = 0
            
            for operation_index, operation_data in commands_by_operation.items():
                operation = operation_data['operation']
                commands = operation_data['commands']
                
                success = self._execute_commands_for_operation(operation, commands)
                
                if success:
                    completed_commands += len(commands)
                    self.logs.add_to_debug_log('System', f'Commands completed for {operation["hostname"]}', 'success')
                else:
                    errors.append(f'{operation["hostname"]} commands failed')
                    self.logs.add_to_debug_log('System', f'Commands failed for {operation["hostname"]}', 'error')
            
            # Update final status
            if errors:
                logger.warning(f'Completed with {len(errors)} errors: {", ".join(errors)}')
            else:
                logger.info(f'Successfully executed {completed_commands} commands')
            
            # Cleanup and refresh
            self._remove_completed_commands()
            self.refresh_aggregate_data_after_operations()
            logger.info('Commands execution completed, data refreshed')
            
        except Exception as e:
            logger.error(f'Error in commands worker: {e}')
    
    def _execute_commands_for_operation(self, operation: Dict[str, Any], commands: List[Dict[str, Any]]) -> bool:
        """
        Execute commands for a specific operation
        
        Args:
            operation: Operation data
            commands: List of commands to execute
            
        Returns:
            bool: True if all commands executed successfully, False otherwise
        """
        try:
            for command in commands:
                # Check if command should be executed (equivalent to checkbox check)
                if not command.get('selected', True):
                    logger.info(f'⏭️ Skipping unselected command: {command.get("title", "unknown")}')
                    continue
                
                # Execute the command
                success = self._execute_real_command(operation, command)
                
                if not success:
                    logger.error(f'❌ Command failed: {command.get("title", "unknown")}')
                    return False
                    
                logger.info(f'✅ Command completed: {command.get("title", "unknown")}')
            
            return True
            
        except Exception as e:
            logger.error(f'Error executing commands for operation: {e}')
            return False
    
    def _execute_real_command(self, operation: Dict[str, Any], command: Dict[str, Any]) -> bool:
        """
        Execute a real command based on its type
        
        Args:
            operation: Operation context
            command: Command to execute
            
        Returns:
            bool: True if successful, False otherwise
        """
        try:
            hostname = operation['hostname']
            command_title = command.get('title', '')
            
            # Determine command type from title
            command_type = self._determine_command_type(command_title)
            
            logger.info(f'🔍 Executing command type: {command_type} for {hostname}')
            
            # Execute based on command type
            if command_type == 'storage-wait-command':
                return self._execute_wait_command(120, 'VM boot completion')
            elif command_type == 'firewall-wait-command':
                return self._execute_wait_command(10, 'network stabilization')
            elif command_type == 'hyperstack-launch':
                return self._execute_hyperstack_launch(hostname)
            elif command_type == 'server-get-uuid':
                return self._execute_server_uuid_lookup(hostname)
            elif command_type == 'storage-attach-network':
                return self._execute_storage_network_attachment(hostname)
            elif command_type == 'firewall-get-attachments':
                return self._execute_firewall_query()
            elif command_type == 'firewall-update-attachments':
                return self._execute_firewall_update(hostname)
            elif command_type in ['aggregate-remove-host', 'aggregate-add-host']:
                return self._execute_aggregate_operation(operation, command_type)
            else:
                logger.error(f'Unknown command type: {command_type}')
                return False
                
        except Exception as e:
            logger.error(f'Error executing real command: {e}')
            return False
    
    def _determine_command_type(self, command_title: str) -> str:
        """Determine command type from title"""
        if 'Sleep 120 seconds' in command_title:
            return 'storage-wait-command'
        elif 'Sleep 10 seconds' in command_title:
            return 'firewall-wait-command'
        elif 'Deploy VM via Hyperstack' in command_title:
            return 'hyperstack-launch'
        elif 'Get server UUID' in command_title:
            return 'server-get-uuid'
        elif 'Attach storage network' in command_title:
            return 'storage-attach-network'
        elif 'Get current firewall' in command_title:
            return 'firewall-get-attachments'
        elif 'Update firewall' in command_title:
            return 'firewall-update-attachments'
        elif 'Remove host from' in command_title:
            return 'aggregate-remove-host'
        elif 'Add host to' in command_title:
            return 'aggregate-add-host'
        else:
            return 'unknown'
    
    def _execute_wait_command(self, duration: int, description: str) -> bool:
        """Execute a wait command"""
        try:
            logger.info(f'⏰ Waiting {duration} seconds for {description}')
            time.sleep(duration)
            logger.info(f'✅ Wait completed - {duration} seconds elapsed')
            return True
        except Exception as e:
            logger.error(f'Error in wait command: {e}')
            return False
    
    def _execute_hyperstack_launch(self, hostname: str) -> bool:
        """Execute Hyperstack VM launch"""
        try:
            logger.info(f'🚀 Deploying Hyperstack VM for {hostname}')
            result = self.hyperstack.execute_runpod_launch(hostname)
            
            if result and result.get('vm_id'):
                # Store VM ID for later use
                self.state.command_context[f'{hostname}_vm_id'] = result['vm_id']
                logger.info(f'💾 Stored VM ID for {hostname}: {result["vm_id"]}')
                return True
            
            return result is not None and not result.get('error')
            
        except Exception as e:
            logger.error(f'Error executing Hyperstack launch for {hostname}: {e}')
            return False
    
    def _execute_server_uuid_lookup(self, hostname: str) -> bool:
        """Execute server UUID lookup"""
        try:
            logger.info(f'🔍 Looking up server UUID for {hostname}')
            result = self.openstack.execute_network_command(
                f'openstack server list --all-projects --name "{hostname}" -c ID -f value'
            )
            
            if result:
                # Store UUID for later use
                self.state.command_context[f'{hostname}_uuid'] = result
                logger.info(f'💾 Stored UUID for {hostname}: {result}')
                return True
            
            return False
            
        except Exception as e:
            logger.error(f'Error looking up UUID for {hostname}: {e}')
            return False
    
    def _execute_storage_network_attachment(self, hostname: str) -> bool:
        """Execute storage network attachment"""
        try:
            logger.info(f'🌐 Attaching network to {hostname}')
            
            # Get stored UUID
            server_uuid = self.state.command_context.get(f'{hostname}_uuid')
            if not server_uuid:
                logger.error(f'Server UUID not found for {hostname}')
                return False
            
            # Use backend API for network attachment
            import json
            response = self.utils.fetch_with_timeout(
                '/api/openstack/server/add-network',
                options={
                    'method': 'POST',
                    'headers': {'Content-Type': 'application/json'},
                    'data': json.dumps({
                        'server_name': hostname,
                        'network_name': 'RunPod-Storage-Canada-1'
                    })
                }
            )
            result = response.json() if response.ok else None
            
            return result and result.get('success', False)
            
        except Exception as e:
            logger.error(f'Error attaching network to {hostname}: {e}')
            return False
    
    def _execute_firewall_query(self) -> bool:
        """Execute firewall attachments query"""
        try:
            logger.info('🛡️ Querying firewall for existing VMs')
            
            import json
            response = self.utils.fetch_with_timeout(
                '/api/hyperstack/firewall/get-attachments',
                options={
                    'method': 'POST',
                    'headers': {'Content-Type': 'application/json'},
                    'data': json.dumps({})
                }
            )
            result = response.json() if response.ok else None
            
            return result and result.get('success', False)
            
        except Exception as e:
            logger.error(f'Error querying firewall: {e}')
            return False
    
    def _execute_firewall_update(self, hostname: str) -> bool:
        """Execute firewall update"""
        try:
            logger.info(f'🛡️ Updating firewall with {hostname}')
            
            # Get stored VM ID
            vm_id = self.state.command_context.get(f'{hostname}_vm_id')
            if not vm_id:
                logger.error(f'VM ID not found for {hostname}')
                return False
            
            import json
            response = self.utils.fetch_with_timeout(
                '/api/hyperstack/firewall/update-attachments',
                options={
                    'method': 'POST',
                    'headers': {'Content-Type': 'application/json'},
                    'data': json.dumps({'vm_id': vm_id})
                }
            )
            result = response.json() if response.ok else None
            
            return result and result.get('success', False)
            
        except Exception as e:
            logger.error(f'Error updating firewall for {hostname}: {e}')
            return False
    
    def _execute_aggregate_operation(self, operation: Dict[str, Any], command_type: str) -> bool:
        """Execute aggregate add/remove operation"""
        try:
            hostname = operation['hostname']
            migration_data = {
                'host': hostname,
                'source_aggregate': operation['source_aggregate'],
                'target_aggregate': operation['target_aggregate']
            }
            
            logger.info(f'🔄 Executing aggregate operation for {hostname}')
            
            import json
            response = self.utils.fetch_with_timeout(
                '/api/execute-migration',
                options={
                    'method': 'POST',
                    'headers': {'Content-Type': 'application/json'},
                    'data': json.dumps(migration_data)
                }
            )
            result = response.json() if response.ok else None
            
            return result and result.get('success', False)
            
        except Exception as e:
            logger.error(f'Error executing aggregate operation: {e}')
            return False
    
    def _remove_completed_commands(self):
        """Remove completed commands from pending operations"""
        try:
            # Implementation would depend on how commands are tracked
            # This is a placeholder for the cleanup logic
            pass
        except Exception as e:
            logger.error(f'Error removing completed commands: {e}')
    
    def refresh_aggregate_data_after_operations(self):
        """Refresh aggregate data after operations complete"""
        try:
            if self.state.current_gpu_type:
                logger.info(f'🔄 Refreshing aggregate data after operations for {self.state.current_gpu_type}')
                
                # Add delay to ensure backend consistency
                time.sleep(2)
                
                logger.info('Refreshing host data...')
                self.load_aggregate_data(self.state.current_gpu_type)
                
                self.logs.add_to_debug_log('System', 'Aggregate data refreshed after operations completion', 'success')
                
        except Exception as e:
            logger.error(f'Error refreshing aggregate data after operations: {e}')
    
    def preload_all_gpu_types(self) -> bool:
        """
        Preload all GPU types for better performance
        
        Returns:
            bool: True if preloading started successfully, False otherwise
        """
        try:
            # Delegate to openstack module
            return self.openstack.preload_all_gpu_types()
        except Exception as e:
            logger.error(f'Error preloading GPU types: {e}')
            return False
    
    def get_application_state(self) -> Dict[str, Any]:
        """
        Get current application state
        
        Returns:
            Dict containing current application state
        """
        return {
            'current_gpu_type': self.state.current_gpu_type,
            'selected_hosts_count': len(self.state.selected_hosts),
            'pending_operations_count': len(self.state.pending_operations),
            'is_execution_in_progress': self.state.is_execution_in_progress,
            'gpu_data_cache_size': len(self.state.gpu_data_cache)
        }
    
    def shutdown(self):
        """Cleanup resources when shutting down"""
        try:
            logger.info('🔄 Shutting down OpenStack Spot Manager Coordinator')
            
            # Stop any running operations
            self.state.is_execution_in_progress = False
            
            # Shutdown thread pool
            self.thread_pool.shutdown(wait=True)
            
            logger.info('✅ Coordinator shutdown complete')
            
        except Exception as e:
            logger.error(f'Error during coordinator shutdown: {e}')


# Global coordinator instance
_coordinator_instance: Optional[OpenStackSpotManagerCoordinator] = None


def get_coordinator() -> OpenStackSpotManagerCoordinator:
    """
    Get or create the global coordinator instance
    
    Returns:
        OpenStackSpotManagerCoordinator: The global coordinator instance
    """
    global _coordinator_instance
    if _coordinator_instance is None:
        _coordinator_instance = OpenStackSpotManagerCoordinator()
    return _coordinator_instance


def initialize_coordinator() -> bool:
    """
    Initialize the global coordinator
    
    Returns:
        bool: True if initialization successful, False otherwise
    """
    coordinator = get_coordinator()
    return coordinator.initialize_application()


# Export main functions for easy access
def move_selected_hosts(target_type: str) -> bool:
    """Move selected hosts to target type"""
    return get_coordinator().move_selected_hosts(target_type)


def refresh_data() -> bool:
    """Refresh current GPU type data"""
    return get_coordinator().refresh_data()


def commit_selected_commands() -> bool:
    """Commit selected commands for execution"""
    return get_coordinator().commit_selected_commands()


def show_vm_details(hostname: str) -> Dict[str, Any]:
    """Show VM details for hostname"""
    return get_coordinator().show_vm_details(hostname)


def clear_pending_operations() -> bool:
    """Clear all pending operations"""
    return get_coordinator().clear_pending_operations()


logger.info('✅ OpenStack Spot Manager coordinator module loaded')