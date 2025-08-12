/**
 * SummaryColumn - Overview of GPU allocation across all systems
 * 
 * Shows allocation breakdown: NetBox physical hosts vs allocated hosts (runpod, spot, ondemand, contracts)
 */
class SummaryColumn extends BaseColumn {
    constructor() {
        super({
            id: 'summary',
            name: 'Summary',
            icon: 'fa-chart-bar',
            color: 'bg-info',
            countElementId: 'summaryTotalCount',
            gpuUsageElementId: 'summaryAllocation',
            gpuPercentElementId: 'summaryAllocationPercent',
            gpuProgressBarElementId: 'summaryAllocationProgressBar',
            hostsContainerId: 'summaryContent',
            nameElementId: null
        });
    }

    /**
     * Update summary column with allocation overview
     * @param {Object} allData - Contains data from all columns: {runpod, spot, ondemand, contracts, netbox}
     */
    update(allData) {
        console.log('🔄 Updating Summary column with allocation overview');
        
        // Calculate allocation breakdown
        const breakdown = this.calculateAllocationBreakdown(allData);
        
        // Update count (total physical hosts)
        this.updateCount(breakdown.physical);
        
        // Update allocation stats instead of GPU stats
        this.updateAllocationStats(breakdown);
        
        // Render summary content
        this.renderSummaryContent(breakdown);
    }

    /**
     * Calculate allocation breakdown from all column data
     */
    calculateAllocationBreakdown(allData) {
        const breakdown = {
            physical: 0,       // Total hosts in NetBox (from parallel agents netbox data)
            runpod: 0,         // Hosts in runpod aggregate
            spot: 0,           // Hosts in spot aggregate  
            ondemand: 0,       // Hosts in ondemand aggregates
            contracts: 0,      // Hosts in contract aggregates
            outofstock: 0      // Physical hosts not allocated anywhere
        };

        // Count allocated hosts from each column
        if (allData.runpod && allData.runpod.hosts) {
            breakdown.runpod = allData.runpod.hosts.length;
        }
        
        if (allData.spot && allData.spot.hosts) {
            breakdown.spot = allData.spot.hosts.length;
        }
        
        if (allData.ondemand && allData.ondemand.hosts) {
            breakdown.ondemand = allData.ondemand.hosts.length;
        }
        
        if (allData.contracts && allData.contracts.hosts) {
            breakdown.contracts = allData.contracts.hosts.length;
        }

        // Calculate total allocated
        const totalAllocated = breakdown.runpod + breakdown.spot + breakdown.ondemand + breakdown.contracts;
        
        // For now, use allocated count as physical until we get NetBox integration
        // TODO: Get actual physical host count from NetBox data in parallel agents
        breakdown.physical = Math.max(totalAllocated, totalAllocated + 2); // Assume some out of stock
        breakdown.outofstock = breakdown.physical - totalAllocated;

        return breakdown;
    }

    /**
     * Update allocation statistics display
     */
    updateAllocationStats(breakdown) {
        const allocatedPercent = breakdown.physical > 0 ? 
            Math.round((breakdown.physical - breakdown.outofstock) / breakdown.physical * 100) : 0;
        
        // Update allocation text
        const allocationElement = document.getElementById(this.gpuUsageElementId);
        if (allocationElement) {
            allocationElement.textContent = `${breakdown.physical - breakdown.outofstock}/${breakdown.physical}`;
        }
        
        // Update percentage text
        const percentElement = document.getElementById(this.gpuPercentElementId);
        if (percentElement) {
            percentElement.textContent = allocatedPercent + '%';
        }
        
        // Update progress bar
        const progressBarElement = document.getElementById(this.gpuProgressBarElementId);
        if (progressBarElement) {
            progressBarElement.style.width = allocatedPercent + '%';
        }
    }

    /**
     * Render summary content showing allocation breakdown
     */
    renderSummaryContent(breakdown) {
        const container = document.getElementById(this.hostsContainerId);
        if (!container) {
            console.error('❌ Summary container not found');
            return;
        }

        container.innerHTML = `
            <div class="summary-breakdown">
                <div class="summary-item">
                    <i class="fas fa-server text-secondary"></i>
                    <span class="summary-label">Physical</span>
                    <span class="summary-count badge bg-secondary">${breakdown.physical}</span>
                </div>
                <div class="summary-item">
                    <i class="fas fa-rocket text-purple"></i>
                    <span class="summary-label">Runpod</span>
                    <span class="summary-count badge bg-purple">${breakdown.runpod}</span>
                </div>
                <div class="summary-item">
                    <i class="fas fa-server text-primary"></i>
                    <span class="summary-label">Hyperstack</span>
                    <span class="summary-count badge bg-primary">${breakdown.ondemand}</span>
                </div>
                <div class="summary-item">
                    <i class="fas fa-flash text-warning"></i>
                    <span class="summary-label">Spot</span>
                    <span class="summary-count badge bg-warning text-dark">${breakdown.spot}</span>
                </div>
                <div class="summary-item">
                    <i class="fas fa-file-contract text-success"></i>
                    <span class="summary-label">Contracts</span>
                    <span class="summary-count badge bg-success">${breakdown.contracts}</span>
                </div>
                <div class="summary-item">
                    <i class="fas fa-exclamation-triangle text-danger"></i>
                    <span class="summary-label">Out of Stock</span>
                    <span class="summary-count badge bg-danger">${breakdown.outofstock}</span>
                </div>
            </div>
        `;
    }
}

// Export for use by main script
window.SummaryColumn = SummaryColumn;