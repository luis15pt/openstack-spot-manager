/**
 * New UI Controls - Professional toolbar functionality
 * Handles owner filters and enhanced UI interactions
 */

class NewUIControls {
    constructor() {
        this.initializeOwnerFilters();
        this.initializeDropdownBadgeSync();
        this.initializeToolsDropdown();
        this.initializeGpuTypeSummary();

        // Store reference to current GPU data for filtering
        this.currentGpuData = null;
    }

    /**
     * Initialize owner filter checkboxes
     */
    initializeOwnerFilters() {
        const investorFilter = document.getElementById('filterInvestor');
        const ngcFilter = document.getElementById('filterNGC');

        if (investorFilter && ngcFilter) {
            // Add event listeners
            investorFilter.addEventListener('change', () => this.handleOwnerFilterChange());
            ngcFilter.addEventListener('change', () => this.handleOwnerFilterChange());

            console.log('✅ Owner filters initialized');
        }
    }

    /**
     * Handle owner filter changes
     */
    handleOwnerFilterChange() {
        const investorChecked = document.getElementById('filterInvestor')?.checked || false;
        const ngcChecked = document.getElementById('filterNGC')?.checked || false;

        console.log(`🔍 Owner filters changed: Investor=${investorChecked}, NGC=${ngcChecked}`);

        // Use cached data from Frontend
        this.currentGpuData = window.Frontend?.aggregateData;

        // Apply filters to all visible host cards
        this.applyOwnerFilters(investorChecked, ngcChecked);
    }

    /**
     * Apply owner filters to host cards with better detection logic
     */
    applyOwnerFilters(showInvestor, showNGC) {
        if (!this.currentGpuData) {
            console.log('⚠️ No GPU data available for filtering');
            return;
        }

        console.log('🔍 Applying owner filters with GPU data:', this.currentGpuData);

        let totalHidden = 0;
        let totalVisible = 0;

        // Apply filters to each column
        const columns = ['runpod', 'ondemand', 'spot', 'contracts', 'outofstock'];

        columns.forEach(columnType => {
            const columnData = this.currentGpuData[columnType];
            if (!columnData || !columnData.hosts) return;

            const columnContainer = document.getElementById(`${columnType}HostsList`);
            if (!columnContainer) return;

            let columnVisible = 0;
            let columnHidden = 0;

            columnData.hosts.forEach((host, index) => {
                const hostCard = columnContainer.children[index];
                if (!hostCard) return;

                const shouldShow = this.shouldShowHost(host, showInvestor, showNGC);

                if (shouldShow) {
                    hostCard.style.display = '';
                    columnVisible++;
                    totalVisible++;
                } else {
                    hostCard.style.display = 'none';
                    columnHidden++;
                    totalHidden++;
                }
            });

            // Update column count
            const countElement = document.getElementById(`${columnType}HostCount`);
            if (countElement) {
                countElement.textContent = columnVisible;
            }

            console.log(`📊 ${columnType}: ${columnVisible} visible, ${columnHidden} hidden`);
        });

        console.log(`👁️ Total filter results: ${totalVisible} visible, ${totalHidden} hidden`);
    }

    /**
     * Determine if a host should be shown based on owner filters
     */
    shouldShowHost(host, showInvestor, showNGC) {
        // Extract owner/tenant info from various possible fields
        const owner = (host.owner || host.tenant || host.customer || '').toLowerCase();
        const tenantName = (host.tenant_name || host.contract_name || '').toLowerCase();
        const hostname = (host.hostname || host.name || '').toLowerCase();

        // NGC detection patterns (more specific)
        const isNGC =
            owner.includes('ngc') ||
            owner.includes('nexgen') ||
            tenantName.includes('ngc') ||
            tenantName.includes('nexgen') ||
            hostname.includes('ngc');

        // Investor-owned detection (everything else that's not NGC)
        const isInvestorOwned = !isNGC;

        // Apply filter logic
        return (showInvestor && isInvestorOwned) || (showNGC && isNGC);
    }

    /**
     * Update column counts after filtering
     */
    updateColumnCountsAfterFilter() {
        // Update each column's visible count
        const columns = ['runpod', 'ondemand', 'spot', 'contracts', 'outofstock'];

        columns.forEach(columnId => {
            const columnContainer = document.getElementById(`${columnId}HostsList`);
            if (columnContainer) {
                const visibleHosts = columnContainer.querySelectorAll('.host-card:not([style*="display: none"]), .host-row:not([style*="display: none"])');
                const countElement = document.getElementById(`${columnId}HostCount`);
                if (countElement) {
                    countElement.textContent = visibleHosts.length;
                }
            }
        });
    }

