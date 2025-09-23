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
     * @param {Object} data - Contains outofstock hosts and summary with comprehensive breakdown
     */
    update(data) {
        // Use same logging pattern as other columns
        this.logUpdate(data.hosts ? data.hosts.length : 0);

        // Store hosts for search functionality
        if (data.hosts && data.hosts.length > 0) {
            this.setHosts(data.hosts);
        } else {
            this.setHosts([]);
            this.renderEmptyState();
        }

        // Update GPU statistics (for out of stock, this represents unused capacity)
        this.updateGpuStats(data.gpu_summary);

        // Note: renderHosts is now called by setHosts() with filtered results
    }





    /**
     * Render empty state when no out of stock hosts
     */
    renderEmptyState() {
        const container = document.getElementById(this.hostsContainerId);
        if (container) {
            container.innerHTML = `
                <div class="text-center text-muted p-3">
                    <i class="fas fa-check-circle fa-2x mb-2 text-success"></i>
                    <p class="mb-1"><strong>Perfect Inventory Health!</strong></p>
                    <p class="small mb-0">All GPU servers are allocated and operational</p>
                </div>
            `;
        }
    }

    /**
     * Calculate out of stock hosts from cached parallel agents data
     * Out-of-stock data is now computed and cached by the parallel agents system
     */
    static calculateOutOfStockHosts(allData) {
        // Out-of-stock data should be available in allData.outofstock from parallel agents
        if (allData && allData.outofstock) {
            console.log(`✅ Using cached out-of-stock data: ${allData.outofstock.hosts?.length || 0} devices`);
            
            // Log status breakdown if available for debugging
            if (allData.outofstock.status_breakdown) {
                const statusList = Object.entries(allData.outofstock.status_breakdown)
                    .map(([status, count]) => `${status}: ${count}`)
                    .join(', ');
                console.log(`📊 Status breakdown: ${statusList}`);
            }
            
            return allData.outofstock;
        }
        
        // Fallback if no cached data available
        console.log('⚠️ No cached out-of-stock data found, using empty fallback');
        return {
            hosts: [],
            gpu_summary: {
                gpu_used: 0,
                gpu_capacity: 0,
                gpu_usage_ratio: '0/0'
            },
            name: 'Out of Stock',
            device_count: 0,
            status_breakdown: {}
        };
    }
}

// Export for use by main script
window.OutOfStockColumn = OutOfStockColumn;