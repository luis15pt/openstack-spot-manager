/**
 * BaseColumn - Shared functionality for all column types
 * 
 * This class contains all the common patterns extracted from existing
 * updateRunpodColumn, updateSpotColumn, updateOnDemandColumn, and updateContractColumn functions.
 * 
 * Shared functionality optimized for performance across all column types.
 */
class BaseColumn {
    constructor(config) {
        this.id = config.id;           // e.g., 'runpod', 'spot', 'ondemand', 'contract'
        this.name = config.name;       // e.g., 'Runpod', 'Spot', 'On-Demand', 'Contract'
        this.icon = config.icon;       // e.g., 'fa-rocket', 'fa-flash', 'fa-server', 'fa-file-contract'
        this.color = config.color;     // e.g., 'bg-purple', 'bg-warning', 'bg-primary', 'bg-success'
        this.countElementId = config.countElementId; // e.g., 'runpodCount', 'spotCount'
        this.gpuUsageElementId = config.gpuUsageElementId; // e.g., 'runpodGpuUsage'
        this.gpuPercentElementId = config.gpuPercentElementId; // e.g., 'runpodGpuPercent'
        this.gpuProgressBarElementId = config.gpuProgressBarElementId; // e.g., 'runpodGpuProgressBar'
        this.hostsContainerId = config.hostsContainerId; // e.g., 'runpodHosts'
        this.nameElementId = config.nameElementId; // e.g., 'runpodName' (optional)

        // Search functionality
        this.allHosts = []; // Store original unfiltered hosts
        this.filteredHosts = []; // Store current filtered hosts
        this.searchTerm = ''; // Current search term
        this.initializeSearch();
    }

    /**
     * Update header count badge
     * Extracted from all updateXColumn functions - identical pattern
     */
    updateCount(count) {
        const countElement = document.getElementById(this.countElementId);
        if (countElement) {
            countElement.textContent = count;
        }
    }

    /**
     * Update name display (for columns that have dynamic names)
     * Used by contract column primarily
     */
    updateName(name) {
        if (this.nameElementId) {
            const nameElement = document.getElementById(this.nameElementId);
            if (nameElement && name) {
                nameElement.textContent = name;
            }
        }
    }

    /**
     * Update GPU statistics display
     * Extracted from all updateXColumn functions - identical calculation and DOM updates
     */
    updateGpuStats(gpuSummary) {
        if (gpuSummary) {
            // Exact calculation from existing functions
            const percent = Math.round((gpuSummary.gpu_used / gpuSummary.gpu_capacity) * 100) || 0;
            
            // Update usage text
            const usageElement = document.getElementById(this.gpuUsageElementId);
            if (usageElement) {
                usageElement.textContent = gpuSummary.gpu_usage_ratio;
            }
            
            // Update percentage text
            const percentElement = document.getElementById(this.gpuPercentElementId);
            if (percentElement) {
                percentElement.textContent = percent + '%';
            }
            
            // Update progress bar
            const progressBarElement = document.getElementById(this.gpuProgressBarElementId);
            if (progressBarElement) {
                progressBarElement.style.width = percent + '%';
            }
        } else {
            // Fallback handling - preserve existing warning behavior for runpod
            if (this.id === 'runpod') {
                console.warn(`⚠️ ${this.name} gpu_summary is missing`);
            }
            
            // Set fallback values
            const usageElement = document.getElementById(this.gpuUsageElementId);
            if (usageElement) {
                usageElement.textContent = '0/0';
            }
            
            const percentElement = document.getElementById(this.gpuPercentElementId);
            if (percentElement) {
                percentElement.textContent = '0%';
            }
            
            const progressBarElement = document.getElementById(this.gpuProgressBarElementId);
            if (progressBarElement) {
                progressBarElement.style.width = '0%';
            }
        }
    }

