"""
Frontend UI operations module for OpenStack Spot Manager

This module converts the JavaScript frontend.js functionality to Python,
providing server-side HTML generation and template data preparation for Flask/Jinja2.

Preserves the exact same functionality as the original JavaScript:
- Aggregate data rendering
- Host card creation 
- Operations management
- UI state management
- Drag-and-drop operation logic (converted to form-based operations)
- Pending operations management system
"""

from typing import Dict, List, Set, Optional, Any, Union, Tuple
from dataclasses import dataclass, field
from datetime import datetime
import json
import logging
from enum import Enum
import math


# Configure logging
logger = logging.getLogger(__name__)


class HostType(Enum):
    """Enum for host types"""
    ONDEMAND = "ondemand"
    RUNPOD = "runpod"
    SPOT = "spot"


class OperationType(Enum):
    """Enum for operation types"""
    HOST_MIGRATION = "host-migration"
    RUNPOD_LAUNCH = "runpod-launch"


class CommandType(Enum):
    """Enum for command types"""
    AGGREGATE_REMOVE = "aggregate-remove"
    AGGREGATE_ADD = "aggregate-add"
    HYPERSTACK_LAUNCH = "hyperstack-launch"
    STORAGE_WAIT = "storage-wait-command"
    SERVER_GET_UUID = "server-get-uuid"
    STORAGE_ATTACH_NETWORK = "storage-attach-network"
    FIREWALL_WAIT = "firewall-wait-command"
    FIREWALL_GET_ATTACHMENTS = "firewall-get-attachments"
    FIREWALL_UPDATE_ATTACHMENTS = "firewall-update-attachments"


@dataclass
class Host:
    """Data class representing a compute host"""
    name: str
    has_vms: bool = False
    vm_count: int = 0
    gpu_used: int = 0
    gpu_capacity: int = 8
    gpu_usage_ratio: str = "0/8"
    tenant: str = "Unknown"
    owner_group: str = "Investors"
    nvlinks: bool = False
    variant: Optional[str] = None
    
    @property
    def gpu_percentage(self) -> int:
        """Calculate GPU usage percentage"""
        if self.gpu_capacity == 0:
            return 0
        return math.ceil((self.gpu_used / self.gpu_capacity) * 100)


@dataclass
class Variant:
    """Data class representing an aggregate variant"""
    variant: str
    aggregate: str


@dataclass
class GpuSummary:
    """Data class for GPU summary statistics"""
    gpu_used: int
    gpu_capacity: int
    gpu_usage_ratio: str
    gpu_usage_percentage: int


@dataclass
class AggregateGroup:
    """Data class representing an aggregate group"""
    name: str
    hosts: List[Host] = field(default_factory=list)
    gpu_summary: Optional[GpuSummary] = None
    variants: List[Variant] = field(default_factory=list)


@dataclass
class Command:
    """Data class representing a command operation"""
    type: str
    hostname: str
    parent_operation: str
    title: str
    description: str
    command: str
    timing: str
    command_type: str
    purpose: str
    expected_output: str
    dependencies: List[str] = field(default_factory=list)
    timestamp: str = field(default_factory=lambda: datetime.now().isoformat())
    verification_commands: List[str] = field(default_factory=list)


@dataclass
class PendingOperation:
    """Data class representing a pending operation"""
    hostname: str
    source_type: str
    target_type: str
    source_aggregate: str
    target_aggregate: str
    timestamp: str
    operation_type: OperationType = OperationType.HOST_MIGRATION
    vm_name: Optional[str] = None
    flavor_name: Optional[str] = None
    image_name: Optional[str] = None
    key_name: Optional[str] = None
    manual: bool = False
    source: str = "unknown"
    completed_commands: List[str] = field(default_factory=list)


