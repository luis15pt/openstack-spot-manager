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
     * Update contract column with filterable contract list
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
        
        // Show contract list view by default
        this.renderContractList();
    }
    
    /**
     * Render the filterable contract list
     */
    renderContractList() {
        const container = this.getCachedElement('container', this.hostsContainerId);
        if (!container || !this.contractData) return;
        
        const { allHosts, contractsList } = this.contractData;
        
        if (contractsList.length === 0) {
            container.innerHTML = '<div class="text-muted text-center p-3">No contracts available for this GPU type</div>';
            return;
        }
        
        // Group hosts by contract aggregate
        const contractHostsMap = {};
        allHosts.forEach(host => {
            const contractName = host.aggregate;
            if (!contractHostsMap[contractName]) {
                contractHostsMap[contractName] = [];
            }
            contractHostsMap[contractName].push(host);
        });
        
        // Render contract list with host counts
        let contractListHtml = `
            <div class="contract-filter-controls mb-3">
                <button class="btn btn-sm btn-outline-primary me-2" onclick="window.columns.contract.renderContractList()">
                    <i class="fas fa-list me-1"></i>Show All Contracts
                </button>
                <small class="text-muted">Click a contract to view its hosts</small>
            </div>
            <div class="contract-list">`;
        
        contractsList.forEach(contract => {
            const contractHosts = contractHostsMap[contract.aggregate] || [];
            const hostCount = contractHosts.length;
            const isEmpty = hostCount === 0;
            
            // Calculate GPU usage for this contract
            let totalUsed = 0, totalCapacity = 0;
            contractHosts.forEach(host => {
                if (host.gpu_info) {
                    totalUsed += host.gpu_info.gpu_used || 0;
                    totalCapacity += host.gpu_info.gpu_capacity || 0;
                }
            });
            
            const usagePercent = totalCapacity > 0 ? Math.round((totalUsed / totalCapacity) * 100) : 0;
            
            contractListHtml += `
                <div class="contract-item card mb-2 ${isEmpty ? 'border-secondary opacity-50' : 'border-primary'}" 
                     style="cursor: ${isEmpty ? 'default' : 'pointer'}" 
                     ${!isEmpty ? `onclick="window.columns.contract.showContractHosts('${contract.aggregate}')"` : ''}>
                    <div class="card-body p-2">
                        <div class="d-flex justify-content-between align-items-center">
                            <div>
                                <h6 class="mb-1 text-truncate" title="${contract.name}">${contract.name}</h6>
                                <small class="text-muted">${contract.aggregate}</small>
                            </div>
                            <div class="text-end">
                                <span class="badge ${isEmpty ? 'bg-secondary' : 'bg-primary'} me-1">${hostCount} hosts</span>
                                ${!isEmpty ? `<small class="text-muted d-block">${totalUsed}/${totalCapacity} GPUs (${usagePercent}%)</small>` : ''}
                            </div>
                        </div>
                    </div>
                </div>`;
        });
        
        contractListHtml += '</div>';
        container.innerHTML = contractListHtml;
    }
    
    /**
     * Show hosts for a specific contract
     */
    showContractHosts(contractAggregate) {
        if (!this.contractData) return;
        
        const { allHosts } = this.contractData;
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
        
        // Find contract name
        const contract = this.contractData.contractsList.find(c => c.aggregate === contractAggregate);
        const contractName = contract ? contract.name : contractAggregate;
        
        // Render hosts using the base column method
        this.renderHosts(contractHosts, contractName);
        
        // Add back button
        const container = this.getCachedElement('container', this.hostsContainerId);
        if (container) {
            const backButton = `
                <div class="contract-filter-controls mb-3">
                    <button class="btn btn-sm btn-outline-secondary" onclick="window.columns.contract.renderContractList()">
                        <i class="fas fa-arrow-left me-1"></i>Back to Contract List
                    </button>
                    <span class="ms-2 text-muted">Showing: ${contractName}</span>
                </div>`;
            container.innerHTML = backButton + container.innerHTML;
        }
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