    /**
     * Render hosts in the column
     * Extracted from all updateXColumn functions - identical call to Frontend.renderHosts
     */
    renderHosts(hosts, aggregateName = null) {
        // Exact call from existing functions
        if (window.Frontend && window.Frontend.renderHosts) {
            // Check if container exists before rendering
            const container = document.getElementById(this.hostsContainerId);
            if (!container) {
                console.warn(`⚠️ Container ${this.hostsContainerId} not found, retrying after DOM update...`);
                // Retry after a short delay to allow DOM to update
                setTimeout(() => {
                    const retryContainer = document.getElementById(this.hostsContainerId);
                    if (retryContainer) {
                        console.log(`✅ Container ${this.hostsContainerId} now available, rendering hosts`);
                        window.Frontend.renderHosts(this.hostsContainerId, hosts, this.id, aggregateName);
                    } else {
                        console.error(`❌ Container ${this.hostsContainerId} still not found after retry`);
                    }
                }, 100);
                return;
            }

            window.Frontend.renderHosts(this.hostsContainerId, hosts, this.id, aggregateName);
        } else {
            console.error(`❌ Frontend.renderHosts not available for ${this.id} column`);
        }
    }

    /**
     * Log column update - preserve existing console.log pattern
     */
    logUpdate(hostCount) {
        console.log(`🔄 Updating ${this.name} column with ${hostCount} hosts`);
    }

    /**
     * Initialize search functionality for this column
     */
    initializeSearch() {
        // Create search input element ID
        this.searchInputId = `${this.id}Search`;

        // Add search input to column header when DOM is ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.addSearchInput());
        } else {
            // Try to add search input immediately, but also set a timeout as fallback
            this.addSearchInput();
            setTimeout(() => this.addSearchInput(), 100);
        }
    }

    /**
     * Add search input to column header
     */
    addSearchInput() {
        // Find the column header
        const columnElement = document.getElementById(`${this.id}Column`);
        if (!columnElement) {
            console.log(`⏳ Column ${this.id}Column not found yet, will retry...`);
            return;
        }

        const cardHeader = columnElement.querySelector('.card-header');
        if (!cardHeader) {
            console.log(`⏳ Card header for ${this.id} not found yet, will retry...`);
            return;
        }

        // Check if search input already exists
        if (document.getElementById(this.searchInputId)) {
            return; // Already added
        }

        // Create search input container
        const searchContainer = document.createElement('div');
        searchContainer.className = 'column-search-container mt-2';
        searchContainer.innerHTML = `
            <div class="input-group input-group-sm">
                <input type="text"
                       class="form-control column-search-input"
                       id="${this.searchInputId}"
                       placeholder="Search hosts or owner..."
                       autocomplete="off">
                <button class="btn btn-outline-light btn-sm column-search-clear"
                        type="button"
                        title="Clear search"
                        style="display: none;">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;

        // Add to header
        cardHeader.appendChild(searchContainer);

        // Set up event listeners
        const searchInput = document.getElementById(this.searchInputId);
        const clearButton = searchContainer.querySelector('.column-search-clear');

        searchInput.addEventListener('input', (e) => {
            this.handleSearch(e.target.value);
            clearButton.style.display = e.target.value ? 'block' : 'none';
        });

        clearButton.addEventListener('click', () => {
            searchInput.value = '';
            this.handleSearch('');
            clearButton.style.display = 'none';
            searchInput.focus();
        });

        console.log(`✅ Search input added to ${this.name} column`);
    }

    /**
     * Handle search input changes
     */
    handleSearch(searchTerm) {
        this.searchTerm = searchTerm.toLowerCase().trim();

        if (!this.searchTerm) {
            // No search term, show all hosts
            this.filteredHosts = [...this.allHosts];
        } else {
            // Filter hosts based on search term
            this.filteredHosts = this.allHosts.filter(host => {
                const hostName = (host.name || '').toLowerCase();
                const ownerGroup = (host.owner_group || '').toLowerCase();
                const tenant = (host.tenant || '').toLowerCase();

                return hostName.includes(this.searchTerm) ||
                       ownerGroup.includes(this.searchTerm) ||
                       tenant.includes(this.searchTerm);
            });
        }

        // Re-render with filtered hosts
        this.renderHosts(this.filteredHosts);

        // Update count to show filtered results
        const displayCount = this.searchTerm ?
            `${this.filteredHosts.length}/${this.allHosts.length}` :
            this.allHosts.length;
        this.updateCount(displayCount);
    }

    /**
     * Store hosts and apply current search filter
     */
    setHosts(hosts) {
        this.allHosts = [...hosts];
        this.handleSearch(this.searchTerm); // Apply current filter
    }

    /**
     * Main update method - to be overridden by each column
     * This preserves the exact same signature as existing updateXColumn functions
     */
    update(data) {
        throw new Error(`update() method must be implemented by ${this.constructor.name}`);
    }
}

// Export for use by other column modules
window.BaseColumn = BaseColumn;