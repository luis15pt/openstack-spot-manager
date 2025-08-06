/**
 * Customer View functionality for OpenStack Spot Manager
 * Provides a customer-focused view of contract devices organized by GPU count
 */

class CustomerView {
    constructor() {
        this.isActive = false;
        this.selectedDevice = null;
        this.currentGpuType = null;
        this.availableContracts = [];
        this.selectedContracts = []; // Array of selected contract data (max 2)
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
        // Prevent dropdown from closing when clicking on checkboxes
        const dropdownMenu = document.getElementById('contractMultiSelectMenu');
        if (dropdownMenu) {
            dropdownMenu.addEventListener('click', (e) => {
                // Don't close dropdown when clicking inside
                e.stopPropagation();
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
     * Populate contract multi-select dropdown with checkboxes
     */
    populateContractSelect() {
        const dropdownMenu = document.getElementById('contractMultiSelectMenu');
        if (!dropdownMenu) return;

        dropdownMenu.innerHTML = '';
        
        if (this.availableContracts.length === 0) {
            dropdownMenu.innerHTML = '<li><span class="dropdown-item-text text-muted">No contracts available</span></li>';
            return;
        }

        // Add contracts as checkbox items
        this.availableContracts.forEach(contract => {
            const listItem = document.createElement('li');
            listItem.innerHTML = `
                <div class="form-check dropdown-item">
                    <input class="form-check-input" type="checkbox" value="${contract.aggregate}" id="contract_${contract.aggregate}" onchange="customerView.onContractCheckChange('${contract.aggregate}')">
                    <label class="form-check-label w-100" for="contract_${contract.aggregate}">
                        ${contract.name} <small class="text-muted">(${contract.host_count} hosts)</small>
                    </label>
                </div>
            `;
            dropdownMenu.appendChild(listItem);
        });

        // Add clear all option
        const clearItem = document.createElement('li');
        clearItem.innerHTML = '<hr class="dropdown-divider">';
        dropdownMenu.appendChild(clearItem);

        const clearAllItem = document.createElement('li');
        clearAllItem.innerHTML = `
            <button class="dropdown-item text-danger" onclick="customerView.clearAllContracts()">
                <i class="fas fa-times"></i> Clear All
            </button>
        `;
        dropdownMenu.appendChild(clearAllItem);
    }

    /**
     * Handle contract checkbox change
     */
    onContractCheckChange(contractAggregate) {
        const checkbox = document.getElementById(`contract_${contractAggregate}`);
        if (!checkbox) return;

        if (checkbox.checked) {
            // Check if we already have 2 contracts selected
            if (this.selectedContracts.length >= 2) {
                checkbox.checked = false;
                alert('You can select a maximum of 2 contracts.');
                return;
            }

            // Add contract to selected list
            const contract = this.availableContracts.find(c => c.aggregate === contractAggregate);
            if (contract) {
                this.selectedContracts.push(contract);
                console.log(`✅ Added contract: ${contract.name}`);
            }
        } else {
            // Remove contract from selected list
            this.selectedContracts = this.selectedContracts.filter(c => c.aggregate !== contractAggregate);
            console.log(`❌ Removed contract: ${contractAggregate}`);
        }

        // Update UI and render view
        this.updateSelectedContractsDisplay();
        this.renderSelectedContracts();
    }

    /**
     * Clear all selected contracts
     */
    clearAllContracts() {
        // Uncheck all checkboxes
        this.availableContracts.forEach(contract => {
            const checkbox = document.getElementById(`contract_${contract.aggregate}`);
            if (checkbox) checkbox.checked = false;
        });

        // Clear selected contracts
        this.selectedContracts = [];
        this.updateSelectedContractsDisplay();
        this.renderSelectedContracts();
    }

    /**
     * Update the dropdown button text to show selected contracts
     */
    updateSelectedContractsDisplay() {
        const selectedText = document.getElementById('selectedContractsText');
        if (!selectedText) return;

        if (this.selectedContracts.length === 0) {
            selectedText.textContent = 'Select Contracts...';
        } else if (this.selectedContracts.length === 1) {
            selectedText.textContent = this.selectedContracts[0].name;
        } else {
            selectedText.textContent = `${this.selectedContracts[0].name} & ${this.selectedContracts[1].name}`;
        }
    }

    /**
     * Handle contract selection change
     */
    async onContractChange(contractAggregate) {
        if (!contractAggregate) {
            this.clearCustomerView();
            // Show overall statistics when no specific contract is selected
            await this.updateOverallStatistics();
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
     * Toggle between single and dual contract mode
     */
    toggleDualContractMode() {
        const dualModeCheckbox = document.getElementById('dualContractMode');
        const singleControls = document.getElementById('singleContractControls');
        const dualControls = document.getElementById('dualContractControls');
        const singleStats = document.getElementById('singleContractStats');
        const dualStats = document.getElementById('dualContractStats');
        const contractNameElement = document.getElementById('customerViewContractName');

        this.isDualMode = dualModeCheckbox ? dualModeCheckbox.checked : false;

        if (this.isDualMode) {
            // Switch to dual mode
            if (singleControls) singleControls.style.display = 'none';
            if (dualControls) dualControls.style.display = 'block';
            if (singleStats) singleStats.style.display = 'none';
            if (dualStats) dualStats.style.display = 'block';
            if (contractNameElement) contractNameElement.textContent = 'Comparison';

            console.log('🔄 Switched to dual contract mode');
            this.clearCustomerView();
        } else {
            // Switch to single mode
            if (singleControls) singleControls.style.display = 'block';
            if (dualControls) dualControls.style.display = 'none';
            if (singleStats) singleStats.style.display = 'block';
            if (dualStats) dualStats.style.display = 'none';

            console.log('🔄 Switched to single contract mode');
            this.clearCustomerView();
        }
    }

    /**
     * Handle contract 1 selection change (dual mode)
     */
    async onContract1Change(contractAggregate) {
        if (!contractAggregate) {
            this.contract1Data = null;
            this.renderDualContractView();
            return;
        }

        console.log(`🔄 Contract 1 changed to: ${contractAggregate}`);
        
        const selectedContract = this.availableContracts.find(c => c.aggregate === contractAggregate);
        if (selectedContract) {
            this.contract1Data = selectedContract;
            await this.renderDualContractView();
        }
    }

    /**
     * Handle contract 2 selection change (dual mode)
     */
    async onContract2Change(contractAggregate) {
        if (!contractAggregate) {
            this.contract2Data = null;
            this.renderDualContractView();
            return;
        }

        console.log(`🔄 Contract 2 changed to: ${contractAggregate}`);
        
        const selectedContract = this.availableContracts.find(c => c.aggregate === contractAggregate);
        if (selectedContract) {
            this.contract2Data = selectedContract;
            await this.renderDualContractView();
        }
    }

    /**
     * Render the dual contract comparison view
     */
    async renderDualContractView() {
        const contentContainer = document.getElementById('customerViewContent');
        if (!contentContainer) return;

        console.log('🎨 Rendering dual contract view');

        if (!this.contract1Data && !this.contract2Data) {
            contentContainer.innerHTML = `
                <div class="customer-empty-state">
                    <i class="fas fa-balance-scale fa-3x mb-3"></i>
                    <h5>Select Contracts to Compare</h5>
                    <p>Choose contracts from the dropdowns above to compare side-by-side.</p>
                </div>
            `;
            this.clearDualStatistics();
            return;
        }

        // Create side-by-side layout
        let dualHtml = '<div class="row">';
        
        // Contract 1 column
        dualHtml += '<div class="col-md-6">';
        if (this.contract1Data) {
            dualHtml += await this.renderSingleContractColumn(this.contract1Data, '1');
        } else {
            dualHtml += `
                <div class="customer-empty-state">
                    <i class="fas fa-file-contract fa-2x mb-3"></i>
                    <h6>Select Contract 1</h6>
                </div>
            `;
        }
        dualHtml += '</div>';
        
        // Contract 2 column
        dualHtml += '<div class="col-md-6 border-start">';
        if (this.contract2Data) {
            dualHtml += await this.renderSingleContractColumn(this.contract2Data, '2');
        } else {
            dualHtml += `
                <div class="customer-empty-state">
                    <i class="fas fa-file-contract fa-2x mb-3"></i>
                    <h6>Select Contract 2</h6>
                </div>
            `;
        }
        dualHtml += '</div>';
        
        dualHtml += '</div>';
        contentContainer.innerHTML = dualHtml;
        
        // Update dual statistics
        this.updateDualStatistics();
        
        console.log('✅ Dual contract view rendered successfully');
    }

    /**
     * Render a single contract column for dual view
     */
    async renderSingleContractColumn(contractData, contractNumber) {
        if (!contractData || !contractData.hosts) return '';

        // Group hosts by available GPUs
        const hostsByAvailableGpus = this.groupHostsByAvailableGpus(contractData.hosts);
        const sortedGpuGroups = Object.keys(hostsByAvailableGpus)
            .sort((a, b) => parseInt(b) - parseInt(a));

        if (sortedGpuGroups.length === 0) {
            return `
                <div class="customer-empty-state">
                    <i class="fas fa-server fa-2x mb-3"></i>
                    <h6>No devices found</h6>
                </div>
            `;
        }

        let columnHtml = `<div class="mb-3"><h6 class="text-muted">${contractData.name}</h6></div>`;
        
        for (const availableGpus of sortedGpuGroups) {
            const hosts = hostsByAvailableGpus[availableGpus];
            const availableHosts = hosts.filter(h => !h.has_vms);
            const inUseHosts = hosts.filter(h => h.has_vms);
            
            const headerText = `${availableGpus} Available GPU${availableGpus !== '1' ? 's' : ''}`;
            const totalCount = hosts.length;
            const availableCount = availableHosts.length;
            
            columnHtml += `
                <div class="customer-gpu-group mb-3">
                    <div class="customer-gpu-group-header" style="font-size: 0.9rem; padding: 8px 12px;">
                        <div>${headerText}</div>
                        <small>${availableCount}/${totalCount} Devices</small>
                    </div>
                    <div class="customer-gpu-group-content" style="max-height: 400px;">
            `;
            
            // Render available devices
            if (availableHosts.length > 0) {
                columnHtml += `<div class="mb-2"><small class="text-success"><strong>Available (${availableHosts.length})</strong></small></div>`;
                for (const host of availableHosts) {
                    columnHtml += await this.createCustomerDeviceCard(host, true, contractNumber);
                }
            }
            
            // Render in-use devices  
            if (inUseHosts.length > 0) {
                columnHtml += `<div class="mb-2 mt-3"><small class="text-warning"><strong>In Use (${inUseHosts.length})</strong></small></div>`;
                for (const host of inUseHosts) {
                    columnHtml += await this.createCustomerDeviceCard(host, false, contractNumber);
                }
            }
            
            columnHtml += `
                    </div>
                </div>
            `;
        }
        
        return columnHtml;
    }

    /**
     * Render the customer view with devices grouped by GPU count in vertical columns
     */
    async renderCustomerView(contractData) {
        const contentContainer = document.getElementById('customerViewContent');
        if (!contentContainer) return;

        console.log('🎨 Rendering customer view for contract:', contractData.name);

        // Show single contract stats, hide dual stats
        const singleStats = document.getElementById('singleContractStats');
        const dualStats = document.getElementById('dualContractStats');
        
        if (singleStats) singleStats.style.display = 'block';
        if (dualStats) dualStats.style.display = 'none';

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
        
        // Update contract statistics
        this.updateContractStatistics(contractData);
        
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
     * Update contract statistics display
     */
    updateContractStatistics(contractData) {
        if (!contractData || !contractData.hosts) return;

        // Calculate statistics from contract data
        let totalGpus = 0;
        let usedGpus = 0;
        let availableHosts = 0;
        let inUseHosts = 0;

        contractData.hosts.forEach(host => {
            const gpuInfo = host.gpu_info || {};
            const hostTotalGpus = gpuInfo.gpu_capacity || 8;
            const hostUsedGpus = gpuInfo.gpu_used || 0;
            const hasVms = (host.vm_count || 0) > 0;

            totalGpus += hostTotalGpus;
            usedGpus += hostUsedGpus;

            if (hasVms) {
                inUseHosts++;
            } else {
                availableHosts++;
            }
        });

        const gpuUsagePercent = totalGpus > 0 ? Math.round((usedGpus / totalGpus) * 100) : 0;

        // Update GPU usage display
        const gpuUsageElement = document.getElementById('customerViewGpuUsage');
        const gpuProgressBar = document.getElementById('customerViewGpuProgressBar');
        if (gpuUsageElement) {
            gpuUsageElement.textContent = `${usedGpus}/${totalGpus} GPUs (${gpuUsagePercent}%)`;
        }
        if (gpuProgressBar) {
            gpuProgressBar.style.width = `${gpuUsagePercent}%`;
        }

        // Update host counts
        const availableHostsElement = document.getElementById('customerViewAvailableHosts');
        const inUseHostsElement = document.getElementById('customerViewInUseHosts');
        if (availableHostsElement) {
            availableHostsElement.textContent = availableHosts.toString();
        }
        if (inUseHostsElement) {
            inUseHostsElement.textContent = inUseHosts.toString();
        }

        console.log(`📊 Contract statistics: ${usedGpus}/${totalGpus} GPUs (${gpuUsagePercent}%), ${availableHosts} available, ${inUseHosts} in use`);
    }

    /**
     * Update dual contract statistics display
     */
    updateDualStatistics() {
        // Update Contract 1 stats
        if (this.contract1Data) {
            this.updateSingleContractStats(this.contract1Data, '1');
            const nameElement = document.getElementById('contract1Name');
            if (nameElement) nameElement.textContent = this.contract1Data.name;
        } else {
            this.clearSingleContractStats('1');
        }

        // Update Contract 2 stats
        if (this.contract2Data) {
            this.updateSingleContractStats(this.contract2Data, '2');
            const nameElement = document.getElementById('contract2Name');
            if (nameElement) nameElement.textContent = this.contract2Data.name;
        } else {
            this.clearSingleContractStats('2');
        }
    }

    /**
     * Update statistics for a single contract in dual view
     */
    updateSingleContractStats(contractData, contractNumber) {
        if (!contractData || !contractData.hosts) return;

        let totalGpus = 0;
        let usedGpus = 0;
        let availableHosts = 0;
        let inUseHosts = 0;

        contractData.hosts.forEach(host => {
            const gpuInfo = host.gpu_info || {};
            const hostTotalGpus = gpuInfo.gpu_capacity || 8;
            const hostUsedGpus = gpuInfo.gpu_used || 0;
            const hasVms = (host.vm_count || 0) > 0;

            totalGpus += hostTotalGpus;
            usedGpus += hostUsedGpus;

            if (hasVms) {
                inUseHosts++;
            } else {
                availableHosts++;
            }
        });

        const gpuUsagePercent = totalGpus > 0 ? Math.round((usedGpus / totalGpus) * 100) : 0;

        // Update elements
        const elements = {
            [`contract${contractNumber}GpuUsage`]: `${usedGpus}/${totalGpus} GPUs (${gpuUsagePercent}%)`,
            [`contract${contractNumber}AvailableHosts`]: availableHosts.toString(),
            [`contract${contractNumber}InUseHosts`]: inUseHosts.toString()
        };

        Object.entries(elements).forEach(([id, text]) => {
            const element = document.getElementById(id);
            if (element) element.textContent = text;
        });

        const progressBar = document.getElementById(`contract${contractNumber}GpuProgressBar`);
        if (progressBar) progressBar.style.width = `${gpuUsagePercent}%`;

        console.log(`📊 Contract ${contractNumber} statistics: ${usedGpus}/${totalGpus} GPUs (${gpuUsagePercent}%), ${availableHosts} available, ${inUseHosts} in use`);
    }

    /**
     * Clear statistics for a single contract in dual view
     */
    clearSingleContractStats(contractNumber) {
        const elements = {
            [`contract${contractNumber}GpuUsage`]: '0/0 GPUs (0%)',
            [`contract${contractNumber}AvailableHosts`]: '0',
            [`contract${contractNumber}InUseHosts`]: '0'
        };

        Object.entries(elements).forEach(([id, text]) => {
            const element = document.getElementById(id);
            if (element) element.textContent = text;
        });

        const progressBar = document.getElementById(`contract${contractNumber}GpuProgressBar`);
        if (progressBar) progressBar.style.width = '0%';
    }

    /**
     * Clear dual contract statistics
     */
    clearDualStatistics() {
        this.clearSingleContractStats('1');
        this.clearSingleContractStats('2');
        
        const nameElements = ['contract1Name', 'contract2Name'];
        nameElements.forEach(id => {
            const element = document.getElementById(id);
            if (element) element.textContent = id === 'contract1Name' ? 'Contract 1' : 'Contract 2';
        });
    }

    /**
     * Update overall statistics (all contracts + base aggregates)
     */
    async updateOverallStatistics() {
        if (!this.currentGpuType) return;

        console.log('📊 Loading overall statistics for all contracts and base aggregates');

        try {
            console.log(`📊 Loading overall statistics for GPU type: ${this.currentGpuType}`);
            
            // Get base aggregate data (on-demand, runpod, spot)
            const baseAggregateResponse = await fetch(`/api/aggregates/${this.currentGpuType}`);
            const baseAggregateData = await baseAggregateResponse.json();
            console.log('📊 Base aggregate data:', baseAggregateData);

            // Get all contract data
            const contractResponse = await fetch(`/api/contract-aggregates/${this.currentGpuType}`);
            const contractData = await contractResponse.json();
            console.log('📊 Contract data:', contractData);

            // Calculate overall statistics
            let totalGpus = 0;
            let usedGpus = 0;
            let availableHosts = 0;
            let inUseHosts = 0;

            // Process base aggregate data (on-demand, runpod, spot)
            console.log('📊 Processing base aggregate data');
            if (baseAggregateData.ondemand && baseAggregateData.ondemand.hosts) {
                const stats = this.calculateHostStats(baseAggregateData.ondemand.hosts);
                totalGpus += stats.totalGpus;
                usedGpus += stats.usedGpus;
                availableHosts += stats.availableHosts;
                inUseHosts += stats.inUseHosts;
                console.log(`  └─ OnDemand: ${stats.totalGpus} total GPUs, ${stats.usedGpus} used GPUs`);
            }

            if (baseAggregateData.runpod && baseAggregateData.runpod.hosts) {
                const stats = this.calculateHostStats(baseAggregateData.runpod.hosts);
                totalGpus += stats.totalGpus;
                usedGpus += stats.usedGpus;
                availableHosts += stats.availableHosts;
                inUseHosts += stats.inUseHosts;
                console.log(`  └─ Runpod: ${stats.totalGpus} total GPUs, ${stats.usedGpus} used GPUs`);
            }

            if (baseAggregateData.spot && baseAggregateData.spot.hosts) {
                const stats = this.calculateHostStats(baseAggregateData.spot.hosts);
                totalGpus += stats.totalGpus;
                usedGpus += stats.usedGpus;
                availableHosts += stats.availableHosts;
                inUseHosts += stats.inUseHosts;
                console.log(`  └─ Spot: ${stats.totalGpus} total GPUs, ${stats.usedGpus} used GPUs`);
            }

            // Process all contract data
            if (contractData.contracts && contractData.contracts.length > 0) {
                console.log(`📊 Processing ${contractData.contracts.length} contracts for overall statistics`);
                
                // For overall statistics, we need to load each contract's detailed data
                for (const contract of contractData.contracts) {
                    console.log(`📋 Contract: ${contract.name} - ${contract.host_count} hosts`);
                    
                    // Skip contracts with no hosts
                    if (contract.host_count === 0) {
                        console.log(`  └─ Skipping ${contract.name} (0 hosts)`);
                        continue;
                    }
                    
                    // If the contract has hosts but no host details, we need to load them
                    if (contract.host_count > 0 && (!contract.hosts || contract.hosts.length === 0)) {
                        console.log(`  └─ Loading detailed data for ${contract.name}`);
                        try {
                            // The contract data in the list may not have full host details
                            // We need to get it from the same API but ensure we have host details
                            const detailedResponse = await fetch(`/api/contract-aggregates/${this.currentGpuType}`);
                            const detailedData = await detailedResponse.json();
                            const detailedContract = detailedData.contracts.find(c => c.aggregate === contract.aggregate);
                            
                            if (detailedContract && detailedContract.hosts && detailedContract.hosts.length > 0) {
                                const stats = this.calculateHostStats(detailedContract.hosts);
                                totalGpus += stats.totalGpus;
                                usedGpus += stats.usedGpus;
                                availableHosts += stats.availableHosts;
                                inUseHosts += stats.inUseHosts;
                                console.log(`  └─ Added ${stats.totalGpus} total GPUs, ${stats.usedGpus} used GPUs from detailed data`);
                            }
                        } catch (error) {
                            console.error(`  └─ Error loading detailed data for ${contract.name}:`, error);
                        }
                    } else if (contract.hosts && contract.hosts.length > 0) {
                        // Contract already has host details
                        const stats = this.calculateHostStats(contract.hosts);
                        totalGpus += stats.totalGpus;
                        usedGpus += stats.usedGpus;
                        availableHosts += stats.availableHosts;
                        inUseHosts += stats.inUseHosts;
                        console.log(`  └─ Added ${stats.totalGpus} total GPUs, ${stats.usedGpus} used GPUs from existing data`);
                    }
                }
            } else {
                console.log('📊 No contract data found');
            }

            // Update the display with overall statistics
            const gpuUsagePercent = totalGpus > 0 ? Math.round((usedGpus / totalGpus) * 100) : 0;
            
            console.log(`📊 FINAL TOTALS: ${usedGpus}/${totalGpus} GPUs (${gpuUsagePercent}%), ${availableHosts} available, ${inUseHosts} in use`);

            // Update single contract stats (used when not in dual mode)
            const gpuUsageElement = document.getElementById('customerViewGpuUsage');
            const gpuProgressBar = document.getElementById('customerViewGpuProgressBar');
            const availableHostsElement = document.getElementById('customerViewAvailableHosts');
            const inUseHostsElement = document.getElementById('customerViewInUseHosts');

            if (gpuUsageElement) {
                gpuUsageElement.textContent = `${usedGpus}/${totalGpus} GPUs (${gpuUsagePercent}%)`;
            }
            if (gpuProgressBar) {
                gpuProgressBar.style.width = `${gpuUsagePercent}%`;
            }
            if (availableHostsElement) {
                availableHostsElement.textContent = availableHosts.toString();
            }
            if (inUseHostsElement) {
                inUseHostsElement.textContent = inUseHosts.toString();
            }

            // Update contract name to show "Overall"
            const contractNameElement = document.getElementById('customerViewContractName');
            if (contractNameElement && !this.isDualMode) {
                contractNameElement.textContent = 'Overall';
            }

            console.log(`📊 Overall statistics: ${usedGpus}/${totalGpus} GPUs (${gpuUsagePercent}%), ${availableHosts} available, ${inUseHosts} in use`);
            
            // Show message in content area when in overall view
            if (!this.isDualMode) {
                const contentContainer = document.getElementById('customerViewContent');
                if (contentContainer) {
                    contentContainer.innerHTML = `
                        <div class="customer-empty-state">
                            <i class="fas fa-chart-bar fa-3x mb-3"></i>
                            <h5>Overall Statistics View</h5>
                            <p>Showing statistics for all contracts and base aggregates.</p>
                            <p class="text-muted">Select a specific contract from the dropdown to view detailed device information.</p>
                        </div>
                    `;
                }
            }

        } catch (error) {
            console.error('❌ Error loading overall statistics:', error);
            this.showErrorMessage();
        }
    }

    /**
     * Calculate statistics for a group of hosts
     */
    calculateHostStats(hosts) {
        let totalGpus = 0;
        let usedGpus = 0;
        let availableHosts = 0;
        let inUseHosts = 0;

        hosts.forEach(host => {
            const gpuInfo = host.gpu_info || {};
            const hostTotalGpus = gpuInfo.gpu_capacity || 8; // Default to 8 GPUs
            const hostUsedGpus = gpuInfo.gpu_used || 0;
            const hasVms = (host.vm_count || 0) > 0;

            totalGpus += hostTotalGpus;
            usedGpus += hostUsedGpus;

            if (hasVms) {
                inUseHosts++;
            } else {
                availableHosts++;
            }
        });

        return { totalGpus, usedGpus, availableHosts, inUseHosts };
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
    async createCustomerDeviceCard(host, isAvailable, contractNumber = '') {
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
        
        // Clear statistics
        this.clearStatistics();
        
        this.currentContractData = null;
        this.selectedDevice = null;
    }

    /**
     * Clear contract statistics display
     */
    clearStatistics() {
        const elements = [
            { id: 'customerViewGpuUsage', text: '0/0 GPUs (0%)' },
            { id: 'customerViewAvailableHosts', text: '0' },
            { id: 'customerViewInUseHosts', text: '0' }
        ];

        elements.forEach(({ id, text }) => {
            const element = document.getElementById(id);
            if (element) element.textContent = text;
        });

        const progressBar = document.getElementById('customerViewGpuProgressBar');
        if (progressBar) progressBar.style.width = '0%';
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
            
            // Initialize customer view with current data and populate contract options
            await this.initializeCustomerView();
            
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
     * Initialize customer view with current data (no reloading)
     */
    async initializeCustomerView() {
        const currentGpuType = window.currentGpuType;
        if (!currentGpuType) {
            this.showSelectGpuMessage();
            return;
        }

        this.currentGpuType = currentGpuType;
        
        // Load contracts list (just the list, not full data)
        await this.loadContracts(currentGpuType);
        
        // If a contract is already selected in main view, pre-select it
        const contractSelect = document.getElementById('contractColumnSelect');
        if (contractSelect && contractSelect.value) {
            // Find and auto-select the current contract
            const currentContract = this.availableContracts.find(c => c.aggregate === contractSelect.value);
            if (currentContract) {
                this.selectedContracts = [currentContract];
                
                // Check the checkbox
                const checkbox = document.getElementById(`contract_${currentContract.aggregate}`);
                if (checkbox) checkbox.checked = true;
                
                this.updateSelectedContractsDisplay();
                this.renderSelectedContracts();
            }
        } else {
            // Show overall statistics when no contracts selected
            await this.updateOverallStatistics();
        }
    }

    /**
     * Render the selected contracts (1 or 2 contracts)
     */
    async renderSelectedContracts() {
        const contentContainer = document.getElementById('customerViewContent');
        if (!contentContainer) return;

        if (this.selectedContracts.length === 0) {
            // Show overall view
            await this.updateOverallStatistics();
            return;
        }

        if (this.selectedContracts.length === 1) {
            // Single contract view
            await this.renderSingleContract(this.selectedContracts[0]);
        } else {
            // Dual contract view
            await this.renderDualContracts();
        }
    }

    /**
     * Render a single contract
     */
    async renderSingleContract(contract) {
        console.log('🎨 Rendering single contract view:', contract.name);
        
        // Update contract name
        const contractNameElement = document.getElementById('customerViewContractName');
        if (contractNameElement) {
            contractNameElement.textContent = contract.name;
        }

        // Update statistics
        this.updateContractStatistics(contract);

        // Render devices in regular single-contract layout
        await this.renderCustomerView(contract);
    }

    /**
     * Render two contracts side-by-side
     */
    async renderDualContracts() {
        console.log('🎨 Rendering dual contracts view');
        
        const contentContainer = document.getElementById('customerViewContent');
        if (!contentContainer) return;

        // Update contract name
        const contractNameElement = document.getElementById('customerViewContractName');
        if (contractNameElement) {
            contractNameElement.textContent = `${this.selectedContracts[0].name} & ${this.selectedContracts[1].name}`;
        }

        // Create side-by-side layout
        let dualHtml = '<div class="row">';
        
        // Contract 1 column
        dualHtml += '<div class="col-md-6">';
        dualHtml += await this.renderSingleContractColumn(this.selectedContracts[0], '1');
        dualHtml += '</div>';
        
        // Contract 2 column
        dualHtml += '<div class="col-md-6 border-start">';
        dualHtml += await this.renderSingleContractColumn(this.selectedContracts[1], '2');
        dualHtml += '</div>';
        
        dualHtml += '</div>';
        contentContainer.innerHTML = dualHtml;

        // Update dual statistics
        this.updateDualContractsStatistics();
        
        console.log('✅ Dual contracts view rendered successfully');
    }

    /**
     * Update statistics for dual contracts
     */
    updateDualContractsStatistics() {
        // Show dual stats, hide single stats
        const singleStats = document.getElementById('singleContractStats');
        const dualStats = document.getElementById('dualContractStats');
        
        if (singleStats) singleStats.style.display = 'none';
        if (dualStats) dualStats.style.display = 'block';

        // Update stats for each contract
        if (this.selectedContracts[0]) {
            this.updateSingleContractStats(this.selectedContracts[0], '1');
            const nameElement = document.getElementById('contract1Name');
            if (nameElement) nameElement.textContent = this.selectedContracts[0].name;
        }

        if (this.selectedContracts[1]) {
            this.updateSingleContractStats(this.selectedContracts[1], '2');
            const nameElement = document.getElementById('contract2Name');
            if (nameElement) nameElement.textContent = this.selectedContracts[1].name;
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