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
        
        // Original: document.getElementById('runpodCount').textContent = data.hosts.length;
        this.updateCount(data.hosts.length);
        
        // Original: GPU statistics update with exact same logic and fallback handling
        this.updateGpuStats(data.gpu_summary);
        
        // Original: window.Frontend.renderHosts('runpodHosts', data.hosts, 'runpod', data.name);
        this.renderHosts(data.hosts, data.name);
    }
}

// Export for use by main script
window.RunpodColumn = RunpodColumn;