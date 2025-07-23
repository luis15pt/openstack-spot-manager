"""
OpenStack operations module for OpenStack Spot Manager.
Handles host migrations, aggregate operations, and VM management.
Converted from JavaScript openstack.js to Python.
"""

import json
import asyncio
import time
from datetime import datetime
from typing import Dict, List, Optional, Any, Tuple
import aiohttp
import requests
from dataclasses import dataclass
import logging

# Set up logging
logger = logging.getLogger(__name__)


@dataclass
class MigrationCommand:
    """Represents a migration command with all its properties."""
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


class OpenStackManager:
    """
    OpenStack operations manager for handling host migrations, aggregate operations,
    and VM management with caching and async operations.
    """
    
    def __init__(self, base_url: str = '', timeout: int = 30):
        """
        Initialize the OpenStack manager.
        
        Args:
            base_url: Base URL for API calls (if different from current host)
            timeout: Default timeout for HTTP requests
        """
        self.base_url = base_url
        self.timeout = timeout
        self.gpu_data_cache: Dict[str, Dict[str, Any]] = {}
        self.available_gpu_types: List[str] = []
        
    async def execute_host_migration(
        self,
        hostname: str,
        source_aggregate: str,
        target_aggregate: str,
        operation: str
    ) -> Dict[str, Any]:
        """
        Execute host migration between aggregates.
        
        Args:
            hostname: Host to migrate
            source_aggregate: Source aggregate name
            target_aggregate: Target aggregate name
            operation: Operation type ('add', 'remove', etc.)
            
        Returns:
            Dictionary containing migration result
            
        Raises:
            Exception: If migration fails
        """
        logger.info(f"Starting host migration: {hostname} from {source_aggregate} "
                   f"to {target_aggregate} ({operation})")
        
        endpoint = '/api/execute-migration'
        
        payload = {
            'hostname': hostname,
            'source_aggregate': source_aggregate,
            'target_aggregate': target_aggregate,
            'operation': operation
        }
        
        try:
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=45)) as session:
                async with session.post(
                    f"{self.base_url}{endpoint}",
                    json=payload,
                    headers={'Content-Type': 'application/json'}
                ) as response:
                    if response.status != 200:
                        raise Exception(f"HTTP {response.status}: {await response.text()}")
                    
                    data = await response.json()
                    
                    if data.get('success'):
                        logger.info(f"Migration {operation} successful for {hostname}")
                        return data
                    else:
                        error_msg = data.get('error', f'Migration {operation} failed')
                        logger.error(f"Migration {operation} failed for {hostname}: {error_msg}")
                        raise Exception(error_msg)
                        
        except asyncio.TimeoutError:
            error_msg = f"Migration {operation} timed out for {hostname}"
            logger.error(error_msg)
            raise Exception(error_msg)
        except Exception as e:
            error_msg = f"Exception during migration {operation} for {hostname}: {str(e)}"
            logger.error(error_msg)
            raise
    
    async def load_aggregate_data(
        self,
        gpu_type: str,
        is_background_load: bool = False
    ) -> Dict[str, Any]:
        """
        Load aggregate data for a specific GPU type with caching.
        
        Args:
            gpu_type: GPU type to load data for
            is_background_load: Whether this is a background load operation
            
        Returns:
            Dictionary containing aggregate data
            
        Raises:
            Exception: If loading fails
        """
        logger.info(f"Loading aggregate data for {gpu_type} (background: {is_background_load})")
        
        # Check cache first
        if gpu_type in self.gpu_data_cache:
            logger.info(f"Loading {gpu_type} from cache")
            cached_data = self.gpu_data_cache[gpu_type]
            
            if not is_background_load:
                logger.debug(f"Cached data for {gpu_type}: "
                           f"gpu_type={cached_data.get('gpu_type')}, "
                           f"spot={cached_data.get('spot', {}).get('name')}, "
                           f"ondemand={cached_data.get('ondemand', {}).get('name')}, "
                           f"runpod={cached_data.get('runpod', {}).get('name')}")
            
            return cached_data
        
        # Load from API
        endpoint = f'/api/aggregates/{gpu_type}'
        
        try:
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=30)) as session:
                async with session.get(f"{self.base_url}{endpoint}") as response:
                    if response.status != 200:
                        raise Exception(f"HTTP {response.status}: {await response.text()}")
                    
                    data = await response.json()
                    
                    if data.get('error'):
                        raise Exception(data['error'])
                    
                    logger.info(f"Loaded {gpu_type} aggregate data: {data}")
                    logger.debug(f"Fresh API data for {gpu_type}: "
                               f"gpu_type={data.get('gpu_type')}, "
                               f"spot={data.get('spot', {}).get('name')}, "
                               f"ondemand={data.get('ondemand', {}).get('name')}, "
                               f"runpod={data.get('runpod', {}).get('name')}")
                    
                    # Cache the data
                    self.gpu_data_cache[gpu_type] = data
                    logger.info(f"Cached data for {gpu_type}")
                    
                    return data
                    
        except Exception as e:
            error_msg = f"Error loading aggregate data for {gpu_type}: {str(e)}"
            logger.error(error_msg)
            raise Exception(error_msg)
    
    def load_aggregate_data_sync(
        self,
        gpu_type: str,
        is_background_load: bool = False
    ) -> Dict[str, Any]:
        """
        Synchronous version of load_aggregate_data for compatibility.
        
        Args:
            gpu_type: GPU type to load data for
            is_background_load: Whether this is a background load operation
            
        Returns:
            Dictionary containing aggregate data
        """
        # Check cache first
        if gpu_type in self.gpu_data_cache:
            logger.info(f"Loading {gpu_type} from cache")
            return self.gpu_data_cache[gpu_type]
        
        # Load from API using requests
        endpoint = f'/api/aggregates/{gpu_type}'
        
        try:
            response = requests.get(
                f"{self.base_url}{endpoint}",
                timeout=30
            )
            response.raise_for_status()
            
            data = response.json()
            
            if data.get('error'):
                raise Exception(data['error'])
            
            logger.info(f"Loaded {gpu_type} aggregate data")
            
            # Cache the data
            self.gpu_data_cache[gpu_type] = data
            logger.info(f"Cached data for {gpu_type}")
            
            return data
            
        except Exception as e:
            error_msg = f"Error loading aggregate data for {gpu_type}: {str(e)}"
            logger.error(error_msg)
            raise Exception(error_msg)
    
    def load_gpu_types(self) -> List[str]:
        """
        Get GPU types from the backend.
        
        Returns:
            List of available GPU types
            
        Raises:
            Exception: If loading fails
        """
        logger.info("Loading available GPU types")
        
        try:
            response = requests.get(
                f"{self.base_url}/api/gpu-types",
                timeout=10
            )
            response.raise_for_status()
            
            data = response.json()
            
            if not data or 'gpu_types' not in data:
                raise Exception(f"Invalid response from /api/gpu-types: {data}")
            
            gpu_types = data['gpu_types']
            logger.info(f"Available GPU types: {gpu_types}")
            
            # Store for background loading
            self.available_gpu_types = gpu_types
            
            return gpu_types
            
        except Exception as e:
            error_msg = f"Error loading GPU types: {str(e)}"
            logger.error(error_msg)
            raise Exception(error_msg)
    
    def preview_migration(
        self,
        hostname: str,
        source_aggregate: str,
        target_aggregate: str
    ) -> Dict[str, Any]:
        """
        Preview migration before execution.
        
        Args:
            hostname: Host to migrate
            source_aggregate: Source aggregate name
            target_aggregate: Target aggregate name
            
        Returns:
            Dictionary containing migration preview data
            
        Raises:
            Exception: If preview fails
        """
        logger.info(f"Previewing migration: {hostname} from {source_aggregate} to {target_aggregate}")
        
        payload = {
            'host': hostname,
            'source_aggregate': source_aggregate,
            'target_aggregate': target_aggregate
        }
        
        try:
            response = requests.post(
                f"{self.base_url}/api/preview-migration",
                json=payload,
                headers={'Content-Type': 'application/json'},
                timeout=15
            )
            response.raise_for_status()
            
            data = response.json()
            
            if data.get('error'):
                raise Exception(data['error'])
            
            logger.info(f"Migration preview successful for {hostname}")
            return data
            
        except Exception as e:
            error_msg = f"Error previewing migration for {hostname}: {str(e)}"
            logger.error(error_msg)
            raise Exception(error_msg)
    
    def get_host_vm_details(self, hostname: str) -> Dict[str, Any]:
        """
        Get VM details for a specific host.
        
        Args:
            hostname: Host to get VM details for
            
        Returns:
            Dictionary containing VM details
            
        Raises:
            Exception: If retrieval fails
        """
        logger.info(f"Getting VM details for {hostname}")
        
        try:
            response = requests.get(
                f"{self.base_url}/api/host-vms/{hostname}",
                timeout=15
            )
            response.raise_for_status()
            
            data = response.json()
            logger.info(f"VM details retrieved for {hostname}")
            return data
            
        except Exception as e:
            error_msg = f"Error getting VM details for {hostname}: {str(e)}"
            logger.error(error_msg)
            raise Exception(error_msg)
    
    @staticmethod
    def generate_migration_commands(operation: Dict[str, str]) -> List[MigrationCommand]:
        """
        Generate commands for host migration operations.
        
        Args:
            operation: Dictionary containing migration operation details with keys:
                      - hostname: Host being migrated
                      - sourceAggregate: Source aggregate name
                      - targetAggregate: Target aggregate name
                      
        Returns:
            List of MigrationCommand objects
        """
        commands = []
        timestamp = datetime.now().isoformat()
        
        # 1. Remove from source aggregate
        commands.append(MigrationCommand(
            type='aggregate-remove',
            hostname=operation['hostname'],
            parent_operation='migration',
            title=f"Remove {operation['hostname']} from {operation['sourceAggregate']}",
            description="Removes the compute host from the source aggregate to prepare for migration",
            command=f"nova aggregate-remove-host {operation['sourceAggregate']} {operation['hostname']}",
            verification_commands=[
                f"nova aggregate-show {operation['sourceAggregate']}",
                f"nova hypervisor-show {operation['hostname']}"
            ],
            estimated_duration='30s',
            dependencies=[],
            timestamp=timestamp
        ))
        
        # 2. Wait for propagation
        commands.append(MigrationCommand(
            type='wait-command',
            hostname=operation['hostname'],
            parent_operation='migration',
            title='Wait for aggregate membership propagation',
            description='Allows OpenStack services to recognize the host removal before adding to new aggregate',
            command='sleep 60  # Wait for OpenStack aggregate membership to propagate',
            verification_commands=[
                'nova service-list',
                'nova aggregate-list'
            ],
            estimated_duration='60s',
            dependencies=['aggregate-remove'],
            timestamp=timestamp
        ))
        
        # 3. Add to target aggregate
        commands.append(MigrationCommand(
            type='aggregate-add',
            hostname=operation['hostname'],
            parent_operation='migration',
            title=f"Add {operation['hostname']} to {operation['targetAggregate']}",
            description="Adds the compute host to the target aggregate to complete the migration",
            command=f"nova aggregate-add-host {operation['targetAggregate']} {operation['hostname']}",
            verification_commands=[
                f"nova aggregate-show {operation['targetAggregate']}",
                f"nova hypervisor-show {operation['hostname']}"
            ],
            estimated_duration='30s',
            dependencies=['wait-command'],
            timestamp=timestamp
        ))
        
        return commands
    
    def execute_network_command(self, command: str) -> str:
        """
        Execute OpenStack network commands using SDK.
        
        Args:
            command: OpenStack command to execute
            
        Returns:
            Command execution result as string
            
        Raises:
            Exception: If command execution fails
        """
        logger.info(f"Executing OpenStack network command: {command}")
        
        try:
            if 'server list --all-projects --name' in command:
                # Extract server name from command
                import re
                name_match = re.search(r'--name\s+["\']?([^"\'\s]+)["\']?', command)
                if not name_match:
                    raise Exception('Could not parse server name from command')
                
                server_name = name_match.group(1)
                
                # Call backend to get server UUID via SDK
                response = requests.post(
                    f"{self.base_url}/api/openstack/server/get-uuid",
                    json={'server_name': server_name},
                    headers={'Content-Type': 'application/json'},
                    timeout=30
                )
                response.raise_for_status()
                
                data = response.json()
                if data.get('success'):
                    return data['server_uuid']
                else:
                    raise Exception(data.get('error', 'Server UUID lookup failed'))
                    
            elif 'network show' in command:
                # Extract network name from command
                import re
                network_match = re.search(r'network show ["\']?([^"\'\s]+)["\']?', command)
                if not network_match:
                    raise Exception('Could not parse network name from command')
                
                network_name = network_match.group(1)
                
                # Call backend to find network via SDK
                response = requests.post(
                    f"{self.base_url}/api/openstack/network/show",
                    json={'network_name': network_name},
                    headers={'Content-Type': 'application/json'},
                    timeout=30
                )
                response.raise_for_status()
                
                data = response.json()
                if data.get('success'):
                    return data['network_id']
                else:
                    raise Exception(data.get('error', 'Network lookup failed'))
                    
            elif 'port create' in command:
                # Extract port details from command
                import re
                network_match = re.search(r'--network ["\']?([^"\'\s]+)["\']?', command)
                name_match = re.search(r'--name ["\']?([^"\'\s]+)["\']?', command)
                
                if not network_match or not name_match:
                    raise Exception('Could not parse network name or port name from command')
                
                network_name = network_match.group(1)
                port_name = name_match.group(1)
                
                # Call backend to create port via SDK
                response = requests.post(
                    f"{self.base_url}/api/openstack/port/create",
                    json={
                        'network_name': network_name,
                        'port_name': port_name
                    },
                    headers={'Content-Type': 'application/json'},
                    timeout=30
                )
                response.raise_for_status()
                
                data = response.json()
                if data.get('success'):
                    return data['port_id']
                else:
                    raise Exception(data.get('error', 'Port creation failed'))
                    
            elif 'server add network' in command:
                # Extract server and network from command
                parts = command.split(' ')
                try:
                    add_index = parts.index('add')
                    network_keyword_index = parts.index('network')
                    
                    if network_keyword_index + 2 >= len(parts):
                        raise Exception('Could not parse server or network from command')
                    
                    server_name = parts[network_keyword_index + 1]  # First argument after 'network'
                    network_name = parts[network_keyword_index + 2]  # Second argument after 'network'
                    
                except (ValueError, IndexError):
                    raise Exception('Could not parse server or network from command')
                
                # Call backend to attach network via SDK
                response = requests.post(
                    f"{self.base_url}/api/openstack/server/add-network",
                    json={
                        'server_name': server_name,
                        'network_name': network_name
                    },
                    headers={'Content-Type': 'application/json'},
                    timeout=30
                )
                response.raise_for_status()
                
                data = response.json()
                if data.get('success'):
                    return 'Network attached successfully'
                else:
                    raise Exception(data.get('error', 'Network attachment failed'))
                    
            else:
                raise Exception(f'Unsupported OpenStack command: {command}')
                
        except Exception as e:
            logger.error(f"Error executing network command: {str(e)}")
            raise
    
    def clear_cache(self):
        """Clear the GPU data cache."""
        self.gpu_data_cache.clear()
        logger.info("GPU data cache cleared")
    
    def get_cached_gpu_types(self) -> List[str]:
        """Get list of cached GPU types."""
        return list(self.gpu_data_cache.keys())
    
    def is_gpu_type_cached(self, gpu_type: str) -> bool:
        """Check if a GPU type is cached."""
        return gpu_type in self.gpu_data_cache


