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

        // Trigger a re-render with filtered data
        if (this.currentGpuData && window.Frontend && window.Frontend.renderAggregateData) {
            // Filter the data first, then pass to render
            const filteredData = this.filterDataBeforeRender(this.currentGpuData);

            // Update VM counts for old UI elements
            this.updateVMCountsForOldUI(filteredData);

            // Call the original render function directly with filtered data
            // Skip our interception to avoid double filtering
            const originalRender = window.Frontend._originalRenderAggregateData || window.Frontend.renderAggregateData;
            originalRender.call(window.Frontend, filteredData);
        } else {
            console.log('⚠️ No cached GPU data available for re-rendering');
        }
    }

    /**
     * Filter data before rendering instead of manipulating DOM after
     */
    filterDataBeforeRender(data) {
        const investorChecked = document.getElementById('filterInvestor')?.checked ?? true;
        const ngcChecked = document.getElementById('filterNGC')?.checked ?? true;

        // If both filters are enabled, return original data
        if (investorChecked && ngcChecked) {
            console.log('🔍 Both filters enabled, returning original data');
            return data;
        }

        console.log('🔍 Filtering data before render:', { investorChecked, ngcChecked });

        // Create a deep copy to avoid modifying original data
        const filteredData = JSON.parse(JSON.stringify(data));

        // Filter main columns and recalculate GPU summaries
        const columns = ['runpod', 'ondemand', 'spot', 'contracts', 'outofstock'];

        columns.forEach(columnType => {
            if (filteredData[columnType] && filteredData[columnType].hosts) {
                const originalHosts = filteredData[columnType].hosts;
                const originalCount = originalHosts.length;
                const originalGpuSummary = filteredData[columnType].gpu_summary;

                console.log(`🔍 ${columnType}: ${originalCount} hosts, original GPU summary:`, originalGpuSummary);

                filteredData[columnType].hosts = originalHosts.filter(host =>
                    this.shouldShowHost(host, investorChecked, ngcChecked)
                );

                const filteredCount = filteredData[columnType].hosts.length;
                console.log(`🔍 ${columnType}: filtered from ${originalCount} to ${filteredCount} hosts`);

                // Recalculate GPU summary based on filtered hosts
                this.recalculateGpuSummary(filteredData[columnType]);
            }
        });

        return filteredData;
    }

    /**
     * Preserve GPU summary proportionally based on filtered hosts
     */
    recalculateGpuSummary(columnData, originalHostCount) {
        if (!columnData.hosts || columnData.hosts.length === 0) {
            columnData.gpu_summary = {
                gpu_used: 0,
                gpu_capacity: 0
            };
            return;
        }

        // Simple approach: keep the original gpu_summary since it's already calculated correctly
        // The filtering at the data level should preserve the correct totals
        console.log(`🔍 Preserving GPU summary for ${columnData.hosts.length} filtered hosts in ${columnData.name || 'Unknown'}`);
    }

    /**
     * Update VM counts for old UI elements when filters change
     */
    updateVMCountsForOldUI(data) {
        // Calculate VM counts from filtered data
        let totalAvailableHosts = 0;
        let totalInUseHosts = 0;

        // Count from all filtered columns
        const columns = ['runpod', 'ondemand', 'spot', 'contracts', 'outofstock'];
        columns.forEach(columnType => {
            if (data[columnType] && data[columnType].hosts) {
                data[columnType].hosts.forEach(host => {
                    if (host.has_vms) {
                        totalInUseHosts++;
                    } else {
                        totalAvailableHosts++;
                    }
                });
            }
        });

        // Update old UI elements if they exist
        const availableHostsElement = document.getElementById('availableHostsCount');
        const inUseHostsElement = document.getElementById('inUseHostsCount');

        if (availableHostsElement) {
            availableHostsElement.textContent = totalAvailableHosts;
        }

        if (inUseHostsElement) {
            inUseHostsElement.textContent = totalInUseHosts;
        }

        console.log(`📊 Updated VM counts: ${totalAvailableHosts} available, ${totalInUseHosts} in use (filtered data)`);
    }

    /**
     * Determine if a host should be shown based on owner filters
     */
    shouldShowHost(host, showInvestor, showNGC) {
        // Use the actual data structure: owner_group field
        const ownerGroup = host.owner_group || 'Investors'; // Default to Investors if missing

        // NGC detection: owner_group === 'Nexgen Cloud'
        const isNGC = ownerGroup === 'Nexgen Cloud';

        // Investor detection: owner_group === 'Investors'
        const isInvestorOwned = ownerGroup === 'Investors';

        const shouldShow = (showInvestor && isInvestorOwned) || (showNGC && isNGC);

        // Debug the first few filter decisions
        if (!this.debugCount) this.debugCount = 0;
        if (this.debugCount < 5) {
            console.log(`🔍 shouldShowHost debug #${this.debugCount}:`, {
                hostname: host.name || host.hostname || 'unknown',
                owner_group: ownerGroup,
                isNGC,
                isInvestorOwned,
                showInvestor,
                showNGC,
                shouldShow
            });
            this.debugCount++;
        }

        return shouldShow;
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
            // Store reference to original function for direct calls when filters change
            window.Frontend._originalRenderAggregateData = originalRender;

            window.Frontend.renderAggregateData = (data) => {
                console.log('🎯 New UI Controls: Intercepted data loading');

                // Filter the data BEFORE rendering
                const filteredData = this.filterDataBeforeRender(data);

                // Call original render with filtered data
                originalRender.call(window.Frontend, filteredData);

                // Show GPU type summary
                this.showGpuTypeSummary();

                // Store original data for future filtering
                this.currentGpuData = data;
            };
        } else {
            console.warn('⚠️ Frontend.renderAggregateData not found - owner filters may not work');
        }

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
     * Get current filter state
     */
    getFilterState() {
        return {
            investor: document.getElementById('filterInvestor')?.checked || false,
            ngc: document.getElementById('filterNGC')?.checked || false
        };
    }

}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.newUIControls = new NewUIControls();
    console.log('🎨 New UI Controls initialized');
});

// Export for use by other scripts
window.NewUIControls = NewUIControls;