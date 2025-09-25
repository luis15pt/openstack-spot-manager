/**
 * New UI Controls - Professional toolbar functionality
 * Handles owner filters and enhanced UI interactions
 */

class NewUIControls {
    constructor() {
        this.initializeOwnerFilters();
        this.initializeDropdownBadgeSync();
        this.initializeToolsDropdown();
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

        // Apply filters to all visible host cards
        this.applyOwnerFilters(investorChecked, ngcChecked);

        // Update column counts after filtering
        this.updateColumnCountsAfterFilter();
    }

    /**
     * Apply owner filters to host cards
     */
    applyOwnerFilters(showInvestor, showNGC) {
        // Find all host cards across all columns
        const hostCards = document.querySelectorAll('.host-card, .host-row, [data-owner], [data-tenant]');
        let hiddenCount = 0;
        let visibleCount = 0;

        hostCards.forEach(card => {
            // Determine if this host should be shown
            let shouldShow = false;

            // Check various ways owner/tenant info might be stored
            const owner = card.getAttribute('data-owner') || '';
            const tenant = card.getAttribute('data-tenant') || '';
            const cardText = card.textContent || '';

            // Investor-owned detection patterns
            const isInvestorOwned =
                owner.toLowerCase().includes('investor') ||
                tenant.toLowerCase().includes('investor') ||
                cardText.includes('Investor') ||
                cardText.includes('investor-owned') ||
                !cardText.includes('NGC') && !cardText.includes('Nexgen');

            // NGC detection patterns
            const isNGC =
                owner.toLowerCase().includes('ngc') ||
                tenant.toLowerCase().includes('ngc') ||
                cardText.includes('NGC') ||
                cardText.includes('Nexgen');

            // Apply filter logic
            if (showInvestor && isInvestorOwned) {
                shouldShow = true;
            }
            if (showNGC && isNGC) {
                shouldShow = true;
            }

            // Show/hide the card
            if (shouldShow) {
                card.style.display = '';
                visibleCount++;
            } else {
                card.style.display = 'none';
                hiddenCount++;
            }
        });

        console.log(`👁️ Owner filter results: ${visibleCount} visible, ${hiddenCount} hidden`);
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