class FrontendManager:
    """
    Main class for managing frontend operations and HTML generation.
    
    This class maintains state and provides methods for generating HTML content
    that can be used with Flask templates or direct rendering.
    """
    
    def __init__(self):
        """Initialize the frontend manager with default state"""
        self.current_gpu_type: str = ''
        self.selected_hosts: Set[str] = set()
        self.aggregate_data: Dict[str, Any] = {}
        self.pending_operations: List[PendingOperation] = []
        self.available_gpu_types: List[str] = []
        self.is_execution_in_progress: bool = False
    
    def clear_state(self) -> None:
        """Clear all state variables"""
        self.current_gpu_type = ''
        self.selected_hosts.clear()
        self.aggregate_data.clear()
        self.pending_operations.clear()
        self.available_gpu_types.clear()
        self.is_execution_in_progress = False
    
    def render_aggregate_data(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Process aggregate data and prepare it for template rendering.
        
        Args:
            data: Raw aggregate data from the backend
            
        Returns:
            Processed data ready for template rendering
        """
        try:
            # Store data for other functions
            self.aggregate_data = data
            
            # Process each aggregate type
            processed_data = {
                'ondemand': self._process_aggregate_group(data.get('ondemand', {})),
                'runpod': self._process_aggregate_group(data.get('runpod', {})),
                'spot': self._process_aggregate_group(data.get('spot', {})),
                'gpu_overview': data.get('gpu_overview', {}),
                'column_layout': self._calculate_column_layout(data.get('ondemand', {}))
            }
            
            # Calculate overall statistics
            processed_data['overall_stats'] = self._calculate_overall_stats(processed_data)
            
            return processed_data
            
        except Exception as e:
            logger.error(f"Error processing aggregate data: {e}")
            return self._get_empty_aggregate_data()
    
    def _process_aggregate_group(self, group_data: Dict[str, Any]) -> Dict[str, Any]:
        """Process a single aggregate group"""
        hosts = [Host(**host_data) for host_data in group_data.get('hosts', [])]
        
        processed = {
            'name': group_data.get('name', 'N/A'),
            'hosts': hosts,
            'host_count': len(hosts),
            'gpu_summary': group_data.get('gpu_summary'),
            'variants': [Variant(**v) for v in group_data.get('variants', [])],
            'grouped_hosts': self._group_hosts(hosts)
        }
        
        return processed
    
    def _group_hosts(self, hosts: List[Host]) -> Dict[str, Dict[str, List[Host]]]:
        """Group hosts by availability and owner"""
        available_hosts = [host for host in hosts if not host.has_vms]
        in_use_hosts = [host for host in hosts if host.has_vms]
        
        grouped = {
            'available': {
                'nexgen': [h for h in available_hosts if h.owner_group == 'Nexgen Cloud'],
                'investors': [h for h in available_hosts if h.owner_group == 'Investors']
            },
            'in_use': {}
        }
        
        # Group in-use hosts by usage metric
        for host in in_use_hosts:
            key = str(host.vm_count if host.vm_count > 0 else host.gpu_used)
            if key not in grouped['in_use']:
                grouped['in_use'][key] = []
            grouped['in_use'][key].append(host)
        
        return grouped
    
    def _calculate_column_layout(self, ondemand_data: Dict[str, Any]) -> Dict[str, Any]:
        """Calculate dynamic column layout based on variants"""
        variants = ondemand_data.get('variants', [])
        total_variants = len(variants) if len(variants) > 1 else 1
        total_columns = 1 + total_variants + 1  # RunPod + variants + Spot
        col_width = math.floor(12 / total_columns)  # Bootstrap grid
        
        return {
            'total_variants': total_variants,
            'total_columns': total_columns,
            'col_width': col_width,
            'use_variant_columns': len(variants) > 1
        }
    
    def _calculate_overall_stats(self, processed_data: Dict[str, Any]) -> Dict[str, Any]:
        """Calculate overall host statistics"""
        total_available = 0
        total_in_use = 0
        
        for aggregate_type in ['ondemand', 'runpod', 'spot']:
            hosts = processed_data.get(aggregate_type, {}).get('hosts', [])
            for host in hosts:
                if host.has_vms:
                    total_in_use += 1
                else:
                    total_available += 1
        
        return {
            'total_available': total_available,
            'total_in_use': total_in_use
        }
    
    def _get_empty_aggregate_data(self) -> Dict[str, Any]:
        """Return empty aggregate data structure"""
        return {
            'ondemand': {'name': 'N/A', 'hosts': [], 'host_count': 0},
            'runpod': {'name': 'N/A', 'hosts': [], 'host_count': 0},
            'spot': {'name': 'N/A', 'hosts': [], 'host_count': 0},
            'gpu_overview': {},
            'overall_stats': {'total_available': 0, 'total_in_use': 0},
            'column_layout': {'total_variants': 1, 'total_columns': 3, 'col_width': 4, 'use_variant_columns': False}
        }
    
    def create_host_card_html(self, host: Host, host_type: str, aggregate_name: str = None) -> str:
        """
        Generate HTML for a host card.
        
        Args:
            host: Host object containing host data
            host_type: Type of host (ondemand, runpod, spot)
            aggregate_name: Name of the aggregate
            
        Returns:
            HTML string for the host card
        """
        try:
            # Determine card styling
            card_class = 'machine-card has-vms' if host.has_vms else 'machine-card'
            vm_badge_class = 'vm-badge active' if host.has_vms else 'vm-badge zero'
            warning_icon = '<i class="fas fa-exclamation-triangle warning-icon"></i>' if host.has_vms else ''
            
            # Tenant badge styling
            tenant_badge_class = 'tenant-badge nexgen' if host.owner_group == 'Nexgen Cloud' else 'tenant-badge investors'
            tenant_icon = 'fas fa-cloud' if host.owner_group == 'Nexgen Cloud' else 'fas fa-users'
            
            # GPU/VM display logic
            if host_type == 'runpod':
                vm_label = 'VMs' if host.vm_count > 0 else 'No VMs'
                vm_info = f'<span class="{vm_badge_class}">{host.vm_count}</span><span class="vm-label">{vm_label}</span>'
            else:
                gpu_badge_class = 'gpu-badge active' if host.gpu_used > 0 else 'gpu-badge zero'
                vm_info = f'<span class="{gpu_badge_class}">{host.gpu_usage_ratio}</span><span class="gpu-label">GPUs</span>'
            
            # Variant info section
            variant_info = ''
            if host.variant:
                variant_info = (
                    '<div class="variant-info">'
                    f'<span class="variant-badge" title="Aggregate: {host.variant}">'
                    '<i class="fas fa-tag"></i>'
                    f'{host.variant}'
                    '</span>'
                    '</div>'
                )
            
            # RunPod launch button
            launch_button = ''
            if host_type == 'runpod' and not host.has_vms:
                launch_button = (
                    '<div class="launch-runpod-info">'
                    '<button class="btn btn-sm btn-outline-primary launch-runpod-btn" '
                    f'onclick="window.Hyperstack.scheduleRunpodLaunch(\'{host.name}\')" '
                    'title="Schedule VM launch on this host">'
                    '<i class="fas fa-rocket"></i> Launch into Runpod'
                    '</button>'
                    '</div>'
                )
            
            # Build onclick attribute
            onclick_attr = f'onclick="showVmDetails(\'{host.name}\')"' if host.vm_count > 0 else ''
            
            # Build status class
            status_class = 'active' if host.has_vms else 'inactive'
            vm_class = 'clickable-vm-count' if host.vm_count > 0 else ''
            
            # Build nvlinks classes
            nvlinks_class = 'enabled' if host.nvlinks else 'disabled'
            nvlinks_status = 'Enabled' if host.nvlinks else 'Disabled'
            nvlinks_text = 'Yes' if host.nvlinks else 'No'
            
            html = f"""
                <div class="{card_class}" 
                     draggable="true" 
                     data-host="{host.name}" 
                     data-type="{host_type}"
                     data-aggregate="{host.variant or aggregate_name or ''}"
                     data-has-vms="{str(host.has_vms).lower()}"
                     data-owner-group="{host.owner_group}"
                     data-nvlinks="{str(host.nvlinks).lower()}">
                    <div class="machine-card-header">
                        <i class="fas fa-grip-vertical drag-handle"></i>
                        <div class="machine-name">{host.name}</div>
                        {warning_icon}
                    </div>
                    <div class="machine-status">
                        <div class="vm-info {vm_class}" {onclick_attr}>
                            <i class="fas fa-circle status-dot {status_class}"></i>
                            {vm_info}
                        </div>
                        <div class="tenant-info">
                            <span class="{tenant_badge_class}" title="{host.tenant}">
                                <i class="{tenant_icon}"></i>
                                {host.owner_group}
                            </span>
                        </div>
                        <div class="nvlinks-info">
                            <span class="nvlinks-badge {nvlinks_class}" title="NVLinks {nvlinks_status}">
                                <i class="fas fa-link"></i>
                                NVLinks: {nvlinks_text}
                            </span>
                        </div>
                        {variant_info}
                        {launch_button}
                    </div>
                </div>
            """
            
            return html
            
        except Exception as e:
            logger.error(f"Error creating host card for {host.name}: {e}")
            return f'<div class="machine-card error">Error rendering host {host.name}</div>'
    
    def generate_hosts_html(self, hosts: List[Host], host_type: str, aggregate_name: str = None) -> str:
        """
        Generate HTML for a list of hosts.
        
        Args:
            hosts: List of Host objects
            host_type: Type of hosts (ondemand, runpod, spot)
            aggregate_name: Name of the aggregate
            
        Returns:
            HTML string containing all host cards
        """
        if not hosts:
            return f"""
                <div class="drop-zone" data-type="{host_type}">
                    <div class="empty-state">
                        <i class="fas fa-server"></i>
                        <p>No hosts in this aggregate</p>
                    </div>
                </div>
            """
        
        # Group hosts
        grouped = self._group_hosts(hosts)
        sections_html = []
        
        # Available hosts section
        available_hosts = grouped['available']['nexgen'] + grouped['available']['investors']
        if available_hosts:
            available_subgroups = []
            
            # Nexgen Cloud devices
            if grouped['available']['nexgen']:
                nexgen_cards = ''.join([
                    self.create_host_card_html(host, host_type, aggregate_name) 
                    for host in grouped['available']['nexgen']
                ])
                nexgen_subgroup_id = f"available-nexgen-{host_type}"
                
                available_subgroups.append(f"""
                    <div class="host-subgroup nexgen-group">
                        <div class="host-subgroup-header clickable" onclick="toggleGroup('{nexgen_subgroup_id}')">
                            <i class="fas fa-cloud text-info"></i>
                            <span class="subgroup-title">Nexgen Cloud ({len(grouped['available']['nexgen'])})</span>
                            <i class="fas fa-chevron-down toggle-icon" id="{nexgen_subgroup_id}-icon"></i>
                        </div>
                        <div class="host-subgroup-content" id="{nexgen_subgroup_id}">
                            {nexgen_cards}
                        </div>
                    </div>
                """)
            
            # Investor devices
            if grouped['available']['investors']:
                investor_cards = ''.join([
                    self.create_host_card_html(host, host_type, aggregate_name) 
                    for host in grouped['available']['investors']
                ])
                investor_subgroup_id = f"available-investors-{host_type}"
                
                available_subgroups.append(f"""
                    <div class="host-subgroup investors-group">
                        <div class="host-subgroup-header clickable" onclick="toggleGroup('{investor_subgroup_id}')">
                            <i class="fas fa-users text-warning"></i>
                            <span class="subgroup-title">Investor Devices ({len(grouped['available']['investors'])})</span>
                            <i class="fas fa-chevron-down toggle-icon" id="{investor_subgroup_id}-icon"></i>
                        </div>
                        <div class="host-subgroup-content" id="{investor_subgroup_id}">
                            {investor_cards}
                        </div>
                    </div>
                """)
            
            available_id = f"available-{host_type}"
            sections_html.append(f"""
                <div class="host-group">
                    <div class="host-group-header clickable" onclick="toggleGroup('{available_id}')">
                        <i class="fas fa-circle-check text-success"></i>
                        <h6 class="mb-0">Available ({len(available_hosts)})</h6>
                        <small class="text-muted">No VMs - Ready to move</small>
                        <i class="fas fa-chevron-down toggle-icon" id="{available_id}-icon"></i>
                    </div>
                    <div class="host-group-content" id="{available_id}">
                        {''.join(available_subgroups)}
                    </div>
                </div>
            """)
        
        # In-use hosts section
        in_use_hosts_by_usage = grouped['in_use']
        if in_use_hosts_by_usage:
            in_use_subgroups = []
            total_in_use = sum(len(hosts) for hosts in in_use_hosts_by_usage.values())
            
            if host_type == 'runpod':
                # Group by VM count
                for vm_count in sorted(in_use_hosts_by_usage.keys(), key=int, reverse=True):
                    hosts_in_group = in_use_hosts_by_usage[vm_count]
                    subgroup_id = f"inuse-{host_type}-{vm_count}vms"
                    cards = ''.join([
                        self.create_host_card_html(host, host_type, aggregate_name) 
                        for host in hosts_in_group
                    ])
                    
                    in_use_subgroups.append(f"""
                        <div class="host-subgroup vm-group">
                            <div class="host-subgroup-header clickable" onclick="toggleGroup('{subgroup_id}')">
                                <i class="fas fa-desktop text-danger"></i>
                                <span class="subgroup-title">{vm_count} VM{'s' if int(vm_count) != 1 else ''} ({len(hosts_in_group)})</span>
                                <i class="fas fa-chevron-down toggle-icon" id="{subgroup_id}-icon"></i>
                            </div>
                            <div class="host-subgroup-content" id="{subgroup_id}">
                                {cards}
                            </div>
                        </div>
                    """)
            else:
                # Group by GPU usage
                for gpu_usage in sorted(in_use_hosts_by_usage.keys(), key=int, reverse=True):
                    hosts_in_group = in_use_hosts_by_usage[gpu_usage]
                    subgroup_id = f"inuse-{host_type}-{gpu_usage}gpus"
                    cards = ''.join([
                        self.create_host_card_html(host, host_type, aggregate_name) 
                        for host in hosts_in_group
                    ])
                    
                    in_use_subgroups.append(f"""
                        <div class="host-subgroup gpu-group">
                            <div class="host-subgroup-header clickable" onclick="toggleGroup('{subgroup_id}')">
                                <i class="fas fa-microchip text-danger"></i>
                                <span class="subgroup-title">{gpu_usage} GPU{'s' if int(gpu_usage) != 1 else ''} ({len(hosts_in_group)})</span>
                                <i class="fas fa-chevron-down toggle-icon" id="{subgroup_id}-icon"></i>
                            </div>
                            <div class="host-subgroup-content" id="{subgroup_id}">
                                {cards}
                            </div>
                        </div>
                    """)
            
            in_use_id = f"inuse-{host_type}"
            sections_html.append(f"""
                <div class="host-group">
                    <div class="host-group-header clickable" onclick="toggleGroup('{in_use_id}')">
                        <i class="fas fa-exclamation-triangle text-warning"></i>
                        <h6 class="mb-0">In Use ({total_in_use})</h6>
                        <small class="text-muted">Has VMs - Move carefully</small>
                        <i class="fas fa-chevron-right toggle-icon" id="{in_use_id}-icon"></i>
                    </div>
                    <div class="host-group-content collapsed" id="{in_use_id}">
                        {''.join(in_use_subgroups)}
                    </div>
                </div>
            """)
        
        return ''.join(sections_html)
    
    def generate_ondemand_variants_html(self, ondemand_data: Dict[str, Any]) -> str:
        """
        Generate HTML for on-demand variants with separate columns.
        
        Args:
            ondemand_data: On-demand aggregate data
            
        Returns:
            HTML string for variant columns
        """
        try:
            variants = ondemand_data.get('variants', [])
            hosts = ondemand_data.get('hosts', [])
            
            if len(variants) <= 1:
                # Single variant - use standard rendering
                return self.generate_hosts_html(hosts, 'ondemand', ondemand_data.get('name'))
            
            variants_html = []
            
            for variant in variants:
                variant_hosts = [host for host in hosts if host.variant == variant.aggregate]
                variant_id = variant.aggregate.replace('[^a-zA-Z0-9]', '-')
                
                if not variant_hosts:
                    variants_html.append(f"""
                        <div class="host-group">
                            <div class="host-group-header clickable" onclick="toggleGroup('{variant_id}')">
                                <i class="fas fa-microchip text-primary"></i>
                                <h6>{variant.variant} <span class="badge bg-secondary ms-2">0</span></h6>
                                <small class="text-muted">No hosts available</small>
                                <i class="fas fa-chevron-down toggle-icon" id="{variant_id}-icon"></i>
                            </div>
                            <div class="host-group-content collapsed" id="{variant_id}">
                                <div class="drop-zone" data-type="ondemand" data-variant="{variant.aggregate}">
                                    <div class="empty-state">
                                        <i class="fas fa-server"></i>
                                        <p>No hosts in this variant</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    """)
                    continue
                
                # Group variant hosts
                available_hosts = [host for host in variant_hosts if not host.has_vms]
                in_use_hosts = [host for host in variant_hosts if host.has_vms]
                
                sections_html = []
                
                # Available hosts section for this variant
                if available_hosts:
                    grouped = self._group_hosts(available_hosts)
                    available_subgroups = []
                    
                    # Nexgen Cloud devices
                    if grouped['available']['nexgen']:
                        nexgen_cards = ''.join([
                            self.create_host_card_html(host, 'ondemand', variant.aggregate) 
                            for host in grouped['available']['nexgen']
                        ])
                        nexgen_subgroup_id = f"available-nexgen-{variant.aggregate}"
                        
                        available_subgroups.append(f"""
                            <div class="host-subgroup nexgen-group">
                                <div class="host-subgroup-header clickable" onclick="toggleGroup('{nexgen_subgroup_id}')">
                                    <i class="fas fa-cloud text-info"></i>
                                    <span class="subgroup-title">Nexgen Cloud ({len(grouped['available']['nexgen'])})</span>
                                    <i class="fas fa-chevron-down toggle-icon" id="{nexgen_subgroup_id}-icon"></i>
                                </div>
                                <div class="host-subgroup-content" id="{nexgen_subgroup_id}">
                                    {nexgen_cards}
                                </div>
                            </div>
                        """)
                    
                    # Investor devices
                    if grouped['available']['investors']:
                        investor_cards = ''.join([
                            self.create_host_card_html(host, 'ondemand', variant.aggregate) 
                            for host in grouped['available']['investors']
                        ])
                        investor_subgroup_id = f"available-investor-{variant.aggregate}"
                        
                        available_subgroups.append(f"""
                            <div class="host-subgroup investors-group">
                                <div class="host-subgroup-header clickable" onclick="toggleGroup('{investor_subgroup_id}')">
                                    <i class="fas fa-users text-warning"></i>
                                    <span class="subgroup-title">Investors ({len(grouped['available']['investors'])})</span>
                                    <i class="fas fa-chevron-down toggle-icon" id="{investor_subgroup_id}-icon"></i>
                                </div>
                                <div class="host-subgroup-content" id="{investor_subgroup_id}">
                                    {investor_cards}
                                </div>
                            </div>
                        """)
                    
                    available_id = f"available-{variant.aggregate}"
                    sections_html.append(f"""
                        <div class="host-group">
                            <div class="host-group-header clickable" onclick="toggleGroup('{available_id}')">
                                <i class="fas fa-check-circle text-success"></i>
                                <h6>Available ({len(available_hosts)})</h6>
                                <small class="text-muted">Ready for deployment</small>
                                <i class="fas fa-chevron-down toggle-icon" id="{available_id}-icon"></i>
                            </div>
                            <div class="host-group-content" id="{available_id}">
                                <div class="subgroups-container">
                                    {''.join(available_subgroups)}
                                </div>
                            </div>
                        </div>
                    """)
                
                # In-use hosts section for this variant
                if in_use_hosts:
                    in_use_cards = ''.join([
                        self.create_host_card_html(host, 'ondemand', variant.aggregate) 
                        for host in in_use_hosts
                    ])
                    in_use_id = f"inuse-{variant.aggregate}"
                    
                    sections_html.append(f"""
                        <div class="host-group">
                            <div class="host-group-header clickable" onclick="toggleGroup('{in_use_id}')">
                                <i class="fas fa-exclamation-triangle text-warning"></i>
                                <h6>In Use ({len(in_use_hosts)})</h6>
                                <small class="text-muted">Have running VMs</small>
                                <i class="fas fa-chevron-down toggle-icon" id="{in_use_id}-icon"></i>
                            </div>
                            <div class="host-group-content" id="{in_use_id}">
                                {in_use_cards}
                            </div>
                        </div>
                    """)
                
                # Create collapsible variant section
                variants_html.append(f"""
                    <div class="host-group">
                        <div class="host-group-header clickable" onclick="toggleGroup('{variant_id}')">
                            <i class="fas fa-microchip text-primary"></i>
                            <h6>{variant.variant} <span class="badge bg-secondary ms-2">{len(variant_hosts)}</span></h6>
                            <small class="text-muted">Available: {len(available_hosts)} | In Use: {len(in_use_hosts)}</small>
                            <i class="fas fa-chevron-down toggle-icon" id="{variant_id}-icon"></i>
                        </div>
                        <div class="host-group-content" id="{variant_id}">
                            <div class="drop-zone" data-type="ondemand" data-variant="{variant.aggregate}">
                                <div class="subgroups-container">
                                    {''.join(sections_html)}
                                </div>
                            </div>
                        </div>
                    </div>
                """)
            
            # Wrap all variants in a main drop zone
            return f"""
                <div class="drop-zone" data-type="ondemand">
                    {''.join(variants_html)}
                </div>
            """
            
        except Exception as e:
            logger.error(f"Error generating on-demand variants HTML: {e}")
            return '<div class="error">Error rendering variants</div>'
    
    def add_to_pending_operations(self, hostname: str, source_type: str, target_type: str, 
                                source_aggregate: str, target_aggregate: str, 
                                target_variant: str = None) -> bool:
        """
        Add a host migration operation to pending operations.
        
        Args:
            hostname: Name of the host to migrate
            source_type: Source aggregate type
            target_type: Target aggregate type
            source_aggregate: Source aggregate name
            target_aggregate: Target aggregate name
            target_variant: Specific target variant if applicable
            
        Returns:
            True if operation was added successfully, False otherwise
        """
        try:
            # Check if operation already exists
            existing_index = next(
                (i for i, op in enumerate(self.pending_operations) 
                 if op.hostname == hostname), -1
            )
            
            operation = PendingOperation(
                hostname=hostname,
                source_type=source_type,
                target_type=target_type,
                source_aggregate=source_aggregate,
                target_aggregate=target_aggregate,
                timestamp=datetime.now().isoformat(),
                operation_type=OperationType.HOST_MIGRATION
            )
            
            if existing_index != -1:
                # Update existing operation
                self.pending_operations[existing_index] = operation
                logger.info(f"Updated pending operation for {hostname}")
            else:
                # Add new operation
                self.pending_operations.append(operation)
                logger.info(f"Added new pending operation for {hostname}")
            
            return True
            
        except Exception as e:
            logger.error(f"Error adding pending operation for {hostname}: {e}")
            return False
    
    def add_runpod_launch_operation(self, hostname: str, vm_details: Dict[str, Any]) -> bool:
        """
        Add a RunPod launch operation to pending operations.
        
        Args:
            hostname: Name of the host to launch VM on
            vm_details: Dictionary containing VM configuration details
            
        Returns:
            True if operation was added successfully, False otherwise
        """
        try:
            # Check if host is already in RunPod aggregate (would need backend verification)
            # For now, assume caller has verified this
            
            # Check for duplicate operations
            existing_operation = next(
                (op for op in self.pending_operations 
                 if op.hostname == hostname and op.operation_type == OperationType.RUNPOD_LAUNCH), 
                None
            )
            
            if existing_operation:
                logger.warning(f"RunPod launch for {hostname} is already pending")
                return False
            
            operation = PendingOperation(
                hostname=hostname,
                source_type='runpod',
                target_type='runpod',
                source_aggregate=vm_details.get('current_aggregate', ''),
                target_aggregate=vm_details.get('current_aggregate', ''),
                timestamp=datetime.now().isoformat(),
                operation_type=OperationType.RUNPOD_LAUNCH,
                vm_name=vm_details.get('vm_name', hostname),
                flavor_name=vm_details.get('flavor_name'),
                image_name=vm_details.get('image_name'),
                key_name=vm_details.get('key_name'),
                manual=vm_details.get('manual', False),
                source=vm_details.get('source', 'unknown')
            )
            
            self.pending_operations.append(operation)
            logger.info(f"Added RunPod launch operation for {hostname}")
            return True
            
        except Exception as e:
            logger.error(f"Error adding RunPod launch operation for {hostname}: {e}")
            return False
    
    def remove_pending_operation(self, index: int) -> bool:
        """
        Remove a pending operation by index.
        
        Args:
            index: Index of the operation to remove
            
        Returns:
            True if operation was removed successfully, False otherwise
        """
        try:
            if 0 <= index < len(self.pending_operations):
                operation = self.pending_operations.pop(index)
                logger.info(f"Removed pending operation for {operation.hostname}")
                return True
            else:
                logger.error(f"Invalid operation index: {index}")
                return False
                
        except Exception as e:
            logger.error(f"Error removing pending operation at index {index}: {e}")
            return False
    
    def generate_individual_command_operations(self, operation: PendingOperation) -> List[Command]:
        """
        Generate individual command operations for a pending operation.
        
        Args:
            operation: The pending operation to generate commands for
            
        Returns:
            List of Command objects representing individual steps
        """
        try:
            commands = []
            
            if operation.operation_type == OperationType.RUNPOD_LAUNCH:
                # Generate RunPod launch commands
                commands.extend(self._generate_runpod_launch_commands(operation))
            else:
                # Generate migration commands
                commands.extend(self._generate_migration_commands(operation))
            
            return commands
            
        except Exception as e:
            logger.error(f"Error generating commands for operation {operation.hostname}: {e}")
            return []
    
    def _generate_runpod_launch_commands(self, operation: PendingOperation) -> List[Command]:
        """Generate commands for RunPod VM launch"""
        commands = []
        
        # 1. VM Launch command
        commands.append(Command(
            type='hyperstack-launch',
            hostname=operation.hostname,
            parent_operation='runpod-launch',
            title='Deploy VM via Hyperstack API',
            description='Creates new virtual machine on the specified host with correct specifications and flavor',
            command=f"curl -X POST https://infrahub-api.nexgencloud.com/v1/core/virtual-machines " + 
                    f"-H 'api_key: <HYPERSTACK_API_KEY>' " +
                    f"-H 'Content-Type: application/json' " +
                    f"-d '{{\n" +
                    f"  \"name\": \"{operation.vm_name or operation.hostname}\",\n" +
                    f"  \"environment_name\": \"CA1-RunPod\",\n" +
                    f"  \"image_name\": \"Ubuntu Server 24.04 LTS R570 CUDA 12.8\",\n" +
                    f"  \"flavor_name\": \"<GPU_FLAVOR>\",\n" +
                    f"  \"assign_floating_ip\": true,\n" +
                    f"  \"user_data\": \"<CLOUD_INIT_SCRIPT_WITH_RUNPOD_API_KEY>\"\n" +
                    f"}}' # VM: {operation.vm_name or operation.hostname}",
            verification_commands=[
                f"openstack server show {operation.vm_name or operation.hostname} --all-projects",
                f"openstack server list --host {operation.hostname} --all-projects"
            ],
            timing='Immediate',
            command_type='api',
            purpose='Create the virtual machine on the specified compute host with proper configuration for RunPod integration',
            expected_output='VM created successfully with assigned ID and floating IP',
            dependencies=[]
        ))
        
        if operation.hostname.startswith('CA1-'):
            # Add storage and firewall commands for CA1 hosts
            commands.extend(self._generate_ca1_specific_commands(operation))
        
        return commands
    
    def _generate_ca1_specific_commands(self, operation: PendingOperation) -> List[Command]:
        """Generate CA1-specific commands for storage and firewall setup"""
        commands = []
        
        # 2. Sleep 120 seconds before storage operations
        commands.append(Command(
            type='storage-wait-command',
            hostname=operation.hostname,
            parent_operation='runpod-launch',
            title='Sleep 120 seconds',
            description='Wait for VM to fully boot and initialize before attaching storage network interface',
            command='sleep 120  # Wait for VM boot completion before network operations',
            timing='120s delay',
            command_type='timing',
            purpose='Ensure VM is ready for network interface attachment to prevent OpenStack errors',
            expected_output='Wait completed - VM ready for network operations',
            dependencies=['hyperstack-launch']
        ))
        
        # 3. Get Server UUID
        commands.append(Command(
            type='server-get-uuid',
            hostname=operation.hostname,
            parent_operation='runpod-launch',
            title='Get server UUID for network operations',
            description='Retrieves the OpenStack server UUID required for network attachment',
            command=f'openstack server list --all-projects --name "{operation.hostname}" -c ID -f value',
            timing='Immediate',
            command_type='server',
            purpose='Get the server UUID required for OpenStack network operations',
            expected_output='Server UUID (e.g., 832eccd6-d9fb-4c00-9b71-8ee69b19a14b)',
            dependencies=['storage-wait-command']
        ))
        
        # 4. Storage Network - Direct Attachment
        commands.append(Command(
            type='storage-attach-network',
            hostname=operation.hostname,
            parent_operation='runpod-launch',
            title='Attach storage network to VM',
            description='Directly attaches the storage network to the VM using server UUID',
            command='openstack server add network <UUID_FROM_STEP_4> "RunPod-Storage-Canada-1"',
            timing='Immediate',
            command_type='network',
            purpose='Connect VM to high-performance storage network for data access',
            expected_output='Network successfully attached to VM',
            dependencies=['server-get-uuid']
        ))
        
        # 5. Sleep 10 seconds before firewall operations
        commands.append(Command(
            type='firewall-wait-command',
            hostname=operation.hostname,
            parent_operation='runpod-launch',
            title='Sleep 10 seconds',
            description='Wait before firewall attachment to ensure network configuration is complete',
            command='sleep 10  # Wait before firewall attachment',
            timing='Sleep',
            command_type='wait',
            purpose='Allow network configuration to stabilize before firewall attachment',
            expected_output='Sleep completed successfully',
            dependencies=['storage-attach-network']
        ))
        
        # 6. Firewall - Get Current Attachments
        commands.append(Command(
            type='firewall-get-attachments',
            hostname=operation.hostname,
            parent_operation='runpod-launch',
            title='Get current firewall VM attachments',
            description='Retrieves list of VMs currently attached to firewall to preserve them during update',
            command="curl -X GET https://infrahub-api.nexgencloud.com/v1/core/firewalls/971 " +
                    "-H 'api_key: <HYPERSTACK_API_KEY>' " +
                    "-H 'Content-Type: application/json'",
            timing='Immediate',
            command_type='security',
            purpose='Preserve existing VM attachments when updating firewall rules',
            expected_output='JSON list of currently attached VM IDs',
            dependencies=['firewall-wait-command']
        ))
        
        # 7. Firewall - Update with All VMs
        commands.append(Command(
            type='firewall-update-attachments',
            hostname=operation.hostname,
            parent_operation='runpod-launch',
            title='Update firewall with all VMs (existing + new)',
            description='Updates firewall to include all existing VMs plus the newly created VM',
            command=f"curl -X POST https://infrahub-api.nexgencloud.com/v1/core/firewalls/971/update-attachments " +
                    f"-H 'api_key: <HYPERSTACK_API_KEY>' " +
                    f"-H 'Content-Type: application/json' " +
                    f"-d '{{\n" +
                    f"  \"virtual_machines\": [\n" +
                    f"    \"<EXISTING_VM_IDS>\",\n" +
                    f"    \"<NEW_VM_ID>\"\n" +
                    f"  ]\n" +
                    f"}}' # New VM: {operation.vm_name or operation.hostname}",
            timing='Immediate',
            command_type='security',
            purpose='Apply security rules to new VM while preserving existing VM protections',
            expected_output='Firewall updated successfully with all VM attachments',
            dependencies=['firewall-get-attachments']
        ))
        
        return commands
    
    def _generate_migration_commands(self, operation: PendingOperation) -> List[Command]:
        """Generate commands for host migration"""
        commands = []
        
        # 1. Remove from source aggregate
        commands.append(Command(
            type='aggregate-remove',
            hostname=operation.hostname,
            parent_operation='host-migration',
            title=f'Remove host from {operation.source_aggregate}',
            description='Removes compute host from current aggregate to prepare for relocation',
            command=f'openstack aggregate remove host {operation.source_aggregate} {operation.hostname}',
            timing='Immediate',
            command_type='migration',
            purpose='Remove host from current resource pool to enable relocation',
            expected_output=f'Host {operation.hostname} removed from aggregate {operation.source_aggregate}',
            dependencies=[]
        ))
        
        # 2. Add to target aggregate
        commands.append(Command(
            type='aggregate-add',
            hostname=operation.hostname,
            parent_operation='host-migration',
            title=f'Add host to {operation.target_aggregate}',
            description='Adds compute host to target aggregate for new resource pool assignment',
            command=f'openstack aggregate add host {operation.target_aggregate} {operation.hostname}',
            timing='After removal completes',
            command_type='migration',
            purpose='Add host to target resource pool with new billing model',
            expected_output=f'Host {operation.hostname} added to aggregate {operation.target_aggregate}',
            dependencies=['aggregate-remove']
        ))
        
        return commands
    
    def generate_pending_operations_html(self) -> str:
        """
        Generate HTML for pending operations display.
        
        Returns:
            HTML string for pending operations
        """
        try:
            if not self.pending_operations:
                return """
                    <div class="text-center text-muted">
                        <i class="fas fa-clock fa-3x mb-3"></i>
                        <p>No pending operations. Select hosts and add operations to see them here.</p>
                    </div>
                """
            
            operations_html = []
            
            for index, operation in enumerate(self.pending_operations):
                commands = self.generate_individual_command_operations(operation)
                
                operation_title = (
                    f"🚀 Launch VM '{operation.vm_name or operation.hostname}' on {operation.hostname}"
                    if operation.operation_type == OperationType.RUNPOD_LAUNCH
                    else f"🔄 Move {operation.hostname} from {operation.source_aggregate} to {operation.target_aggregate}"
                )
                
                purpose_text = (
                    'Deploy new virtual machine with automated networking and security configuration'
                    if operation.operation_type == OperationType.RUNPOD_LAUNCH
                    else 'Relocate compute host between resource pools for different billing models'
                )
                
                commands_html = self._generate_commands_html(commands, index)
                
                operations_html.append(f"""
                    <div class="pending-operation-card card mb-4" data-index="{index}">
                        <div class="card-header bg-primary text-white">
                            <div class="d-flex justify-content-between align-items-center">
                                <div class="d-flex align-items-center">
                                    <button class="btn btn-sm btn-outline-light me-2" 
                                            onclick="toggleOperationCollapse({index})" 
                                            id="collapse-btn-{index}"
                                            title="Expand/Collapse operation">
                                        <i class="fas fa-chevron-down"></i>
                                    </button>
                                    <h6 class="mb-0">{operation_title}</h6>
                                </div>
                                <button class="btn btn-sm btn-outline-light" onclick="removePendingOperation({index})" title="Remove operation">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                            <small class="text-light">
                                <strong>Purpose:</strong> {purpose_text}
                            </small>
                        </div>
                        <div class="card-body collapse show" id="operation-body-{index}">
                            <div class="commands-list">
                                <div class="d-flex justify-content-between align-items-center mb-3">
                                    <h6 class="text-primary mb-0">
                                        <i class="fas fa-list-ol me-1"></i>
                                        Commands to Execute ({len(commands)} total)
                                    </h6>
                                    <div class="btn-group" role="group">
                                        <button type="button" class="btn btn-sm btn-outline-secondary" onclick="expandAllCommands()" title="Expand all commands">
                                            <i class="fas fa-expand-alt me-1"></i>Expand All
                                        </button>
                                        <button type="button" class="btn btn-sm btn-outline-secondary" onclick="collapseAllCommands()" title="Collapse all commands">
                                            <i class="fas fa-compress-alt me-1"></i>Collapse All
                                        </button>
                                    </div>
                                </div>
                                {commands_html}
                            </div>
                            
                            <div class="operation-meta mt-3 pt-3 border-top">
                                <small class="text-muted">
                                    <i class="fas fa-clock"></i> Added {datetime.fromisoformat(operation.timestamp.replace('Z', '+00:00')).strftime('%Y-%m-%d %H:%M:%S')}
                                </small>
                            </div>
                        </div>
                    </div>
                """)
            
            return ''.join(operations_html)
            
        except Exception as e:
            logger.error(f"Error generating pending operations HTML: {e}")
            return '<div class="error">Error rendering pending operations</div>'
    
    def _generate_commands_html(self, commands: List[Command], operation_index: int) -> str:
        """Generate HTML for command list"""
        commands_html = []
        
        for cmd_index, cmd in enumerate(commands):
            command_id = f"cmd-{cmd.hostname}-{cmd.type}-{cmd_index}"
            is_completed = cmd.type in getattr(self.pending_operations[operation_index], 'completed_commands', [])
            command_class = 'command-operation completed-step' if is_completed else 'command-operation'
            status_icon = '<i class="fas fa-check-circle text-success me-1"></i>' if is_completed else ''
            disabled_attr = 'disabled' if is_completed else ''
            checked_attr = 'checked' if is_completed else ''
            
            # Determine status badge
            status_badge = 'Completed' if is_completed else 'Pending'
            status_class = 'bg-success' if is_completed else 'bg-secondary'
            
            # Progress bar for timed operations
            progress_bar = ''
            if cmd.type in ['wait-command', 'storage-wait-command', 'firewall-wait-command']:
                progress_bar = f"""
                    <div class="command-progress mt-1" id="{command_id}-progress" style="display: none;">
                        <div class="progress" style="height: 6px;">
                            <div class="progress-bar progress-bar-striped progress-bar-animated bg-warning" 
                                 role="progressbar" style="width: 0%" id="{command_id}-progress-bar">
                            </div>
                        </div>
                        <small class="text-muted" id="{command_id}-progress-text">Waiting...</small>
                    </div>
                """
            
            # Dependencies section
            dependencies_section = ''
            if cmd.dependencies:
                dependencies_badges = ''.join([
                    f'<span class="badge bg-warning text-dark me-1">{dep}</span>' 
                    for dep in cmd.dependencies
                ])
                dependencies_section = f"""
                    <div class="command-dependencies mt-2">
                        <strong class="text-warning">Dependencies:</strong>
                        <div class="small mt-1">
                            {dependencies_badges}
                        </div>
                    </div>
                """
            
            commands_html.append(f"""
                <div class="{command_class}" data-command-id="{command_id}">
                    <div class="command-header-container">
                        <div class="command-main-header d-flex align-items-center">
                            <input type="checkbox" class="form-check-input command-operation-checkbox me-2" 
                                   id="{command_id}" {checked_attr} {disabled_attr}
                                   data-operation-index="{operation_index}" data-command-index="{cmd_index}"
                                   onchange="updateCommitButtonState()">
                            
                            <button class="btn btn-sm btn-outline-secondary me-2 command-collapse-btn" 
                                    onclick="toggleCommandDetails('{command_id}')"
                                    title="Expand/Collapse command details">
                                <i class="fas fa-chevron-down" id="{command_id}-chevron"></i>
                            </button>
                            
                            <div class="command-title-section flex-grow-1">
                                <label class="form-check-label command-title d-flex align-items-center" for="{command_id}">
                                    {status_icon}
                                    <i class="{self._get_command_icon(cmd.command_type)} me-1"></i>
                                    <strong>{cmd.title}</strong>
                                </label>
                                {progress_bar}
                            </div>
                            
                            <span class="badge {status_class} ms-2 command-status-badge" id="{command_id}-status">{status_badge}</span>
                        </div>
                    </div>
                    
                    <div class="command-details mt-2" style="display: none;">
                        <div class="command-purpose">
                            <strong class="text-primary">Purpose:</strong>
                            <div class="text-muted small mt-1">{cmd.purpose}</div>
                        </div>
                        
                        <div class="command-description mt-2">
                            <strong class="text-info">Description:</strong>
                            <div class="text-muted small mt-1">{cmd.description}</div>
                        </div>
                        
                        <div class="command-to-execute mt-2">
                            <strong class="text-dark">Command:</strong>
                            <code class="d-block mt-1 p-2 bg-light rounded small">{cmd.command}</code>
                        </div>
                        
                        <div class="command-expected mt-2">
                            <strong class="text-success">Expected Output:</strong>
                            <div class="text-muted small mt-1 font-italic">{cmd.expected_output}</div>
                        </div>
                        
                        <div class="command-actual-output mt-2" id="{command_id}-actual-output" style="display: none;">
                            <strong class="text-primary">Actual Output:</strong>
                            <div class="actual-output-content bg-dark text-light p-2 rounded small mt-1" style="font-family: monospace; white-space: pre-wrap;"></div>
                        </div>
                        
                        {dependencies_section}
                    </div>
                </div>
            """)
        
        return ''.join(commands_html)
    
    def _get_command_icon(self, command_type: str) -> str:
        """Get icon class for command type"""
        icon_map = {
            'api': 'fas fa-cloud',
            'timing': 'fas fa-clock',
            'server': 'fas fa-server',
            'network': 'fas fa-network-wired',
            'wait': 'fas fa-hourglass-half',
            'security': 'fas fa-shield-alt',
            'migration': 'fas fa-exchange-alt'
        }
        return icon_map.get(command_type, 'fas fa-terminal')
    
    def get_pending_operations_count(self) -> int:
        """Get count of pending operations"""
        return len(self.pending_operations)
    
    def clear_pending_operations(self) -> None:
        """Clear all pending operations"""
        self.pending_operations.clear()
        logger.info("Cleared all pending operations")
    
    def get_pending_operations_summary(self) -> Dict[str, Any]:
        """
        Get a summary of pending operations for template rendering.
        
        Returns:
            Dictionary containing operation counts and summary data
        """
        migration_count = sum(1 for op in self.pending_operations 
                            if op.operation_type == OperationType.HOST_MIGRATION)
        launch_count = sum(1 for op in self.pending_operations 
                         if op.operation_type == OperationType.RUNPOD_LAUNCH)
        
        return {
            'total_count': len(self.pending_operations),
            'migration_count': migration_count,
            'launch_count': launch_count,
            'has_operations': len(self.pending_operations) > 0
        }
    
    def process_drag_drop_operation(self, form_data: Dict[str, Any]) -> bool:
        """
        Process a drag-and-drop operation from form data.
        
        This replaces the JavaScript drag-and-drop with server-side form processing.
        
        Args:
            form_data: Dictionary containing:
                - hostname: Name of the host to move
                - source_type: Source aggregate type
                - target_type: Target aggregate type
                - source_aggregate: Source aggregate name (optional)
                - target_aggregate: Target aggregate name (optional)
                - target_variant: Target variant if applicable (optional)
                
        Returns:
            True if operation was processed successfully, False otherwise
        """
        try:
            hostname = form_data.get('hostname')
            source_type = form_data.get('source_type')
            target_type = form_data.get('target_type')
            
            if not all([hostname, source_type, target_type]):
                logger.error("Missing required fields for drag-drop operation")
                return False
            
            # Skip if source and target are the same
            if source_type == target_type:
                logger.info(f"Skipping operation: source and target are the same ({source_type})")
                return True
            
            source_aggregate = form_data.get('source_aggregate', '')
            target_aggregate = form_data.get('target_aggregate', '')
            target_variant = form_data.get('target_variant')
            
            return self.add_to_pending_operations(
                hostname=hostname,
                source_type=source_type,
                target_type=target_type,
                source_aggregate=source_aggregate,
                target_aggregate=target_aggregate,
                target_variant=target_variant
            )
            
        except Exception as e:
            logger.error(f"Error processing drag-drop operation: {e}")
            return False
    
    def process_runpod_launch_form(self, form_data: Dict[str, Any]) -> bool:
        """
        Process a RunPod launch form submission.
        
        Args:
            form_data: Dictionary containing VM configuration details
                
        Returns:
            True if operation was processed successfully, False otherwise
        """
        try:
            hostname = form_data.get('hostname')
            if not hostname:
                logger.error("Missing hostname for RunPod launch")
                return False
            
            return self.add_runpod_launch_operation(hostname, form_data)
            
        except Exception as e:
            logger.error(f"Error processing RunPod launch form: {e}")
            return False
    
    def generate_host_selection_form_data(self) -> Dict[str, Any]:
        """
        Generate data for host selection forms.
        
        Returns:
            Dictionary containing form data for templates
        """
        return {
            'selected_hosts': list(self.selected_hosts),
            'selected_count': len(self.selected_hosts),
            'has_selections': len(self.selected_hosts) > 0
        }
    
    def update_host_selection(self, hostname: str, selected: bool) -> bool:
        """
        Update host selection state.
        
        Args:
            hostname: Name of the host
            selected: Whether the host should be selected
            
        Returns:
            True if selection was updated successfully
        """
        try:
            if selected:
                self.selected_hosts.add(hostname)
                logger.debug(f"Selected host: {hostname}")
            else:
                self.selected_hosts.discard(hostname)
                logger.debug(f"Deselected host: {hostname}")
            
            return True
            
        except Exception as e:
            logger.error(f"Error updating host selection for {hostname}: {e}")
            return False
    
    def clear_host_selection(self) -> None:
        """Clear all host selections"""
        self.selected_hosts.clear()
        logger.info("Cleared all host selections")
    
    def get_template_context(self, aggregate_data: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Get complete template context for rendering.
        
        Args:
            aggregate_data: Optional aggregate data to process
            
        Returns:
            Complete context dictionary for template rendering
        """
        try:
            context = {
                'frontend_state': {
                    'current_gpu_type': self.current_gpu_type,
                    'selected_hosts': list(self.selected_hosts),
                    'available_gpu_types': self.available_gpu_types,
                    'is_execution_in_progress': self.is_execution_in_progress
                },
                'host_selection': self.generate_host_selection_form_data(),
                'pending_operations': {
                    'count': self.get_pending_operations_count(),
                    'summary': self.get_pending_operations_summary(),
                    'html': self.generate_pending_operations_html()
                }
            }
            
            # Process aggregate data if provided
            if aggregate_data:
                processed_data = self.render_aggregate_data(aggregate_data)
                context['aggregate_data'] = processed_data
                
                # Generate HTML for each aggregate type
                context['aggregate_html'] = {
                    'ondemand': self._generate_aggregate_html('ondemand', processed_data),
                    'runpod': self._generate_aggregate_html('runpod', processed_data),
                    'spot': self._generate_aggregate_html('spot', processed_data)
                }
            
            return context
            
        except Exception as e:
            logger.error(f"Error generating template context: {e}")
            return self._get_empty_template_context()
    
    def _generate_aggregate_html(self, aggregate_type: str, processed_data: Dict[str, Any]) -> str:
        """Generate HTML for a specific aggregate type"""
        try:
            aggregate_info = processed_data.get(aggregate_type, {})
            hosts = aggregate_info.get('hosts', [])
            
            if aggregate_type == 'ondemand' and processed_data.get('column_layout', {}).get('use_variant_columns'):
                return self.generate_ondemand_variants_html(aggregate_info)
            else:
                return self.generate_hosts_html(hosts, aggregate_type, aggregate_info.get('name'))
                
        except Exception as e:
            logger.error(f"Error generating {aggregate_type} HTML: {e}")
            return f'<div class="error">Error rendering {aggregate_type} hosts</div>'
    
    def _get_empty_template_context(self) -> Dict[str, Any]:
        """Get empty template context for error cases"""
        return {
            'frontend_state': {
                'current_gpu_type': '',
                'selected_hosts': [],
                'available_gpu_types': [],
                'is_execution_in_progress': False
            },
            'host_selection': {
                'selected_hosts': [],
                'selected_count': 0,
                'has_selections': False
            },
            'pending_operations': {
                'count': 0,
                'summary': {'total_count': 0, 'migration_count': 0, 'launch_count': 0, 'has_operations': False},
                'html': '<div class="error">Error loading operations</div>'
            },
            'aggregate_data': self._get_empty_aggregate_data(),
            'aggregate_html': {
                'ondemand': '<div class="error">Error loading data</div>',
                'runpod': '<div class="error">Error loading data</div>',
                'spot': '<div class="error">Error loading data</div>'
            }
        }
    
    def validate_operation_data(self, operation_data: Dict[str, Any]) -> Tuple[bool, List[str]]:
        """
        Validate operation data before processing.
        
        Args:
            operation_data: Dictionary containing operation details
            
        Returns:
            Tuple of (is_valid, list_of_error_messages)
        """
        errors = []
        
        # Check required fields
        required_fields = ['hostname', 'source_type', 'target_type']
        for field in required_fields:
            if not operation_data.get(field):
                errors.append(f"Missing required field: {field}")
        
        # Validate host type values
        valid_types = [t.value for t in HostType]
        source_type = operation_data.get('source_type')
        target_type = operation_data.get('target_type')
        
        if source_type and source_type not in valid_types:
            errors.append(f"Invalid source_type: {source_type}")
        
        if target_type and target_type not in valid_types:
            errors.append(f"Invalid target_type: {target_type}")
        
        # Check for same source and target
        if source_type == target_type:
            errors.append("Source and target types cannot be the same")
        
        return len(errors) == 0, errors
    
    def get_operation_by_hostname(self, hostname: str) -> Optional[PendingOperation]:
        """
        Get pending operation by hostname.
        
        Args:
            hostname: Name of the host
            
        Returns:
            PendingOperation if found, None otherwise
        """
        return next(
            (op for op in self.pending_operations if op.hostname == hostname),
            None
        )
    
    def update_operation_progress(self, hostname: str, completed_commands: List[str]) -> bool:
        """
        Update the progress of an operation by marking commands as completed.
        
        Args:
            hostname: Name of the host
            completed_commands: List of completed command types
            
        Returns:
            True if operation was updated successfully, False otherwise
        """
        try:
            operation = self.get_operation_by_hostname(hostname)
            if not operation:
                logger.error(f"No operation found for hostname: {hostname}")
                return False
            
            operation.completed_commands = completed_commands
            logger.info(f"Updated operation progress for {hostname}: {len(completed_commands)} commands completed")
            return True
            
        except Exception as e:
            logger.error(f"Error updating operation progress for {hostname}: {e}")
            return False


# Utility functions for template filters and helpers
def get_progress_bar_class(percentage: int) -> str:
    """Get Bootstrap progress bar class based on percentage"""
    if percentage < 50:
        return 'bg-success'
    elif percentage < 80:
        return 'bg-warning'
    else:
        return 'bg-danger'


def format_gpu_usage(gpu_used: int, gpu_capacity: int) -> str:
    """Format GPU usage as ratio string"""
    return f"{gpu_used}/{gpu_capacity}"


def get_host_status_class(host: Host) -> str:
    """Get CSS class for host status"""
    if host.has_vms:
        return 'has-vms'
    return 'available'


def get_owner_group_icon(owner_group: str) -> str:
    """Get icon class for owner group"""
    if owner_group == 'Nexgen Cloud':
        return 'fas fa-cloud'
    return 'fas fa-users'


def escape_html_id(text: str) -> str:
    """Escape text for use as HTML ID"""
    import re
    return re.sub(r'[^a-zA-Z0-9]', '-', text)


# Export the main class and utility functions
__all__ = [
    'FrontendManager',
    'Host',
    'Variant', 
    'GpuSummary',
    'AggregateGroup',
    'Command',
    'PendingOperation',
    'HostType',
    'OperationType',
    'CommandType',
    'get_progress_bar_class',
    'format_gpu_usage',
    'get_host_status_class',
    'get_owner_group_icon',
    'escape_html_id'
]