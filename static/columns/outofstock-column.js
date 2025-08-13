/**
 * OutOfStockColumn - Hosts that are physically present but not allocated
 * 
 * Simple implementation showing hosts in NetBox but not in any OpenStack aggregate
 */
class OutOfStockColumn extends BaseColumn {
    constructor() {
        super({
            id: 'outofstock',
            name: 'Out of Stock',
            icon: 'fa-exclamation-triangle',
            color: 'bg-danger',
            countElementId: 'outofstockCount',
            gpuUsageElementId: 'outofstockGpuUsage',
            gpuPercentElementId: 'outofstockGpuPercent',
            gpuProgressBarElementId: 'outofstockGpuProgressBar',
            hostsContainerId: 'outofstockHosts',
            nameElementId: null // Out of Stock name is fixed in HTML
        });
    }

    /**
     * Update out of stock column
     * @param {Object} data - Contains outofstock hosts and summary
     */
    update(data) {
        console.log('🔄 OUT OF STOCK COLUMN: Starting update');
        console.log('📊 OUT OF STOCK COLUMN: Received data:', data);
        
        // Use same logging pattern as other columns
        this.logUpdate(data.hosts ? data.hosts.length : 0);
        
        // Update count
        const hostCount = data.hosts ? data.hosts.length : 0;
        console.log('🔢 OUT OF STOCK COLUMN: Updating count to:', hostCount);
        this.updateCount(hostCount);
        
        // Update GPU statistics (for out of stock, this represents unused capacity)
        console.log('📊 OUT OF STOCK COLUMN: Updating GPU stats:', data.gpu_summary);
        this.updateGpuStats(data.gpu_summary);
        
        // Render hosts using same pattern as other columns
        if (data.hosts && data.hosts.length > 0) {
            console.log('🎨 OUT OF STOCK COLUMN: Rendering', data.hosts.length, 'hosts');
            this.renderHosts(data.hosts, 'Out of Stock');
        } else {
            console.log('🎨 OUT OF STOCK COLUMN: Rendering empty state');
            // Show empty state
            this.renderEmptyState();
        }
        
        console.log('✅ OUT OF STOCK COLUMN: Update completed successfully');
    }

    /**
     * Render empty state when no out of stock hosts
     */
    renderEmptyState() {
        const container = document.getElementById(this.hostsContainerId);
        if (container) {
            container.innerHTML = `
                <div class="text-center text-muted p-3">
                    <i class="fas fa-check-circle fa-2x mb-2"></i>
                    <p class="small mb-0">All hosts allocated</p>
                </div>
            `;
        }
    }

    /**
     * Calculate out of stock hosts from all data
     * This is a utility function that can be called by the main script
     */
    static calculateOutOfStockHosts(allData) {
        // For now, simple implementation - return empty array
        // TODO: Implement actual NetBox vs OpenStack comparison
        
        const outOfStockHosts = [];
        
        // Calculate GPU summary for out of stock (unused capacity)
        const gpu_summary = {
            gpu_used: 0,
            gpu_capacity: outOfStockHosts.length * 8, // Assume 8 GPUs per host
            gpu_usage_ratio: `0/${outOfStockHosts.length * 8}`
        };

        return {
            hosts: outOfStockHosts,
            gpu_summary: gpu_summary,
            name: 'Out of Stock'
        };
    }
}

// Export for use by main script
window.OutOfStockColumn = OutOfStockColumn;