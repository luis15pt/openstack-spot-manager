/**
 * Customer View functionality for OpenStack Spot Manager
 * Provides a customer-focused view of contract devices organized by GPU count
 */

class CustomerView {
    constructor() {
        this.isActive = false;
        this.selectedDevice = null;
        this.currentContractData = null;
        this.currentGpuType = null;
        this.availableGpuTypes = [];
        this.availableContracts = [];
    }

    /**
     * Initialize customer view functionality
     */
    async initialize() {
        console.log('🎯 Initializing Customer View');
        
        // Set up event handlers for dropdowns
        this.setupEventHandlers();
        
        // Load initial data
        await this.loadGpuTypes();
        
        console.log('✅ Customer View initialized');
    }

    /**
     * Set up event handlers for customer view elements
     */
    setupEventHandlers() {
        const gpuSelect = document.getElementById('customerViewGpuSelect');
        const contractSelect = document.getElementById('customerViewContractSelect');

        if (gpuSelect) {
            gpuSelect.addEventListener('change', (e) => {
                this.onGpuTypeChange(e.target.value);
            });
        }

        if (contractSelect) {
            contractSelect.addEventListener('change', (e) => {
                this.onContractChange(e.target.value);
            });
        }
    }

    /**
     * Load available GPU types
     */
    async loadGpuTypes() {
        try {
            console.log('🔍 Loading GPU types for customer view');
            const response = await fetch('/api/gpu-types');
            const data = await response.json();
            
            if (data.status === 'success' && data.data) {
                this.availableGpuTypes = data.data;
                this.populateGpuSelect();
            }
        } catch (error) {
            console.error('❌ Error loading GPU types:', error);
        }
    }

    /**
     * Populate GPU type dropdown
     */
    populateGpuSelect() {
        const gpuSelect = document.getElementById('customerViewGpuSelect');
        if (!gpuSelect) return;

        gpuSelect.innerHTML = '<option value="">Select GPU Type...</option>';
        
        this.availableGpuTypes.forEach(gpuType => {
            const option = document.createElement('option');
            option.value = gpuType;
            option.textContent = gpuType;
            gpuSelect.appendChild(option);
        });

        // If there's a current GPU type from main app, select it
        if (window.currentGpuType) {
            gpuSelect.value = window.currentGpuType;
            this.currentGpuType = window.currentGpuType;
            this.onGpuTypeChange(window.currentGpuType);
        }
    }

    /**
     * Handle GPU type selection change
     */
    async onGpuTypeChange(gpuType) {
        if (!gpuType) {
            this.clearContractSelect();
            this.clearCustomerView();
            return;
        }

        console.log(`🔄 GPU type changed to: ${gpuType}`);
        this.currentGpuType = gpuType;
        
        // Load contracts for this GPU type
        await this.loadContracts(gpuType);
    }

    /**
     * Load available contracts for the selected GPU type
     */
    async loadContracts(gpuType) {
        try {
            console.log(`🔍 Loading contracts for GPU type: ${gpuType}`);
            const response = await fetch(`/api/contract-aggregates/${gpuType}`);
            const data = await response.json();
            
            if (data.contracts) {
                this.availableContracts = data.contracts;
                this.populateContractSelect();
            } else {
                this.availableContracts = [];
                this.clearContractSelect();
            }
        } catch (error) {
            console.error('❌ Error loading contracts:', error);
            this.clearContractSelect();
        }
    }

    /**
     * Populate contract dropdown
     */
    populateContractSelect() {
        const contractSelect = document.getElementById('customerViewContractSelect');
        if (!contractSelect) return;

        contractSelect.innerHTML = '<option value="">Select Contract...</option>';
        
        this.availableContracts.forEach(contract => {
            const option = document.createElement('option');
            option.value = contract.aggregate;
            option.textContent = `${contract.name} (${contract.host_count} hosts)`;
            contractSelect.appendChild(option);
        });
    }

    /**
     * Clear contract dropdown
     */
    clearContractSelect() {
        const contractSelect = document.getElementById('customerViewContractSelect');
        if (contractSelect) {
            contractSelect.innerHTML = '<option value="">Select Contract...</option>';
        }
        this.clearCustomerView();
    }

    /**
     * Handle contract selection change
     */
    async onContractChange(contractAggregate) {
        if (!contractAggregate) {
            this.clearCustomerView();
            return;
        }

        console.log(`🔄 Contract changed to: ${contractAggregate}`);
        
        // Find the selected contract data
        const selectedContract = this.availableContracts.find(c => c.aggregate === contractAggregate);
        if (selectedContract) {
            this.currentContractData = selectedContract;
            
            // Update contract name display
            const contractNameElement = document.getElementById('customerViewContractName');
            if (contractNameElement) {
                contractNameElement.textContent = selectedContract.name;
            }
            
            // Render the customer view
            await this.renderCustomerView(selectedContract);
        }
    }

