/**
 * BaseColumn - Shared functionality for all column types
 * 
 * This class contains all the common patterns extracted from existing
 * updateRunpodColumn, updateSpotColumn, updateOnDemandColumn, and updateContractColumn functions.
 * 
 * CRITICAL: All functionality here must preserve exact existing behavior.
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
     * Main update method - to be overridden by each column
     * This preserves the exact same signature as existing updateXColumn functions
     */
    update(data) {
        throw new Error(`update() method must be implemented by ${this.constructor.name}`);
    }
}

// Export for use by other column modules
window.BaseColumn = BaseColumn;