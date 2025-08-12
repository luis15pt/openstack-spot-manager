/**
 * OndemandColumn - Exact migration of updateOnDemandColumn function
 * 
 * CRITICAL: This must preserve identical behavior to the original updateOnDemandColumn function (lines 629-653)
 */
class OndemandColumn extends BaseColumn {
    constructor() {
        super({
            id: 'ondemand',
            name: 'On-Demand',
            icon: 'fa-server',
            color: 'bg-primary',
            countElementId: 'ondemandCount',
            gpuUsageElementId: 'ondemandGpuUsage',
            gpuPercentElementId: 'ondemandGpuPercent',
            gpuProgressBarElementId: 'ondemandGpuProgressBar',
            hostsContainerId: 'ondemandHosts',
            nameElementId: 'ondemandName'
        });
    }

    /**
     * Update on-demand column - EXACT same logic as original updateOnDemandColumn(data)
     * Original function: lines 629-653 in script.js
     */
    update(data) {
        // Original: console.log(`🔄 Updating On-Demand column(s) with ${data.hosts.length} hosts`);
        this.logUpdate(data.hosts.length);
        
        // Original: document.getElementById('ondemandCount').textContent = data.hosts.length;
        this.updateCount(data.hosts.length);
        
        // Original: GPU statistics update with exact same logic
        this.updateGpuStats(data.gpu_summary);
        
        // Original: Store the data for variant column rendering (CRITICAL - preserve this logic)
        const ondemandData = {
            name: data.name,
            hosts: data.hosts,
            variants: data.variants,
            gpu_summary: data.gpu_summary
        };
        
        // Original: window.Frontend.renderOnDemandVariantColumns(ondemandData);
        // CRITICAL: This is special for on-demand - it renders variant columns, not just hosts
        if (window.Frontend && window.Frontend.renderOnDemandVariantColumns) {
            window.Frontend.renderOnDemandVariantColumns(ondemandData);
        } else {
            console.error('❌ Frontend.renderOnDemandVariantColumns not available');
        }
    }
}

// Export for use by main script
window.OndemandColumn = OndemandColumn;