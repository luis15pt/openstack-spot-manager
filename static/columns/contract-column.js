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
     * Update contract column to show ALL contracts with nested Available/In Use groups
     * Modified to display multiple contracts as collapsible groups
     */
    update(allData) {
        console.log('🔄 Updating Contract column with ALL contracts');
        
        // Get contract data from the organized data structure
        const currentGpuType = window.currentGpuType;
        if (!currentGpuType || !allData[currentGpuType]) {
            console.warn('⚠️ No GPU type selected or no data available');
            this.renderEmptyContracts();
            return;
        }
        
        const gpuData = allData[currentGpuType];
        const contracts = gpuData.config?.contracts || [];
        
        if (contracts.length === 0) {
            console.log('📋 No contracts found for GPU type:', currentGpuType);
            this.renderEmptyContracts();
            return;
        }
        
        // Calculate total hosts and GPU stats across all contracts
        let totalHosts = 0;
        let totalGpuUsed = 0;
        let totalGpuCapacity = 0;
        
        const contractsWithHosts = [];
        
        // Process each contract
        contracts.forEach(contract => {
            const contractHosts = gpuData.hosts.filter(host => 
                host.aggregate === contract.aggregate
            );
            
            if (contractHosts.length > 0) {
                // Calculate GPU stats for this contract
                let contractGpuUsed = 0;
                let contractGpuCapacity = 0;
                
                contractHosts.forEach(host => {
                    const gpuInfo = host.gpu_info || {};
                    contractGpuUsed += gpuInfo.gpu_used || 0;
                    contractGpuCapacity += gpuInfo.gpu_capacity || 8;
                });
                
                contractsWithHosts.push({
                    ...contract,
                    hosts: contractHosts,
                    hostCount: contractHosts.length,
                    gpuUsed: contractGpuUsed,
                    gpuCapacity: contractGpuCapacity
                });
                
                totalHosts += contractHosts.length;
                totalGpuUsed += contractGpuUsed;
                totalGpuCapacity += contractGpuCapacity;
            }
        });
        
        // Update header stats
        this.updateCount(totalHosts);
        this.updateName(`${contractsWithHosts.length} Contract${contractsWithHosts.length !== 1 ? 's' : ''}`);
        
        // Update total GPU stats
        const gpuSummary = {
            gpu_used: totalGpuUsed,
            gpu_capacity: totalGpuCapacity,
            gpu_usage_ratio: `${totalGpuUsed}/${totalGpuCapacity}`
        };
        this.updateGpuStats(gpuSummary);
        
        // Render all contracts with nested groups
        this.renderAllContracts(contractsWithHosts);
    }

    /**
     * Render empty state when no contracts are found
     */
    renderEmptyContracts() {
        this.updateCount(0);
        this.updateName('No Contracts');
        this.updateGpuStats(null);
        
        const container = document.getElementById(this.hostsContainerId);
        if (container) {
            container.innerHTML = '<div class="text-muted text-center p-3">No contracts available for this GPU type</div>';
        }
    }

    /**
     * Render all contracts with nested Available/In Use groups
     */
    renderAllContracts(contracts) {
        const container = document.getElementById(this.hostsContainerId);
        if (!container) {
            console.error('❌ Contract container not found');
            return;
        }
        
        if (contracts.length === 0) {
            container.innerHTML = '<div class="text-muted text-center p-3">No contracts with hosts available</div>';
            return;
        }
        
        let html = '';
        
        // Add contract selection dropdown if there are many contracts
        if (contracts.length > 3) {
            html += `
                <div class="mb-3">
                    <select class="form-select form-select-sm" id="contractSelector" onchange="window.contractColumn?.selectContract(this.value)">
                        <option value="">Show All Contracts (${contracts.length})</option>
                        ${contracts.map(contract => `
                            <option value="${contract.aggregate}">${contract.name || contract.aggregate} (${contract.hostCount} hosts)</option>
                        `).join('')}
                    </select>
                </div>
            `;
        }
        
        // Render each contract as a collapsible group
        contracts.forEach(contract => {
            const contractId = `contract-${contract.aggregate.replace(/[^a-zA-Z0-9]/g, '-')}`;
            const availableHosts = contract.hosts.filter(host => (host.vm_count || 0) === 0);
            const inUseHosts = contract.hosts.filter(host => (host.vm_count || 0) > 0);
            
            const gpuPercent = contract.gpuCapacity > 0 ? 
                Math.round((contract.gpuUsed / contract.gpuCapacity) * 100) : 0;
            
            html += `
                <div class="contract-group mb-3" data-contract="${contract.aggregate}">
                    <div class="host-group-header clickable" onclick="toggleGroup('${contractId}')">
                        <i class="fas fa-file-contract text-success"></i>
                        <div class="flex-grow-1">
                            <h6 class="mb-0">${contract.name || contract.aggregate}</h6>
                            <div class="d-flex align-items-center gap-2">
                                <small class="text-muted">${contract.hostCount} hosts</small>
                                <small class="text-muted">•</small>
                                <small class="text-muted">${contract.gpuUsed}/${contract.gpuCapacity} GPUs (${gpuPercent}%)</small>
                            </div>
                        </div>
                        <i class="fas fa-chevron-right toggle-icon" id="${contractId}-icon"></i>
                    </div>
                    <div class="host-group-content collapsed" id="${contractId}">
            `;
            
            // Available hosts subgroup
            if (availableHosts.length > 0) {
                const availableId = `${contractId}-available`;
                html += `
                    <div class="host-subgroup">
                        <div class="host-group-header clickable ms-3" onclick="toggleGroup('${availableId}')">
                            <i class="fas fa-circle-check text-success"></i>
                            <h6 class="mb-0">Available (${availableHosts.length})</h6>
                            <i class="fas fa-chevron-right toggle-icon" id="${availableId}-icon"></i>
                        </div>
                        <div class="host-group-content collapsed" id="${availableId}">
                            ${this.renderHostList(availableHosts, 'contract')}
                        </div>
                    </div>
                `;
            }
            
            // In Use hosts subgroup
            if (inUseHosts.length > 0) {
                const inUseId = `${contractId}-inuse`;
                html += `
                    <div class="host-subgroup">
                        <div class="host-group-header clickable ms-3" onclick="toggleGroup('${inUseId}')">
                            <i class="fas fa-exclamation-triangle text-warning"></i>
                            <h6 class="mb-0">In Use (${inUseHosts.length})</h6>
                            <i class="fas fa-chevron-right toggle-icon" id="${inUseId}-icon"></i>
                        </div>
                        <div class="host-group-content collapsed" id="${inUseId}">
                            ${this.renderHostList(inUseHosts, 'contract')}
                        </div>
                    </div>
                `;
            }
            
            html += `
                    </div>
                </div>
            `;
        });
        
        container.innerHTML = html;
    }

    /**
     * Render individual host list
     */
    renderHostList(hosts, aggregateType) {
        if (window.Frontend && window.Frontend.renderHostList) {
            return window.Frontend.renderHostList(hosts, aggregateType);
        } else {
            // Fallback rendering
            return hosts.map(host => `
                <div class="host-card" data-hostname="${host.hostname}">
                    <strong>${host.hostname}</strong>
                    <small class="text-muted d-block">VMs: ${host.vm_count || 0}</small>
                </div>
            `).join('');
        }
    }

    /**
     * Select specific contract (for dropdown)
     */
    selectContract(contractAggregate) {
        const contractGroups = document.querySelectorAll('.contract-group');
        if (contractAggregate === '') {
            // Show all contracts
            contractGroups.forEach(group => group.style.display = '');
        } else {
            // Show only selected contract
            contractGroups.forEach(group => {
                if (group.dataset.contract === contractAggregate) {
                    group.style.display = '';
                } else {
                    group.style.display = 'none';
                }
            });
        }
    }
}

// Export for use by main script
window.ContractColumn = ContractColumn;