    /**
     * Render the customer view with devices grouped by GPU count
     */
    async renderCustomerView(contractData) {
        const contentContainer = document.getElementById('customerViewContent');
        if (!contentContainer) return;

        console.log('🎨 Rendering customer view for contract:', contractData.name);

        // Group hosts by GPU capacity (available GPUs)
        const hostsByGpuCapacity = this.groupHostsByGpuCapacity(contractData.hosts);
        
        // Sort by GPU capacity (8 GPUs -> 1 GPU, then available -> in use)
        const sortedGpuGroups = Object.keys(hostsByGpuCapacity)
            .sort((a, b) => parseInt(b) - parseInt(a));

        if (sortedGpuGroups.length === 0) {
            contentContainer.innerHTML = `
                <div class="customer-empty-state">
                    <i class="fas fa-server fa-3x mb-3"></i>
                    <h5>No devices found</h5>
                    <p>This contract has no devices available.</p>
                </div>
            `;
            return;
        }

        // Create horizontal GPU groups layout
        let groupsHtml = '<div class="customer-gpu-groups-container">';
        
        for (const gpuCapacity of sortedGpuGroups) {
            const hosts = hostsByGpuCapacity[gpuCapacity];
            const availableHosts = hosts.filter(h => !h.has_vms);
            const inUseHosts = hosts.filter(h => h.has_vms);
            
            // Create group header with GPU count
            const headerText = `${gpuCapacity} GPU${gpuCapacity !== '1' ? 's' : ''}`;
            const totalCount = hosts.length;
            const availableCount = availableHosts.length;
            
            groupsHtml += `
                <div class="customer-gpu-group">
                    <div class="customer-gpu-group-header">
                        <div>${headerText}</div>
                        <small>${availableCount}/${totalCount} Available</small>
                    </div>
                    <div class="customer-gpu-group-content">
            `;
            
            // Render available devices first
            if (availableHosts.length > 0) {
                groupsHtml += `<div class="mb-2"><small class="text-success"><strong>Available (${availableHosts.length})</strong></small></div>`;
                availableHosts.forEach(host => {
                    groupsHtml += this.createCustomerDeviceCard(host, true);
                });
            }
            
            // Render in-use devices
            if (inUseHosts.length > 0) {
                groupsHtml += `<div class="mb-2 mt-3"><small class="text-warning"><strong>In Use (${inUseHosts.length})</strong></small></div>`;
                inUseHosts.forEach(host => {
                    groupsHtml += this.createCustomerDeviceCard(host, false);
                });
            }
            
            groupsHtml += `
                    </div>
                </div>
            `;
        }
        
        groupsHtml += '</div>';
        contentContainer.innerHTML = groupsHtml;
        
        // Set up click handlers for device cards
        this.setupDeviceCardHandlers();
        
        console.log('✅ Customer view rendered successfully');
    }

    /**
     * Group hosts by their GPU capacity
     */
    groupHostsByGpuCapacity(hosts) {
        const grouped = {};
        
        hosts.forEach(host => {
            const gpuInfo = host.gpu_info || {};
            const capacity = gpuInfo.gpu_capacity || 8; // Default to 8 GPUs
            
            if (!grouped[capacity]) {
                grouped[capacity] = [];
            }
            grouped[capacity].push(host);
        });
        
        return grouped;
    }

    /**
     * Create a device card for customer view (without owner/nexgen tags)
     */
    createCustomerDeviceCard(host, isAvailable) {
        const gpuInfo = host.gpu_info || {};
        const totalGpus = gpuInfo.gpu_capacity || 8;
        const usedGpus = gpuInfo.gpu_used || 0;
        const vmCount = host.vm_count || 0;
        
        // Determine GPU usage badge style
        let badgeClass = 'customer-device-gpu-badge';
        if (usedGpus === 0) {
            badgeClass += ''; // Available - green (default)
        } else if (usedGpus < totalGpus) {
            badgeClass += ' partial'; // Partially used - yellow
        } else {
            badgeClass += ' full'; // Fully used - red
        }
        
        // Create VM list if there are VMs
        let vmListHtml = '';
        if (vmCount > 0) {
            vmListHtml = `
                <div class="customer-device-vm-list">
                    <div class="d-flex justify-content-between align-items-center mb-2">
                        <small class="text-muted"><strong>VMs (${vmCount})</strong></small>
                        <small class="text-primary cursor-pointer" onclick="customerView.loadVmDetails('${host.hostname}')">
                            <i class="fas fa-eye"></i> View Details
                        </small>
                    </div>
                    <div id="vm-list-${host.hostname}" class="vm-details-placeholder">
                        <small class="text-muted">Click "View Details" to load VM list</small>
                    </div>
                </div>
            `;
        }
        
        return `
            <div class="customer-device-card ${isAvailable ? 'available' : 'in-use'}" 
                 data-hostname="${host.hostname}"
                 onclick="customerView.selectDevice('${host.hostname}')">
                <div class="customer-device-header">
                    <div class="customer-device-name">${host.hostname}</div>
                    <div class="${badgeClass}">${usedGpus}/${totalGpus}</div>
                </div>
                ${vmListHtml}
            </div>
        `;
    }

