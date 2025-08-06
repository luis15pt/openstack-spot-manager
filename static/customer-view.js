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
     * Render the customer view with devices grouped by GPU count in vertical columns
     */
    async renderCustomerView(contractData) {
        const contentContainer = document.getElementById('customerViewContent');
        if (!contentContainer) return;

        console.log('🎨 Rendering customer view for contract:', contractData.name);

        // Group hosts by available GPUs (total - used)
        const hostsByAvailableGpus = this.groupHostsByAvailableGpus(contractData.hosts);
        
        // Sort by available GPU count (8 -> 1, then available -> in use)
        const sortedGpuGroups = Object.keys(hostsByAvailableGpus)
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

        // Calculate column width based on number of groups (but ensure minimum width)
        const numGroups = sortedGpuGroups.length;
        const colClass = this.calculateColumnClass(numGroups);

        // Create vertical columns layout (Bootstrap-based)
        let groupsHtml = '<div class="row">';
        
        for (const availableGpus of sortedGpuGroups) {
            const hosts = hostsByAvailableGpus[availableGpus];
            const availableHosts = hosts.filter(h => !h.has_vms);
            const inUseHosts = hosts.filter(h => h.has_vms);
            
            // Create column header with available GPU count
            const headerText = `${availableGpus} Available GPU${availableGpus !== '1' ? 's' : ''}`;
            const totalCount = hosts.length;
            const availableCount = availableHosts.length;
            
            groupsHtml += `
                <div class="${colClass}">
                    <div class="customer-gpu-group">
                        <div class="customer-gpu-group-header">
                            <div>${headerText}</div>
                            <small>${availableCount}/${totalCount} Devices</small>
                        </div>
                        <div class="customer-gpu-group-content">
            `;
            
            // Render available devices first
            if (availableHosts.length > 0) {
                groupsHtml += `<div class="mb-2"><small class="text-success"><strong>Available (${availableHosts.length})</strong></small></div>`;
                for (const host of availableHosts) {
                    groupsHtml += await this.createCustomerDeviceCard(host, true);
                }
            }
            
            // Render in-use devices
            if (inUseHosts.length > 0) {
                groupsHtml += `<div class="mb-2 mt-3"><small class="text-warning"><strong>In Use (${inUseHosts.length})</strong></small></div>`;
                for (const host of inUseHosts) {
                    groupsHtml += await this.createCustomerDeviceCard(host, false);
                }
            }
            
            groupsHtml += `
                        </div>
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
     * Calculate appropriate Bootstrap column class based on number of groups
     */
    calculateColumnClass(numGroups) {
        if (numGroups <= 2) return 'col-md-6';
        if (numGroups <= 3) return 'col-md-4';
        if (numGroups <= 4) return 'col-md-3';
        if (numGroups <= 6) return 'col-md-2';
        return 'col-md-1'; // For more than 6 groups
    }

    /**
     * Group hosts by their available GPU count (total - used)
     */
    groupHostsByAvailableGpus(hosts) {
        const grouped = {};
        
        hosts.forEach(host => {
            const gpuInfo = host.gpu_info || {};
            const totalGpus = gpuInfo.gpu_capacity || 8; // Default to 8 GPUs
            const usedGpus = gpuInfo.gpu_used || 0;
            const availableGpus = totalGpus - usedGpus;
            
            if (!grouped[availableGpus]) {
                grouped[availableGpus] = [];
            }
            grouped[availableGpus].push(host);
        });
        
        return grouped;
    }

    /**
     * Create a device card for customer view (without owner/nexgen tags)
     */
    async createCustomerDeviceCard(host, isAvailable) {
        const gpuInfo = host.gpu_info || {};
        const totalGpus = gpuInfo.gpu_capacity || 8;
        const usedGpus = gpuInfo.gpu_used || 0;
        const availableGpus = totalGpus - usedGpus;
        const vmCount = host.vm_count || 0;
        
        // Determine GPU usage badge style
        let badgeClass = 'customer-device-gpu-badge';
        if (availableGpus === totalGpus) {
            badgeClass += ''; // Fully available - green (default)
        } else if (availableGpus > 0) {
            badgeClass += ' partial'; // Partially available - yellow
        } else {
            badgeClass += ' full'; // Fully used - red
        }
        
        // Auto-load VM details if there are VMs
        let vmListHtml = '';
        if (vmCount > 0) {
            const vmDetails = await this.getVmDetails(host.hostname);
            vmListHtml = `
                <div class="customer-device-vm-list">
                    <div class="mb-2">
                        <small class="text-muted"><strong>VMs (${vmCount})</strong></small>
                    </div>
                    <div id="vm-list-${host.hostname}">
                        ${vmDetails}
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
                    <div class="${badgeClass}">${availableGpus}/${totalGpus}</div>
                </div>
                ${vmListHtml}
            </div>
        `;
    }

    /**
     * Get VM details for a host (auto-loaded)
     */
    async getVmDetails(hostname) {
        try {
            const response = await fetch(`/api/host-vms/${hostname}`);
            const data = await response.json();
            
            if (data.vms && data.vms.length > 0) {
                return data.vms.map(vm => `
                    <div class="customer-vm-item">
                        <span class="customer-vm-name">${vm.name || vm.Name}</span>
                        <span class="customer-vm-flavor">${vm.flavor || vm.Flavor}</span>
                    </div>
                `).join('');
            } else {
                return '<small class="text-muted">No VMs found</small>';
            }
        } catch (error) {
            console.error(`❌ Error loading VM details for ${hostname}:`, error);
            return '<small class="text-danger">Error loading VMs</small>';
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
    async toggle() {
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
            
            // Use current contract data from main application
            await this.loadCurrentContractData();
            
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

    /**
     * Load current contract data from the main application
     */
    async loadCurrentContractData() {
        // Get current selections from main contract column
        const contractSelect = document.getElementById('contractColumnSelect');
        const contractName = document.getElementById('contractName');
        
        if (!contractSelect || !contractSelect.value) {
            this.showSelectContractMessage();
            return;
        }

        const selectedContractAggregate = contractSelect.value;
        const displayedContractName = contractName ? contractName.textContent : '';
        
        console.log(`🔄 Loading current contract data: ${selectedContractAggregate}`);
        
        try {
            // Load the contract data from API using current GPU type
            const currentGpuType = window.currentGpuType;
            if (!currentGpuType) {
                this.showSelectGpuMessage();
                return;
            }

            const response = await fetch(`/api/contract-aggregates/${currentGpuType}`);
            const data = await response.json();
            
            if (data.contracts) {
                const selectedContract = data.contracts.find(c => c.aggregate === selectedContractAggregate);
                if (selectedContract) {
                    this.currentContractData = selectedContract;
                    this.currentGpuType = currentGpuType;
                    
                    // Update customer view displays
                    const contractNameElement = document.getElementById('customerViewContractName');
                    if (contractNameElement) {
                        contractNameElement.textContent = selectedContract.name;
                    }
                    
                    // Selection controls are already minimal - just show close button
                    
                    // Render the customer view
                    await this.renderCustomerView(selectedContract);
                } else {
                    this.showContractNotFoundMessage();
                }
            }
        } catch (error) {
            console.error('❌ Error loading current contract data:', error);
            this.showErrorMessage();
        }
    }

    /**
     * Show message when no contract is selected
     */
    showSelectContractMessage() {
        const contentContainer = document.getElementById('customerViewContent');
        if (contentContainer) {
            contentContainer.innerHTML = `
                <div class="customer-empty-state">
                    <i class="fas fa-file-contract fa-3x mb-3"></i>
                    <h5>No Contract Selected</h5>
                    <p>Please select a contract in the main view first, then click the expand button.</p>
                </div>
            `;
        }
    }

    /**
     * Show message when no GPU type is selected
     */
    showSelectGpuMessage() {
        const contentContainer = document.getElementById('customerViewContent');
        if (contentContainer) {
            contentContainer.innerHTML = `
                <div class="customer-empty-state">
                    <i class="fas fa-microchip fa-3x mb-3"></i>
                    <h5>No GPU Type Selected</h5>
                    <p>Please select a GPU type in the main view first.</p>
                </div>
            `;
        }
    }

    /**
     * Show error messages
     */
    showContractNotFoundMessage() {
        const contentContainer = document.getElementById('customerViewContent');
        if (contentContainer) {
            contentContainer.innerHTML = `
                <div class="customer-empty-state">
                    <i class="fas fa-exclamation-triangle fa-3x mb-3"></i>
                    <h5>Contract Not Found</h5>
                    <p>The selected contract could not be found.</p>
                </div>
            `;
        }
    }

    showErrorMessage() {
        const contentContainer = document.getElementById('customerViewContent');
        if (contentContainer) {
            contentContainer.innerHTML = `
                <div class="customer-empty-state">
                    <i class="fas fa-exclamation-circle fa-3x mb-3"></i>
                    <h5>Error Loading Data</h5>
                    <p>There was an error loading the contract data. Please try again.</p>
                </div>
            `;
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