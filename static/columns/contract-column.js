/**
 * ContractColumn - Optimized contract display with modern performance features
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
     * Update contract column with optimized rendering and caching
     */
    update(allData) {
        
        // Unified data structure parser - handles all formats efficiently
        const { contracts, contractHosts } = this.parseContractData(allData);
        
        if (contracts.length === 0) {
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
            const contractHostsForThisContract = contractHosts.filter(host => 
                host.aggregate === contract.aggregate
            );
            
            if (contractHostsForThisContract.length > 0) {
                // Calculate GPU stats for this contract
                let contractGpuUsed = 0;
                let contractGpuCapacity = 0;
                
                contractHostsForThisContract.forEach(host => {
                    const gpuInfo = host.gpu_info || {};
                    contractGpuUsed += gpuInfo.gpu_used || 0;
                    contractGpuCapacity += gpuInfo.gpu_capacity || 8;
                });
                
                contractsWithHosts.push({
                    ...contract,
                    hosts: contractHostsForThisContract,
                    hostCount: contractHostsForThisContract.length,
                    gpuUsed: contractGpuUsed,
                    gpuCapacity: contractGpuCapacity
                });
                
                totalHosts += contractHostsForThisContract.length;
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
        
        // Work with existing UI controls instead of hiding them
        this.populateContractSelector(contractsWithHosts);
        this.setupHideEmptyCheckbox();
        
        // Render all contracts with nested groups
        this.renderAllContracts(contractsWithHosts);
        
        // Apply current filter settings using cached elements
        const contractSelect = this.getCachedElement('contractSelect', 'contractColumnSelect');
        const hideEmptyCheckbox = this.getCachedElement('hideEmptyCheckbox', 'hideEmptyContracts');
        if (contractSelect?.value) {
            this.selectContract(contractSelect.value);
        }
        if (hideEmptyCheckbox?.checked) {
            this.toggleEmptyContracts(true);
        }
    }

    /**
     * Render empty state when no contracts are found
     */
    renderEmptyContracts() {
        this.updateCount(0);
        this.updateName('No Contracts');
        this.updateGpuStats(null);
        
        // Clear the dropdown
        const contractSelect = this.getCachedElement('contractSelect', 'contractColumnSelect');
        if (contractSelect) {
            contractSelect.innerHTML = '<option value="">No contracts available</option>';
        }
        
        const container = this.getCachedElement('container', this.hostsContainerId);
        if (container) {
            container.innerHTML = '<div class="text-muted text-center p-3">No contracts available for this GPU type</div>';
        }
        
        // Show the empty state element instead of hiding it
        const contractEmptyState = this.getCachedElement('contractEmptyState', 'contractEmptyState');
        if (contractEmptyState) {
            contractEmptyState.style.display = '';
        }
    }

    /**
     * Populate the contract selector dropdown with available contracts
     */
    populateContractSelector(contracts) {
        const contractSelect = this.getCachedElement('contractSelect', 'contractColumnSelect');
        if (!contractSelect) return;
        
        // Preserve current selection
        const currentSelection = contractSelect.value;
        
        // Clear and rebuild options
        contractSelect.innerHTML = '<option value="">Show All Contracts</option>';
        
        contracts.forEach(contract => {
            const option = document.createElement('option');
            option.value = contract.aggregate;
            option.textContent = contract.name || contract.aggregate;
            contractSelect.appendChild(option);
        });
        
        // Restore selection if it still exists
        if (currentSelection && Array.from(contractSelect.options).some(opt => opt.value === currentSelection)) {
            contractSelect.value = currentSelection;
        }
        
        // Set up change handler if not already set
        if (!contractSelect.dataset.handlerSet) {
            contractSelect.addEventListener('change', (e) => {
                this.selectContract(e.target.value);
            });
            contractSelect.dataset.handlerSet = 'true';
        }
    }
    
    /**
     * Set up the hide empty contracts checkbox
     */
    setupHideEmptyCheckbox() {
        const hideEmptyCheckbox = this.getCachedElement('hideEmptyCheckbox', 'hideEmptyContracts');
        if (!hideEmptyCheckbox) return;
        
        // Set up change handler if not already set
        if (!hideEmptyCheckbox.dataset.handlerSet) {
            hideEmptyCheckbox.addEventListener('change', (e) => {
                this.toggleEmptyContracts(e.target.checked);
            });
            hideEmptyCheckbox.dataset.handlerSet = 'true';
        }
    }

    /**
     * Render all contracts with nested Available/In Use groups
     */
    renderAllContracts(contracts) {
        const container = this.getCachedElement('container', this.hostsContainerId);
        if (!container) return;
        
        if (contracts.length === 0) {
            container.innerHTML = '<div class="text-muted text-center p-3">No contracts with hosts available</div>';
            return;
        }
        
        let html = '';
        
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
     * Render individual host list using existing createHostCard function
     */
    renderHostList(hosts, aggregateType) {
        if (window.Frontend && window.Frontend.createHostCard) {
            return hosts.map(host => window.Frontend.createHostCard(host, aggregateType)).join('');
        } else {
            console.error('❌ Frontend.createHostCard not available - cannot render hosts');
            return '<div class="text-danger p-3">Error: Host rendering unavailable</div>';
        }
    }

    /**
     * Select specific contract (for dropdown)
     */
    selectContract(contractAggregate) {
        const contractGroups = document.querySelectorAll('.contract-group');
        if (contractAggregate === '' || contractAggregate === '__ALL__') {
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
    
    /**
     * Toggle empty contracts visibility
     */
    toggleEmptyContracts(hideEmpty) {
        const contractGroups = document.querySelectorAll('.contract-group');
        contractGroups.forEach(group => {
            const hostCount = parseInt(group.querySelector('.text-muted')?.textContent?.match(/(\d+) hosts/)?.[1] || '0');
            if (hideEmpty && hostCount === 0) {
                group.style.display = 'none';
            } else {
                // Only show if not filtered out by contract selector
                const contractSelect = this.getCachedElement('contractSelect', 'contractColumnSelect');
                const selectedContract = contractSelect?.value;
                if (!selectedContract || selectedContract === '' || selectedContract === '__ALL__' || group.dataset.contract === selectedContract) {
                    group.style.display = '';
                }
            }
        });
    }
}

    /**
     * Unified data structure parser - consolidates 3 different parsers into one
     * Handles parallel agents, individual GPU type, and contract aggregates API formats
     */
    parseContractData(allData) {
        const currentGpuType = window.currentGpuType;
        
        // Try parallel agents format first (most common)
        if (currentGpuType && allData[currentGpuType]) {
            const gpuData = allData[currentGpuType];
            return {
                contracts: gpuData.config?.contracts || [],
                contractHosts: gpuData.hosts || []
            };
        }
        
        // Handle direct contracts array formats (both individual and API)
        if (allData.contracts && Array.isArray(allData.contracts)) {
            const contracts = allData.contracts;
            // Extract hosts efficiently using flatMap
            const contractHosts = contracts.flatMap(contract => contract.hosts || []);
            return { contracts, contractHosts };
        }
        
        // No valid format found
        return { contracts: [], contractHosts: [] };
    }
}

// Export for use by main script
window.ContractColumn = ContractColumn;