    /**
     * Sync badge counts between tabs and dropdown
     */
    initializeDropdownBadgeSync() {
        // Sync pending operations count
        const pendingTabBadge = document.getElementById('pendingTabCount');
        const pendingDropdownBadge = document.getElementById('pendingDropdownCount');

        if (pendingTabBadge && pendingDropdownBadge) {
            // Create observer to sync counts
            const observer = new MutationObserver(() => {
                pendingDropdownBadge.textContent = pendingTabBadge.textContent;
            });
            observer.observe(pendingTabBadge, { childList: true, characterData: true });
        }

        // Sync command log count
        const commandTabBadge = document.getElementById('commandCount');
        const commandDropdownBadge = document.getElementById('commandDropdownCount');

        if (commandTabBadge && commandDropdownBadge) {
            const observer = new MutationObserver(() => {
                commandDropdownBadge.textContent = commandTabBadge.textContent;
            });
            observer.observe(commandTabBadge, { childList: true, characterData: true });
        }

        // Sync debug count
        const debugTabBadge = document.getElementById('debugTabCount');
        const debugDropdownBadge = document.getElementById('debugDropdownCount');

        if (debugTabBadge && debugDropdownBadge) {
            const observer = new MutationObserver(() => {
                debugDropdownBadge.textContent = debugTabBadge.textContent;
            });
            observer.observe(debugTabBadge, { childList: true, characterData: true });
        }

        console.log('✅ Badge syncing initialized');
    }

    /**
     * Initialize tools dropdown functionality
     */
    initializeToolsDropdown() {
        // Handle dropdown item clicks to activate corresponding tabs
        const dropdownItems = document.querySelectorAll('.dropdown-menu a[data-bs-target]');

        dropdownItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const targetTab = item.getAttribute('data-bs-target');
                const tabButton = document.querySelector(`button[data-bs-target="${targetTab}"]`);

                if (tabButton) {
                    // Make the tab visible and activate it
                    tabButton.style.display = '';
                    tabButton.click();
                }
            });
        });

        console.log('✅ Tools dropdown initialized');
    }

    /**
     * Reset all filters to default state
     */
    resetFilters() {
        // Reset owner filters
        const investorFilter = document.getElementById('filterInvestor');
        const ngcFilter = document.getElementById('filterNGC');

        if (investorFilter) investorFilter.checked = true;
        if (ngcFilter) ngcFilter.checked = true;

        // Apply the reset filters
        this.handleOwnerFilterChange();
    }

    /**
     * Initialize GPU type summary functionality
     */
    initializeGpuTypeSummary() {
        // Hook into existing Frontend renderAggregateData to show summary and apply filters
        const originalRender = window.Frontend?.renderAggregateData;
        if (originalRender) {
            window.Frontend.renderAggregateData = (data) => {
                // Call original render first
                originalRender.call(window.Frontend, data);

                // Show GPU type summary
                this.showGpuTypeSummary();

                // Store data and apply current filters
                this.currentGpuData = data;
                this.applyCurrentFilters();
            };
        }

        // Hook into GPU type selection to update summary
        const gpuTypeSelect = document.getElementById('gpuTypeSelect');
        if (gpuTypeSelect) {
            gpuTypeSelect.addEventListener('change', () => {
                const selectedType = gpuTypeSelect.value;
                if (selectedType) {
                    this.updateSelectedGpuType(selectedType);
                    this.showGpuTypeSummary();
                    this.showHostsRow();
                } else {
                    this.hideGpuTypeSummary();
                    this.hideHostsRow();
                }
            });
        }

        console.log('✅ GPU type summary initialized');
    }

    /**
     * Show the GPU type summary section
     */
    showGpuTypeSummary() {
        const summarySection = document.getElementById('gpuTypeSummary');
        if (summarySection) {
            summarySection.style.display = '';
        }
    }

    /**
     * Hide the GPU type summary section
     */
    hideGpuTypeSummary() {
        const summarySection = document.getElementById('gpuTypeSummary');
        if (summarySection) {
            summarySection.style.display = 'none';
        }
    }

    /**
     * Show the hosts row when GPU type is selected
     */
    showHostsRow() {
        const hostsRow = document.getElementById('hostsRow');
        if (hostsRow) {
            hostsRow.classList.remove('d-none');
            console.log('👁️ Hosts row is now visible');
        }
    }

    /**
     * Hide the hosts row when no GPU type is selected
     */
    hideHostsRow() {
        const hostsRow = document.getElementById('hostsRow');
        if (hostsRow) {
            hostsRow.classList.add('d-none');
            console.log('🙈 Hosts row is now hidden');
        }
    }

    /**
     * Update the selected GPU type display
     */
    updateSelectedGpuType(gpuType) {
        const nameElement = document.getElementById('selectedGpuTypeName');
        if (nameElement) {
            nameElement.textContent = gpuType;
        }
    }

    /**
     * Apply current filter settings to cached data
     */
    applyCurrentFilters() {
        const investorChecked = document.getElementById('filterInvestor')?.checked || false;
        const ngcChecked = document.getElementById('filterNGC')?.checked || false;

        if (this.currentGpuData) {
            this.applyOwnerFilters(investorChecked, ngcChecked);
        }
    }

    /**
     * Get current filter state
     */
    getFilterState() {
        return {
            investor: document.getElementById('filterInvestor')?.checked || false,
            ngc: document.getElementById('filterNGC')?.checked || false
        };
    }

    /**
     * Update GPU data reference (called when new data is loaded)
     */
    updateGpuData(data) {
        this.currentGpuData = data;
        this.applyCurrentFilters();
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.newUIControls = new NewUIControls();
    console.log('🎨 New UI Controls initialized');
});

// Export for use by other scripts
window.NewUIControls = NewUIControls;