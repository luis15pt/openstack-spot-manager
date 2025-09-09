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
        // Use same logging pattern as other columns
        this.logUpdate(data.hosts ? data.hosts.length : 0);
        
        // Update count
        this.updateCount(data.hosts ? data.hosts.length : 0);
        
        // Update GPU statistics (for out of stock, this represents unused capacity)
        this.updateGpuStats(data.gpu_summary);
        
        // Render hosts using same pattern as other columns
        if (data.hosts && data.hosts.length > 0) {
            this.renderHosts(data.hosts, 'Out of Stock');
        } else {
            // Show empty state
            this.renderEmptyState();
        }
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
     * Calculate out of stock hosts by fetching from NetBox API
     * This fetches devices from NetBox that are not in active status and not in OpenStack
     */
    static async calculateOutOfStockHosts(allData) {
        try {
            console.log('🔍 Fetching out-of-stock devices from NetBox...');
            
            const response = await fetch('/api/outofstock-data', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const outofstockData = await response.json();
            
            console.log(`✅ Out-of-stock data received: ${outofstockData.hosts?.length || 0} devices`);
            
            // Log status breakdown if available for debugging
            if (outofstockData.status_breakdown) {
                const statusList = Object.entries(outofstockData.status_breakdown)
                    .map(([status, count]) => `${status}: ${count}`)
                    .join(', ');
                console.log(`📊 Status breakdown: ${statusList}`);
            }

            return {
                hosts: outofstockData.hosts || [],
                gpu_summary: outofstockData.gpu_summary || {
                    gpu_used: 0,
                    gpu_capacity: 0,
                    gpu_usage_ratio: '0/0'
                },
                name: outofstockData.name || 'Out of Stock',
                device_count: outofstockData.device_count || 0,
                status_breakdown: outofstockData.status_breakdown || {},
                error: outofstockData.error || null
            };

        } catch (error) {
            console.error('❌ Error fetching out-of-stock data:', error);
            
            // Return empty structure on error
            return {
                hosts: [],
                gpu_summary: {
                    gpu_used: 0,
                    gpu_capacity: 0,
                    gpu_usage_ratio: '0/0'
                },
                name: 'Out of Stock',
                error: error.message
            };
        }
    }
}

// Export for use by main script
window.OutOfStockColumn = OutOfStockColumn;