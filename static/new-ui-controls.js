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

        // Use the stored data from the intercepted renderAggregateData call
        // Don't overwrite this.currentGpuData here - it's set in the intercept function
        if (!this.currentGpuData) {
            console.log('⚠️ No cached GPU data available, trying window.Frontend.aggregateData as fallback');
            this.currentGpuData = window.Frontend?.aggregateData;
        }

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

        // Apply filters to main columns
        const columns = ['runpod', 'ondemand', 'spot', 'contracts', 'outofstock'];

        columns.forEach(columnType => {
            const columnData = this.currentGpuData[columnType];
            if (!columnData || !columnData.hosts) return;

            // Use correct container IDs based on column type
            let containerId;
            if (columnType === 'contracts') {
                containerId = 'contractHostsList'; // Special case for contracts
            } else {
                containerId = `${columnType}Hosts`; // Standard pattern: runpodHosts, spotHosts, etc.
            }

            const columnContainer = document.getElementById(containerId);
            if (!columnContainer) {
                console.log(`⚠️ Container '${containerId}' not found for ${columnType} - column may not be rendered yet`);
                return;
            }

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

            // Update column count with correct ID mapping
            let countElementId;
            if (columnType === 'contracts') {
                countElementId = 'contractHostCount'; // Special case
            } else if (columnType === 'outofstock') {
                countElementId = 'outofstockCount'; // Special case - different from standard pattern
            } else {
                countElementId = `${columnType}Count`; // Standard pattern: runpodCount, spotCount, ondemandCount
            }

            const countElement = document.getElementById(countElementId);
            if (countElement) {
                countElement.textContent = columnVisible;
            } else {
                console.log(`⚠️ Count element '${countElementId}' not found for ${columnType}`);
            }

            console.log(`📊 ${columnType}: ${columnVisible} visible, ${columnHidden} hidden`);
        });

        // Apply filters to variant columns (e.g., On-Demand NVLink variants)
        if (this.currentGpuData.ondemand && this.currentGpuData.ondemand.variants) {
            this.currentGpuData.ondemand.variants.forEach(variant => {
                const variantId = variant.aggregate.replace(/[^a-zA-Z0-9]/g, '');
                const variantContainer = document.getElementById(`${variantId}Hosts`);

                if (!variantContainer) {
                    console.log(`⚠️ Variant container '${variantId}Hosts' not found for variant ${variant.variant}`);
                    return;
                }

                // Filter hosts for this variant
                const variantHosts = this.currentGpuData.ondemand.hosts.filter(host => host.variant === variant.aggregate);

                let variantVisible = 0;
                let variantHidden = 0;

                variantHosts.forEach((host, index) => {
                    const hostCard = variantContainer.children[index];
                    if (!hostCard) return;

                    const shouldShow = this.shouldShowHost(host, showInvestor, showNGC);

                    if (shouldShow) {
                        hostCard.style.display = '';
                        variantVisible++;
                        totalVisible++;
                    } else {
                        hostCard.style.display = 'none';
                        variantHidden++;
                        totalHidden++;
                    }
                });

                // Update variant column count
                const variantCountElement = document.getElementById(`${variantId}Count`);
                if (variantCountElement) {
                    variantCountElement.textContent = variantVisible;
                } else {
                    console.log(`⚠️ Count element '${variantId}Count' not found for variant ${variant.variant}`);
                }

                console.log(`📊 ${variant.variant}: ${variantVisible} visible, ${variantHidden} hidden`);
            });
        }

        console.log(`👁️ Total filter results: ${totalVisible} visible, ${totalHidden} hidden`);
    }

    /**
     * Determine if a host should be shown based on owner filters
     */
    shouldShowHost(host, showInvestor, showNGC) {
        // Debug the host data structure to understand what fields are available
        console.log('🔍 Host data for filtering:', {
            hostname: host.hostname || host.name,
            owner_group: host.owner_group,
            tenant: host.tenant,
            allFields: Object.keys(host)
        });

        // Use the actual data structure: owner_group field
        const ownerGroup = host.owner_group || 'Investors'; // Default to Investors if missing

        // NGC detection: owner_group === 'Nexgen Cloud'
        const isNGC = ownerGroup === 'Nexgen Cloud';

        // Investor detection: owner_group === 'Investors'
        const isInvestorOwned = ownerGroup === 'Investors';

        const hostname = host.hostname || host.name || 'unknown';
        console.log(`📊 ${hostname}: owner_group="${ownerGroup}", NGC=${isNGC}, Investor=${isInvestorOwned}, Show=${(showInvestor && isInvestorOwned) || (showNGC && isNGC)}`);

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
        // TEMPORARILY DISABLED - Hook into existing Frontend renderAggregateData to show summary and apply filters
        console.log('🚫 Owner filtering temporarily disabled for debugging');
        /*
        const originalRender = window.Frontend?.renderAggregateData;
        if (originalRender) {
            window.Frontend.renderAggregateData = (data) => {
                console.log('🎯 New UI Controls: Intercepted data loading');

                // Call original render first
                originalRender.call(window.Frontend, data);

                // Show GPU type summary
                this.showGpuTypeSummary();

                // Store data and apply current filters
                this.currentGpuData = data;

                // Small delay to ensure DOM is rendered and columns are rendered first
                setTimeout(() => {
                    this.applyCurrentFilters();
                }, 500); // Increased delay to let columns render first
            };
        } else {
            console.warn('⚠️ Frontend.renderAggregateData not found - owner filters may not work');
        }
        */

        // Hook into GPU type selection to update summary (but don't interfere with hostsRow visibility)
        const gpuTypeSelect = document.getElementById('gpuTypeSelect');
        if (gpuTypeSelect) {
            gpuTypeSelect.addEventListener('change', () => {
                const selectedType = gpuTypeSelect.value;
                if (selectedType) {
                    this.updateSelectedGpuType(selectedType);
                    this.showGpuTypeSummary();
                    // Let script.js handle hostsRow visibility - don't interfere
                } else {
                    this.hideGpuTypeSummary();
                    // Let script.js handle hostsRow visibility - don't interfere
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

    // Note: hostsRow visibility is now managed by script.js to avoid conflicts

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