# Create a default instance for easy importing
openstack_manager = OpenStackManager()

# Convenience functions that match the original JavaScript API
def execute_host_migration(hostname: str, source_aggregate: str, 
                         target_aggregate: str, operation: str) -> Dict[str, Any]:
    """Convenience function for host migration."""
    import asyncio
    return asyncio.run(openstack_manager.execute_host_migration(
        hostname, source_aggregate, target_aggregate, operation
    ))

def load_aggregate_data(gpu_type: str, is_background_load: bool = False) -> Dict[str, Any]:
    """Convenience function for loading aggregate data."""
    return openstack_manager.load_aggregate_data_sync(gpu_type, is_background_load)

def load_gpu_types() -> List[str]:
    """Convenience function for loading GPU types."""
    return openstack_manager.load_gpu_types()

def preview_migration(hostname: str, source_aggregate: str, target_aggregate: str) -> Dict[str, Any]:
    """Convenience function for migration preview."""
    return openstack_manager.preview_migration(hostname, source_aggregate, target_aggregate)

def get_host_vm_details(hostname: str) -> Dict[str, Any]:
    """Convenience function for getting host VM details."""
    return openstack_manager.get_host_vm_details(hostname)

def generate_migration_commands(operation: Dict[str, str]) -> List[MigrationCommand]:
    """Convenience function for generating migration commands."""
    return OpenStackManager.generate_migration_commands(operation)

def execute_network_command(command: str) -> str:
    """Convenience function for executing network commands."""
    return openstack_manager.execute_network_command(command)