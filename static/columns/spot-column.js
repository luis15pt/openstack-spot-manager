/**
 * SpotColumn - Exact migration of updateSpotColumn function
 * 
 * Optimized spot column implementation
 */
class SpotColumn extends BaseColumn {
    constructor() {
        super({
            id: 'spot',
            name: 'Spot',
            icon: 'fa-flash',
            color: 'bg-warning',
            countElementId: 'spotCount',
            gpuUsageElementId: 'spotGpuUsage',
            gpuPercentElementId: 'spotGpuPercent',
            gpuProgressBarElementId: 'spotGpuProgressBar',
            hostsContainerId: 'spotHosts',
            nameElementId: 'spotName'
        });
    }

    /**
     * Update spot column - EXACT same logic as original updateSpotColumn(data)
     * Original function: lines 610-626 in script.js
     */
    update(data) {
        // Original: console.log(`🔄 Updating Spot column with ${data.hosts.length} hosts`);
        this.logUpdate(data.hosts.length);

        // Store hosts for search functionality
        this.setHosts(data.hosts);

        // Original: GPU statistics update with exact same logic (no fallback warning for spot)
        this.updateGpuStats(data.gpu_summary);

        // Note: renderHosts is now called by setHosts() with filtered results
    }
}

// Export for use by main script
window.SpotColumn = SpotColumn;