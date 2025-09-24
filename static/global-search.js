/**
 * Global Search Module - Frontend-only search using cached data
 *
 * This module provides instant search across all columns by filtering
 * the already-loaded cached data without making additional API calls.
 */

class GlobalSearch {
    constructor() {
        this.searchTerm = '';
        this.originalData = null; // Store original unfiltered data
        this.isSearchActive = false;
        this.initializeSearch();
    }

    /**
     * Initialize search functionality
     */
    initializeSearch() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.setupSearchInput());
        } else {
            this.setupSearchInput();
        }
    }

    /**
     * Set up search input event listeners
     */
    setupSearchInput() {
        const searchInput = document.getElementById('globalSearch');
        const clearButton = document.getElementById('clearSearchBtn');

        if (!searchInput) {
            console.warn('⚠️ Global search input not found');
            return;
        }

        // Search input event listener with debouncing
        let searchTimeout;
        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                this.handleSearch(e.target.value);
            }, 300); // 300ms debounce

            // Show/hide clear button
            if (clearButton) {
                clearButton.style.display = e.target.value ? 'block' : 'none';
            }
        });

        // Clear button event listener
        if (clearButton) {
            clearButton.addEventListener('click', () => {
                searchInput.value = '';
                this.handleSearch('');
                clearButton.style.display = 'none';
                searchInput.focus();
            });
        }

        console.log('✅ Global search initialized');
    }

    /**
     * Handle search input changes
     */
    handleSearch(searchTerm) {
        this.searchTerm = searchTerm.toLowerCase().trim();

        if (!this.searchTerm) {
            this.clearSearch();
            return;
        }

        // Get current GPU type and cached data
        const currentGpuType = this.getCurrentGpuType();
        if (!currentGpuType) {
            console.warn('⚠️ No GPU type selected for search');
            return;
        }

        const cachedData = this.getCachedData(currentGpuType);
        if (!cachedData) {
            console.warn('⚠️ No cached data available for search');
            return;
        }

        // Store original data if this is the first search
        if (!this.isSearchActive) {
            this.originalData = this.deepClone(cachedData);
            this.isSearchActive = true;
        }

        // Apply search filter
        const filteredData = this.filterData(this.originalData, this.searchTerm);

        // Update the display with filtered data
        this.updateDisplay(filteredData);

        console.log(`🔍 Search applied: "${this.searchTerm}" - filtered results updated`);
    }

    /**
     * Clear search and restore original data
     */
    clearSearch() {
        if (!this.isSearchActive || !this.originalData) {
            return; // No search active or no original data to restore
        }

        // Restore original data
        this.updateDisplay(this.originalData);

        // Reset search state
        this.searchTerm = '';
        this.isSearchActive = false;
        this.originalData = null;

        console.log('✅ Search cleared - original data restored');
    }

    /**
     * Get current GPU type from the selector
     */
    getCurrentGpuType() {
        const select = document.getElementById('gpuTypeSelect');
        return select ? select.value : null;
    }

    /**
     * Get cached data for the specified GPU type
     */
    getCachedData(gpuType) {
        if (!window.gpuDataCache || !window.gpuDataCache.has(gpuType)) {
            return null;
        }
        return window.gpuDataCache.get(gpuType);
    }

    /**
     * Filter data based on search term
     */
    filterData(data, searchTerm) {
        const filtered = this.deepClone(data);

        // Filter function for host arrays
        const filterHosts = (hosts) => {
            if (!hosts || !Array.isArray(hosts)) return hosts;

            return hosts.filter(host => {
                const hostname = (host.name || host.hostname || '').toLowerCase();
                const ownerGroup = (host.owner_group || '').toLowerCase();
                const tenant = (host.tenant || '').toLowerCase();

                return hostname.includes(searchTerm) ||
                       ownerGroup.includes(searchTerm) ||
                       tenant.includes(searchTerm);
            });
        };

        // Filter each column type
        if (filtered.runpod && filtered.runpod.hosts) {
            filtered.runpod.hosts = filterHosts(filtered.runpod.hosts);
        }

        if (filtered.spot && filtered.spot.hosts) {
            filtered.spot.hosts = filterHosts(filtered.spot.hosts);
        }

        if (filtered.ondemand && filtered.ondemand.hosts) {
            filtered.ondemand.hosts = filterHosts(filtered.ondemand.hosts);
        }

        if (filtered.contract && filtered.contract.hosts) {
            filtered.contract.hosts = filterHosts(filtered.contract.hosts);
        }

        if (filtered.outofstock && filtered.outofstock.hosts) {
            filtered.outofstock.hosts = filterHosts(filtered.outofstock.hosts);
        }

        return filtered;
    }

    /**
     * Update the display with filtered data
     */
    updateDisplay(data) {
        // Update each column using existing update functions from window.columns object
        if (window.columns && window.columns.runpod && data.runpod) {
            window.columns.runpod.update(data.runpod);
        }

        if (window.columns && window.columns.spot && data.spot) {
            window.columns.spot.update(data.spot);
        }

        if (window.columns && window.columns.ondemand && data.ondemand) {
            window.columns.ondemand.update(data.ondemand);
        }

        if (window.columns && window.columns.contract && data.contract) {
            window.columns.contract.update(data.contract);
        }

        if (window.columns && window.columns.outofstock && data.outofstock) {
            window.columns.outofstock.update(data.outofstock);
        }

        // Also update variant columns if they exist
        if (window.Frontend && window.Frontend.renderOnDemandVariantColumns && data.ondemand) {
            window.Frontend.renderOnDemandVariantColumns(data.ondemand);
        }
    }

    /**
     * Deep clone an object
     */
    deepClone(obj) {
        return JSON.parse(JSON.stringify(obj));
    }

    /**
     * Reset search when GPU type changes
     */
    onGpuTypeChange() {
        // Clear search when switching GPU types
        const searchInput = document.getElementById('globalSearch');
        const clearButton = document.getElementById('clearSearchBtn');

        if (searchInput) {
            searchInput.value = '';
        }
        if (clearButton) {
            clearButton.style.display = 'none';
        }

        this.searchTerm = '';
        this.isSearchActive = false;
        this.originalData = null;

        console.log('🔄 Search reset due to GPU type change');
    }
}

// Create global instance
const globalSearch = new GlobalSearch();

// Make available globally
window.GlobalSearch = globalSearch;

// Export for module loading
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GlobalSearch;
}