    /**
     * Load VM details for a specific host
     */
    async loadVmDetails(hostname) {
        const vmContainer = document.getElementById(`vm-list-${hostname}`);
        if (!vmContainer) return;
        
        try {
            console.log(`🔍 Loading VM details for host: ${hostname}`);
            vmContainer.innerHTML = '<small class="text-muted">Loading VMs...</small>';
            
            const response = await fetch(`/api/host-vms/${hostname}`);
            const data = await response.json();
            
            if (data.vms && data.vms.length > 0) {
                let vmListHtml = '';
                data.vms.forEach(vm => {
                    vmListHtml += `
                        <div class="customer-vm-item">
                            <span class="customer-vm-name">${vm.name}</span>
                            <span class="customer-vm-flavor">${vm.flavor}</span>
                        </div>
                    `;
                });
                vmContainer.innerHTML = vmListHtml;
            } else {
                vmContainer.innerHTML = '<small class="text-muted">No VMs found</small>';
            }
        } catch (error) {
            console.error('❌ Error loading VM details:', error);
            vmContainer.innerHTML = '<small class="text-danger">Error loading VMs</small>';
        }
    }

    /**
     * Handle device card selection
     */
    selectDevice(hostname) {
        // Remove previous selection
        document.querySelectorAll('.customer-device-card.selected').forEach(card => {
            card.classList.remove('selected');
        });
        
        // Add selection to clicked card
        const clickedCard = document.querySelector(`[data-hostname="${hostname}"]`);
        if (clickedCard) {
            clickedCard.classList.add('selected');
            this.selectedDevice = hostname;
            console.log(`📋 Selected device: ${hostname}`);
        }
    }

    /**
     * Set up event handlers for device cards
     */
    setupDeviceCardHandlers() {
        // Event delegation is handled in the card HTML via onclick attributes
        console.log('📋 Device card handlers set up');
    }

    /**
     * Clear customer view content
     */
    clearCustomerView() {
        const contentContainer = document.getElementById('customerViewContent');
        if (contentContainer) {
            contentContainer.innerHTML = `
                <div class="text-center text-muted py-5">
                    <i class="fas fa-file-contract fa-3x mb-3"></i>
                    <h5>Select a contract to view devices</h5>
                </div>
            `;
        }
        this.currentContractData = null;
        this.selectedDevice = null;
    }

    /**
     * Toggle customer view visibility
     */
    toggle() {
        const container = document.getElementById('customerViewContainer');
        const columnsContainer = document.querySelector('.hosts-row');
        const toggleBtn = document.getElementById('customerViewToggleBtn');
        
        if (!container) return;
        
        this.isActive = !this.isActive;
        
        if (this.isActive) {
            // Show customer view
            container.style.display = 'block';
            if (columnsContainer) columnsContainer.style.display = 'none';
            if (toggleBtn) {
                toggleBtn.innerHTML = '<i class="fas fa-compress"></i>';
                toggleBtn.title = 'Close Customer View';
            }
            
            // Sync with current selections if available
            if (window.currentGpuType && !this.currentGpuType) {
                const gpuSelect = document.getElementById('customerViewGpuSelect');
                if (gpuSelect) {
                    gpuSelect.value = window.currentGpuType;
                    this.onGpuTypeChange(window.currentGpuType);
                }
            }
            
            console.log('👁️ Customer view activated');
        } else {
            // Hide customer view
            container.style.display = 'none';
            if (columnsContainer) columnsContainer.style.display = 'block';
            if (toggleBtn) {
                toggleBtn.innerHTML = '<i class="fas fa-expand"></i>';
                toggleBtn.title = 'Toggle Customer View';
            }
            
            console.log('👁️ Customer view deactivated');
        }
    }
}

// Create global instance
const customerView = new CustomerView();

// Global toggle function for HTML onclick
function toggleCustomerView() {
    customerView.toggle();
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    customerView.initialize();
});

// Make available globally
window.customerView = customerView;
window.toggleCustomerView = toggleCustomerView;

console.log('✅ Customer View module loaded');