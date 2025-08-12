/**
 * ContractColumn - Exact migration of updateContractColumn function
 * 
 * CRITICAL: This must preserve identical behavior to the original updateContractColumn function (lines 2068-2090)
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
    }

    /**
     * Update contract column - EXACT same logic as original updateContractColumn(data)
     * Original function: lines 2068-2090 in script.js
     */
    update(data) {
        // Original: console.log(`🔄 Updating Contract column with ${data.hosts.length} hosts`);
        this.logUpdate(data.hosts.length);
        
        // Original: document.getElementById('contractHostCount').textContent = data.hosts.length;
        this.updateCount(data.hosts.length);
        
        // Original: Update contract name (CRITICAL - contracts have dynamic names)
        // const contractName = document.getElementById('contractName');
        // if (contractName) {
        //     contractName.textContent = data.name || '';
        // }
        this.updateName(data.name);
        
        // Original: GPU statistics update with exact same logic
        this.updateGpuStats(data.gpu_summary);
        
        // Original: window.Frontend.renderHosts('contractHostsList', data.hosts, 'contract', data.name);
        this.renderHosts(data.hosts, data.name);
    }
}

// Export for use by main script
window.ContractColumn = ContractColumn;