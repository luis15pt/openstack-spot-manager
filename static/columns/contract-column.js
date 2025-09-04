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
     * Update contract column - same pattern as RunpodColumn
     */
    update(data) {
        console.log('🔄 ContractColumn.update() called with data keys:', data ? Object.keys(data) : 'none');
        
        // Check if contracts data exists (same pattern as runpod/spot)
        if (!data || !data.contracts) {
            console.log('❌ No contracts data available');
            this.renderEmptyContracts();
            return;
        }
        
        // Same pattern as RunpodColumn: data.hosts and data.gpu_summary
        const contractHosts = data.contracts.hosts || [];
        
        console.log(`🔄 Updating Contract column with ${contractHosts.length} hosts`);
        
        // Update count (same as RunpodColumn)
        this.updateCount(contractHosts.length);
        
        // Update GPU statistics (same as RunpodColumn)
        this.updateGpuStats(data.contracts.gpu_summary);
        
        // Render hosts (same as RunpodColumn)
        this.renderHosts(contractHosts, data.contracts.name || 'Contracts');
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