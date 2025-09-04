/**
 * ContractColumn - Simplified to work like RunpodColumn
 */
class ContractColumn extends BaseColumn {
    constructor() {
        super({
            id: 'contract',
            name: 'Contract',
            icon: 'fa-file-contract',
            color: 'bg-success',
            countElementId: 'contractHostCount',
            gpuUsageElementId: 'contractGpuUsage',
            gpuPercentElementId: 'contractGpuPercent',
            gpuProgressBarElementId: 'contractGpuProgressBar',
            hostsContainerId: 'contractHostsList',
            nameElementId: 'contractName'
        });
        
        // Cache frequently accessed DOM elements
        this._cachedElements = {
            contractSelect: null,
            hideEmptyCheckbox: null,
            container: null,
            contractEmptyState: null
        };
    }
    
    /**
     * Get cached DOM element or query and cache it
     */
    getCachedElement(key, id) {
        if (!this._cachedElements[key]) {
            this._cachedElements[key] = document.getElementById(id);
        }
        return this._cachedElements[key];
    }

    /**
     * Update contract column with filterable dropdown
     */
    update(data) {
        console.log('🔄 ContractColumn.update() called with data keys:', data ? Object.keys(data) : 'none');
        
        // Check if contracts data exists
        if (!data || !data.contracts) {
            console.log('❌ No contracts data available');
            this.renderEmptyContracts();
            return;
        }
        
        const contractHosts = data.contracts.hosts || [];
        const contractsList = data.contracts.contracts_list || [];
        
        console.log(`🔄 Updating Contract column with ${contractHosts.length} total hosts across ${contractsList.length} contracts`);
        
        // Store data for filtering
        this.contractData = {
            allHosts: contractHosts,
            contractsList: contractsList,
            gpuSummary: data.contracts.gpu_summary
        };
        
        // Update count and GPU stats for all contracts
        this.updateCount(contractHosts.length);
        this.updateGpuStats(data.contracts.gpu_summary);
        
        // Populate the dropdown with contracts
        this.populateContractDropdown();
        
        // Show all contract hosts by default
        this.showAllContracts();
        
        // Set up dropdown change listener
        this.setupDropdownListener();
    }
    
    /**
     * Populate the contract dropdown with available contracts
     */
    populateContractDropdown() {
        const dropdown = document.getElementById('contractColumnSelect');
        if (!dropdown || !this.contractData) return;
        
        const { allHosts, contractsList } = this.contractData;
        
        // Group hosts by contract aggregate to get counts
        const contractHostsMap = {};
        allHosts.forEach(host => {
            const contractAggregate = host.aggregate;
            if (!contractHostsMap[contractAggregate]) {
                contractHostsMap[contractAggregate] = [];
            }
            contractHostsMap[contractAggregate].push(host);
        });
        
        // Clear existing options except the first "Show All Contracts"
        dropdown.innerHTML = '<option value="">Show All Contracts</option>';
        
        // Add contract options with host counts
        contractsList.forEach(contract => {
            const contractHosts = contractHostsMap[contract.aggregate] || [];
            const hostCount = contractHosts.length;
            const hideEmpty = document.getElementById('hideEmptyContracts')?.checked || false;
            
            // Skip empty contracts if hide empty is checked
            if (hideEmpty && hostCount === 0) return;
            
            const option = document.createElement('option');
            option.value = contract.aggregate;
            option.textContent = `${contract.name} (${hostCount} hosts)`;
            dropdown.appendChild(option);
        });
        
        console.log(`📋 Populated contract dropdown with ${dropdown.options.length - 1} contracts`);
    }
    
    /**
     * Set up dropdown change listener
     */
    setupDropdownListener() {
        const dropdown = document.getElementById('contractColumnSelect');
        if (!dropdown) return;
        
        // Remove existing listener to prevent duplicates
        dropdown.removeEventListener('change', this.handleDropdownChange);
        
        // Bind the method to maintain 'this' context
        this.handleDropdownChange = this.handleDropdownChange.bind(this);
        dropdown.addEventListener('change', this.handleDropdownChange);
    }
    
    /**
     * Handle dropdown selection changes
     */
    handleDropdownChange(event) {
        const selectedAggregate = event.target.value;
        
        if (!selectedAggregate) {
            // Show all contracts
            this.showAllContracts();
        } else {
            // Show specific contract
            this.showSpecificContract(selectedAggregate);
        }
    }
    
    /**
     * Show all contract hosts
     */
    showAllContracts() {
        if (!this.contractData) return;
        
        const { allHosts, gpuSummary } = this.contractData;
        
        console.log(`🔄 Showing all ${allHosts.length} contract hosts`);
        
        // Update count and GPU stats for all contracts
        this.updateCount(allHosts.length);
        this.updateGpuStats(gpuSummary);
        this.updateName('Contracts');
        
        // Render all contract hosts
        this.renderHosts(allHosts, 'All Contracts');
    }
    
    /**
     * Show hosts for a specific contract
     */
    showSpecificContract(contractAggregate) {
        if (!this.contractData) return;
        
        const { allHosts, contractsList } = this.contractData;
        const contractHosts = allHosts.filter(host => host.aggregate === contractAggregate);
        
        console.log(`🔍 Showing ${contractHosts.length} hosts for contract: ${contractAggregate}`);
        
        // Update count for this contract
        this.updateCount(contractHosts.length);
        
        // Calculate GPU stats for this contract only
        let totalUsed = 0, totalCapacity = 0;
        contractHosts.forEach(host => {
            if (host.gpu_info) {
                totalUsed += host.gpu_info.gpu_used || 0;
                totalCapacity += host.gpu_info.gpu_capacity || 0;
            }
        });
        
        const contractGpuSummary = {
            total_gpu_used: totalUsed,
            total_gpu_capacity: totalCapacity,
            gpu_usage_ratio: `${totalUsed}/${totalCapacity}`
        };
        
        this.updateGpuStats(contractGpuSummary);
        
        // Find contract name and update column header
        const contract = contractsList.find(c => c.aggregate === contractAggregate);
        const contractName = contract ? contract.name : contractAggregate;
        this.updateName(contractName);
        
        // Render hosts for this specific contract
        this.renderHosts(contractHosts, contractName);
    }

    /**
     * Render empty state when no contracts are found
     */
    renderEmptyContracts() {
        this.updateCount(0);
        this.updateName('No Contracts');
        this.updateGpuStats(null);
        
        const container = this.getCachedElement('container', this.hostsContainerId);
        if (container) {
            container.innerHTML = '<div class="text-muted text-center p-3">No contracts available for this GPU type</div>';
        }
    }
}

// Export for use by main script
window.ContractColumn = ContractColumn;