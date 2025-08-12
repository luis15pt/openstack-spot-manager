/**
 * SpotColumn - Exact migration of updateSpotColumn function
 * 
 * CRITICAL: This must preserve identical behavior to the original updateSpotColumn function (lines 610-626)
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
        
        // Original: document.getElementById('spotCount').textContent = data.hosts.length;
        this.updateCount(data.hosts.length);
        
        // Original: GPU statistics update with exact same logic (no fallback warning for spot)
        this.updateGpuStats(data.gpu_summary);
        
        // Original: window.Frontend.renderHosts('spotHosts', data.hosts, 'spot', data.name);
        this.renderHosts(data.hosts, data.name);
    }
}

// Export for use by main script
window.SpotColumn = SpotColumn;