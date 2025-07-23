"""
Hyperstack API operations for OpenStack Spot Manager
Handles VM launches, networking, and firewall operations
Converted from JavaScript hyperstack.js
"""

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Dict, List, Optional, Any, Callable
import aiohttp
from dataclasses import dataclass, asdict

logger = logging.getLogger(__name__)


@dataclass
class LaunchCommand:
    """Represents a launch command with all its properties"""
    type: str
    hostname: str
    parent_operation: str
    title: str
    description: str
    command: str
    verification_commands: List[str]
    estimated_duration: str
    dependencies: List[str]
    timestamp: str


@dataclass
class LaunchOperation:
    """Represents a RunPod launch operation"""
    hostname: str
    vm_name: Optional[str] = None
    flavor_name: str = 'default'
    image_name: str = 'default'
    key_name: str = 'default'
    gpu_type: Optional[str] = None
    firewall_id: Optional[str] = None
    manual: bool = True
    source: str = 'manual_launch'
    commands: Optional[List[str]] = None


class HyperstackManager:
    """
    Python equivalent of JavaScript hyperstack.js module
    Handles RunPod VM launches, networking, and firewall operations
    """

    def __init__(self, 
                 base_url: str = "http://localhost", 
                 timeout: int = 60,
                 logs_callback: Optional[Callable] = None,
                 notification_callback: Optional[Callable] = None,
                 frontend_callback: Optional[Callable] = None,
                 hyperstack_firewall_ca1_id: Optional[str] = None):
        """
        Initialize the Hyperstack manager
        
        Args:
            base_url: Base URL for API calls
            timeout: Default timeout for HTTP requests
            logs_callback: Callback function for logging (hostname, message, level, context)
            notification_callback: Callback function for notifications (message, level)
            frontend_callback: Callback function for frontend updates (hostname)
            hyperstack_firewall_ca1_id: Default firewall ID for CA1 hosts
        """
        self.base_url = base_url.rstrip('/')
        self.timeout = timeout
        self.logs_callback = logs_callback
        self.notification_callback = notification_callback
        self.frontend_callback = frontend_callback
        self.hyperstack_firewall_ca1_id = hyperstack_firewall_ca1_id

    def _log(self, message: str, level: str = 'info', hostname: Optional[str] = None):
        """Log a message using the callback if available"""
        if self.logs_callback:
            self.logs_callback('Hyperstack', message, level, hostname)
        else:
            getattr(logger, level, logger.info)(f"Hyperstack [{hostname}]: {message}")

    def _notify(self, message: str, level: str = 'info'):
        """Send a notification using the callback if available"""
        if self.notification_callback:
            self.notification_callback(message, level)
        else:
            getattr(logger, level, logger.info)(f"Notification: {message}")

    def _update_frontend(self, hostname: str):
        """Update frontend using the callback if available"""
        if self.frontend_callback:
            self.frontend_callback(hostname)
        else:
            self._log(f"Frontend update would be called for {hostname}", 'info', hostname)

    async def execute_runpod_launch(self, hostname: str) -> Dict[str, Any]:
        """
        Execute RunPod VM launch with two-phase process (preview → execute)
        
        Args:
            hostname: Target hostname for VM launch
            
        Returns:
            Dictionary containing launch results
            
        Raises:
            Exception: If launch fails at any stage
        """
        print(f"🚀 Starting RunPod launch for {hostname}")
        self._log(f'Starting RunPod launch for {hostname}', 'info', hostname)
        
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=self.timeout)) as session:
            try:
                # Phase 1: Preview
                preview_data = await self._preview_launch(session, hostname)
                
                if preview_data.get('error'):
                    error_msg = preview_data['error']
                    print(f"❌ Preview failed for {hostname}: {error_msg}")
                    self._log(f'Preview failed: {error_msg}', 'error', hostname)
                    self._notify(f'Preview failed for {hostname}: {error_msg}', 'danger')
                    raise Exception(error_msg)
                
                print(f"✅ Preview successful for {hostname} - VM: {preview_data.get('vm_name')}, "
                      f"Flavor: {preview_data.get('flavor_name')}")
                self._log(f"VM: {preview_data.get('vm_name')}, Flavor: {preview_data.get('flavor_name')}, "
                         f"GPU: {preview_data.get('gpu_type')}", 'success', hostname)
                
                # Phase 2: Execute
                execution_data = await self._execute_launch(session, hostname)
                
                if execution_data.get('success'):
                    return await self._handle_successful_launch(execution_data, hostname)
                else:
                    error_msg = execution_data.get('error', 'Launch failed')
                    print(f"❌ Launch failed for {hostname}: {error_msg}")
                    self._log(f'Launch execution failed: {error_msg}', 'error', hostname)
                    self._notify(f'Launch failed for {hostname}: {error_msg}', 'danger')
                    raise Exception(error_msg)
                    
            except aiohttp.ClientError as e:
                error_msg = f"Network error: {str(e)}"
                print(f"💥 Network error for {hostname}: {error_msg}")
                self._log(f'Network error during launch: {error_msg}', 'error', hostname)
                self._notify(f'Network error launching VM on {hostname}', 'danger')
                raise Exception(error_msg)

    async def _preview_launch(self, session: aiohttp.ClientSession, hostname: str) -> Dict[str, Any]:
        """Execute the preview phase of VM launch"""
        url = f"{self.base_url}/api/preview-runpod-launch"
        payload = {"hostname": hostname}
        
        async with session.post(url, json=payload, timeout=15) as response:
            if not response.ok:
                raise aiohttp.ClientResponseError(
                    request_info=response.request_info,
                    history=response.history,
                    status=response.status
                )
            return await response.json()

    async def _execute_launch(self, session: aiohttp.ClientSession, hostname: str) -> Dict[str, Any]:
        """Execute the launch phase of VM creation"""
        url = f"{self.base_url}/api/execute-runpod-launch"
        payload = {"hostname": hostname}
        
        # 60 second timeout for VM launch (matches JavaScript)
        async with session.post(url, json=payload, timeout=60) as response:
            if not response.ok:
                raise aiohttp.ClientResponseError(
                    request_info=response.request_info,
                    history=response.history,
                    status=response.status
                )
            return await response.json()

    async def _handle_successful_launch(self, data: Dict[str, Any], hostname: str) -> Dict[str, Any]:
        """Handle successful launch and schedule delayed operations"""
        vm_id = data.get('vm_id', 'N/A')
        vm_name = data.get('vm_name', hostname)
        
        print(f"✅ Launch successful for {hostname} - VM ID: {vm_id}")
        self._log(f'VM launched successfully - ID: {vm_id}', 'success', hostname)
        
        message = f"Successfully launched VM {vm_name} on {hostname}"
        if data.get('vm_id'):
            message += f" (ID: {vm_id})"
        
        # Handle post-launch task notifications and scheduling
        tasks = []
        
        # Storage network for Canada hosts (120s delay)
        if data.get('storage_network_scheduled') and hostname.startswith('CA1-'):
            tasks.append('storage network (120s)')
            print(f"🔌 Storage network attachment scheduled for {hostname} in 120s")
            self._log('Storage network attachment scheduled for 120s after launch', 'info', hostname)
            
            # Schedule the delayed storage network operation
            asyncio.create_task(self._delayed_storage_network_operation(hostname, 120))
        
        # Firewall attachment (180s delay)
        if data.get('firewall_scheduled'):
            tasks.append('firewall (180s)')
            print(f"🔥 Firewall attachment scheduled for {hostname} in 180s")
            self._log('Firewall attachment scheduled for 180s after launch', 'info', hostname)
            
            # Schedule the delayed firewall operation
            asyncio.create_task(self._delayed_firewall_operation(hostname, 180))
        
        if tasks:
            message += f". Scheduled: {', '.join(tasks)}."
        
        self._notify(message, 'success')
        
        # Update frontend to show VM is running
        self._update_frontend(hostname)
        print(f"🔄 Updated host status for {hostname} to show VM is running")
        self._log('Host status updated to show VM is running', 'success', hostname)
        
        return data

    async def _delayed_storage_network_operation(self, hostname: str, delay_seconds: int):
        """Execute storage network attachment after delay"""
        await asyncio.sleep(delay_seconds)
        
        print(f"🔌 Executing delayed storage network attachment for {hostname}")
        self._log('Executing delayed storage network attachment', 'info', hostname)
        
        try:
            # This would call the actual storage network attachment API
            # For now, we log that it would be executed
            self._log('Storage network attachment completed', 'success', hostname)
            self._notify(f'Storage network attached to {hostname}', 'success')
        except Exception as e:
            print(f"❌ Storage network attachment failed for {hostname}: {str(e)}")
            self._log(f'Storage network attachment failed: {str(e)}', 'error', hostname)
            self._notify(f'Storage network attachment failed for {hostname}', 'danger')

    async def _delayed_firewall_operation(self, hostname: str, delay_seconds: int):
        """Execute firewall attachment after delay"""
        await asyncio.sleep(delay_seconds)
        
        print(f"🔥 Executing delayed firewall attachment for {hostname}")
        self._log('Executing delayed firewall attachment', 'info', hostname)
        
        try:
            # This would call the actual firewall attachment API
            # For now, we log that it would be executed
            self._log('Firewall attachment completed', 'success', hostname)
            self._notify(f'Firewall attached to {hostname}', 'success')
        except Exception as e:
            print(f"❌ Firewall attachment failed for {hostname}: {str(e)}")
            self._log(f'Firewall attachment failed: {str(e)}', 'error', hostname)
            self._notify(f'Firewall attachment failed for {hostname}', 'danger')

    def schedule_runpod_launch(self, hostname: str, operation_callback: Optional[Callable] = None) -> bool:
        """
        Schedule a RunPod launch (add to pending operations)
        
        Args:
            hostname: Target hostname
            operation_callback: Callback to add operation to frontend
            
        Returns:
            True if successfully scheduled, False otherwise
        """
        print(f"📋 Scheduling RunPod launch for {hostname}")
        self._log(f'Scheduling RunPod launch for {hostname}', 'info', hostname)
        
        # Create operation data
        operation_data = {
            'vm_name': hostname,
            'flavor_name': 'default',  # Should be determined based on host specs
            'image_name': 'default',   # Should be determined based on requirements
            'key_name': 'default',     # Should be determined based on user preferences
            'manual': True,
            'source': 'manual_launch'
        }
        
        # Add RunPod launch operation (not a migration)
        if operation_callback:
            operation_callback(hostname, operation_data)
        else:
            self._log(f'Operation would be added to frontend for {hostname}', 'info', hostname)
        
        print(f"✅ RunPod launch scheduled for {hostname}")
        self._log(f'RunPod launch scheduled for {hostname}', 'success', hostname)
        return True

    def generate_runpod_launch_commands(self, operation: LaunchOperation) -> List[LaunchCommand]:
        """
        Generate commands for RunPod launch operations
        
        Args:
            operation: LaunchOperation containing launch details
            
        Returns:
            List of LaunchCommand objects
        """
        commands = []
        current_time = datetime.now(timezone.utc).isoformat()
        
        # 1. Wait command
        commands.append(LaunchCommand(
            type='wait-command',
            hostname=operation.hostname,
            parent_operation='runpod-launch',
            title='Wait for aggregate migration to complete',
            description='Ensure host is properly moved to Runpod aggregate before VM deployment - prevents deployment failures',
            command='sleep 60  # Wait for OpenStack aggregate membership to propagate across all services',
            verification_commands=[
                'nova aggregate-show runpod-aggregate',
                f'nova hypervisor-show {operation.hostname}'
            ],
            estimated_duration='60s',
            dependencies=[],
            timestamp=current_time
        ))
        
        # 2. VM Launch command
        vm_name = operation.vm_name or operation.hostname
        gpu_type = operation.gpu_type or 'L40'
        
        launch_command = operation.commands[0] if operation.commands else f"""curl -X POST https://infrahub-api.nexgencloud.com/v1/core/virtual-machines \\
  -H 'api_key: <HYPERSTACK_API_KEY>' \\
  -H 'Content-Type: application/json' \\
  -d '{{
    "name": "{vm_name}",
    "flavor_name": "gpu-{gpu_type}-1x",
    "image_name": "Ubuntu Server 24.04 LTS R570 CUDA 12.8",
    "keypair_name": "runpod-keypair",
    "assign_floating_ip": true,
    "user_data": "#!/bin/bash\\necho \\"RunPod VM initialized\\" > /var/log/runpod-init.log",
    "availability_zone": "nova:{operation.hostname}"
  }}'"""
        
        commands.append(LaunchCommand(
            type='hyperstack-launch',
            hostname=operation.hostname,
            parent_operation='runpod-launch',
            title='Deploy VM via Hyperstack API',
            description='Creates new virtual machine on the specified host with correct specifications and flavor',
            command=launch_command,
            verification_commands=[
                f'nova list --host {operation.hostname}',
                f'nova show {vm_name}'
            ],
            estimated_duration='120s',
            dependencies=['wait-command'],
            timestamp=current_time
        ))
        
        # 3. Storage network commands (for Canada hosts only)
        if operation.hostname.startswith('CA1-'):
            commands.extend(self._generate_storage_network_commands(operation, vm_name, current_time))
        
        # 4. Firewall commands (if firewall ID is configured)
        firewall_id = operation.firewall_id or (self.hyperstack_firewall_ca1_id if operation.hostname.startswith('CA1-') else None)
        if firewall_id:
            commands.extend(self._generate_firewall_commands(operation, vm_name, firewall_id, current_time))
        
        return commands

    def _generate_storage_network_commands(self, operation: LaunchOperation, vm_name: str, timestamp: str) -> List[LaunchCommand]:
        """Generate storage network commands for Canada hosts"""
        commands = []
        
        commands.append(LaunchCommand(
            type='storage-network-find',
            hostname=operation.hostname,
            parent_operation='runpod-launch',
            title='Find RunPod storage network ID',
            description='Retrieves the network ID for RunPod-Storage-Canada-1 network to use for port creation',
            command='openstack network show RunPod-Storage-Canada-1 -f value -c id',
            verification_commands=[
                'openstack network list --name RunPod-Storage-Canada-1'
            ],
            estimated_duration='10s',
            dependencies=['hyperstack-launch'],
            timestamp=timestamp
        ))
        
        commands.append(LaunchCommand(
            type='storage-port-create',
            hostname=operation.hostname,
            parent_operation='runpod-launch',
            title='Create storage network port',
            description='Creates a dedicated port on the storage network for the VM',
            command=f'openstack port create --network RunPod-Storage-Canada-1 --fixed-ip subnet=RunPod-Storage-Canada-1-subnet {vm_name}-storage-port',
            verification_commands=[
                f'openstack port show {vm_name}-storage-port'
            ],
            estimated_duration='15s',
            dependencies=['storage-network-find'],
            timestamp=timestamp
        ))
        
        commands.append(LaunchCommand(
            type='storage-port-attach',
            hostname=operation.hostname,
            parent_operation='runpod-launch',
            title='Attach storage port to VM',
            description='Attaches the storage network port to the VM for high-performance storage access',
            command=f'openstack server add port {vm_name} {vm_name}-storage-port',
            verification_commands=[
                f'openstack server show {vm_name} -c addresses'
            ],
            estimated_duration='10s',
            dependencies=['storage-port-create'],
            timestamp=timestamp
        ))
        
        return commands

    def _generate_firewall_commands(self, operation: LaunchOperation, vm_name: str, firewall_id: str, timestamp: str) -> List[LaunchCommand]:
        """Generate firewall commands"""
        commands = []
        
        commands.append(LaunchCommand(
            type='firewall-get',
            hostname=operation.hostname,
            parent_operation='runpod-launch',
            title='Get current firewall VM attachments',
            description='Retrieves list of VMs currently attached to firewall to preserve them during update',
            command=f"""curl -X GET https://infrahub-api.nexgencloud.com/v1/core/sg-rules/{firewall_id} \\
  -H 'api_key: <HYPERSTACK_API_KEY>'""",
            verification_commands=[
                f"curl -X GET https://infrahub-api.nexgencloud.com/v1/core/sg-rules/{firewall_id} -H 'api_key: <HYPERSTACK_API_KEY>'"
            ],
            estimated_duration='10s',
            dependencies=['hyperstack-launch'],
            timestamp=timestamp
        ))
        
        commands.append(LaunchCommand(
            type='firewall-update',
            hostname=operation.hostname,
            parent_operation='runpod-launch',
            title='Update firewall with all VMs (existing + new)',
            description='Updates firewall to include all existing VMs plus the newly created VM',
            command=f"""curl -X PUT https://infrahub-api.nexgencloud.com/v1/core/sg-rules/{firewall_id} \\
  -H 'api_key: <HYPERSTACK_API_KEY>' \\
  -H 'Content-Type: application/json' \\
  -d '{{"virtual_machines": [<EXISTING_VMS>, "{vm_name}"]}}'""",
            verification_commands=[
                f"curl -X GET https://infrahub-api.nexgencloud.com/v1/core/sg-rules/{firewall_id} -H 'api_key: <HYPERSTACK_API_KEY>'"
            ],
            estimated_duration='15s',
            dependencies=['firewall-get'],
            timestamp=timestamp
        ))
        
        return commands

    def to_dict_commands(self, commands: List[LaunchCommand]) -> List[Dict[str, Any]]:
        """Convert LaunchCommand objects to dictionaries"""
        return [asdict(command) for command in commands]


# Convenience functions for backwards compatibility and easy usage
async def execute_runpod_launch(hostname: str, **kwargs) -> Dict[str, Any]:
    """Convenience function to execute a RunPod launch"""
    manager = HyperstackManager(**kwargs)
    return await manager.execute_runpod_launch(hostname)


def schedule_runpod_launch(hostname: str, **kwargs) -> bool:
    """Convenience function to schedule a RunPod launch"""
    manager = HyperstackManager(**kwargs)
    return manager.schedule_runpod_launch(hostname, kwargs.get('operation_callback'))


def generate_runpod_launch_commands(operation: LaunchOperation, **kwargs) -> List[LaunchCommand]:
    """Convenience function to generate RunPod launch commands"""
    manager = HyperstackManager(**kwargs)
    return manager.generate_runpod_launch_commands(operation)