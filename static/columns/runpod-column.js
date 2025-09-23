/**
 * RunpodColumn - Exact migration of updateRunpodColumn function
 * 
 * Optimized runpod column implementation
 */
class RunpodColumn extends BaseColumn {
    constructor() {
        super({
            id: 'runpod',
            name: 'Runpod',
            icon: 'fa-rocket',
            color: 'bg-purple',
            countElementId: 'runpodCount',
            gpuUsageElementId: 'runpodGpuUsage',
            gpuPercentElementId: 'runpodGpuPercent',
            gpuProgressBarElementId: 'runpodGpuProgressBar',
            hostsContainerId: 'runpodHosts',
            nameElementId: 'runpodName'
        });
    }

    /**
     * Update runpod column - EXACT same logic as original updateRunpodColumn(data)
     * Original function: lines 585-607 in script.js
     */
    update(data) {
        // Original: console.log(`🔄 Updating RunPod column with ${data.hosts.length} hosts`);
        this.logUpdate(data.hosts.length);

        // Store hosts for search functionality
        this.setHosts(data.hosts);

        // Original: GPU statistics update with exact same logic and fallback handling
        this.updateGpuStats(data.gpu_summary);

        // Note: renderHosts is now called by setHosts() with filtered results
    }
}

// Export for use by main script
window.RunpodColumn = RunpodColumn;