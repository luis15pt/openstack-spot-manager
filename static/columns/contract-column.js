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
     * Update contract column using cached aggregate data - contracts are just aggregates
     */
    update(allData) {
        // Contract aggregates are just regular aggregates - use same cached data structure
        const currentGpuType = window.currentGpuType;
        
        if (!currentGpuType || !allData || !allData[currentGpuType]) {
            this.renderEmptyContracts();
            return;
        }
        
        const gpuData = allData[currentGpuType];
        // The cached data structure has aggregates as top-level keys under gpuData
        const aggregates = gpuData || {};
        
        console.log('🔍 ContractColumn DEBUG: allData structure:', allData);
        console.log('🔍 ContractColumn DEBUG: gpuData structure:', gpuData);
        console.log('🔍 ContractColumn DEBUG: aggregates keys:', Object.keys(aggregates));
        
        // Find contract aggregates (those with "contract" in the name)
        const allContractEntries = Object.entries(aggregates).filter(([name, data]) => {
            return name.toLowerCase().includes('contract');
        });
        
        console.log('🔍 ContractColumn DEBUG: found contract entries:', allContractEntries.map(([name, data]) => ({
            name, 
            hasHosts: !!(data && data.hosts),
            hostCount: (data && data.hosts) ? data.hosts.length : 0,
            dataKeys: data ? Object.keys(data) : []
        })));
        
        // Always get all contract aggregates, filtering will be done by checkbox
        const contractAggregates = allContractEntries.filter(([name, data]) => {
            return data;  // Just require data to exist
        });
        
        if (contractAggregates.length === 0) {
            this.renderEmptyContracts();
            return;
        }
        
        // Calculate total stats
        let totalHosts = 0;
        let totalGpuUsed = 0;
        let totalGpuCapacity = 0;
        
        const contractsWithHosts = [];
        
        contractAggregates.forEach(([aggregateName, aggregateData]) => {
            const hosts = aggregateData.hosts || [];
            
            // Calculate GPU stats (will be 0 for empty contracts)
            let contractGpuUsed = 0;
            let contractGpuCapacity = 0;
            
            hosts.forEach(host => {
                contractGpuUsed += host.gpu_used || 0;
                contractGpuCapacity += host.gpu_capacity || 8;
            });
            
            // Add ALL contracts to the list, even those with 0 hosts
            contractsWithHosts.push({
                aggregate: aggregateName,
                name: aggregateName,
                hosts: hosts,
                hostCount: hosts.length,
                gpuUsed: contractGpuUsed,
                gpuCapacity: contractGpuCapacity
            });
            
            totalHosts += hosts.length;
            totalGpuUsed += contractGpuUsed;
            totalGpuCapacity += contractGpuCapacity;
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
        
        // Setup UI controls
        this.populateContractSelector(contractsWithHosts);
        this.setupHideEmptyCheckbox();
        
        // Render contracts
        this.renderAllContracts(contractsWithHosts);
        
        // Apply filters
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

// Export for use by main script
window.ContractColumn = ContractColumn;