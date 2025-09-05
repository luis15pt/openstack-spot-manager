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
        
        // Update count (total GPU capacity)
        this.updateCount(breakdown.totalCapacity);
        
        // Update allocation stats instead of GPU stats
        this.updateAllocationStats(breakdown);
        
        // Render summary content
        this.renderSummaryContent(breakdown);
    }

    /**
     * Calculate GPU usage breakdown from all column data
     */
    calculateAllocationBreakdown(allData) {
        const breakdown = {
            // GPU usage data for each provider
            runpod: { used: 0, capacity: 0, percentage: 0, ratio: '0/0' },
            ondemand: { used: 0, capacity: 0, percentage: 0, ratio: '0/0' },
            spot: { used: 0, capacity: 0, percentage: 0, ratio: '0/0' },
            contracts: { used: 0, capacity: 0, percentage: 0, ratio: '0/0' },
            outofstock: { count: 0 },
            
            // Totals
            totalUsed: 0,
            totalCapacity: 0,
            totalPercentage: 0,
            unused: 0
        };

        // Extract Runpod GPU data
        if (allData.runpod && allData.runpod.gpu_summary) {
            const gpu = allData.runpod.gpu_summary;
            breakdown.runpod.used = gpu.gpu_used || 0;
            breakdown.runpod.capacity = gpu.gpu_capacity || 0;
            breakdown.runpod.ratio = gpu.gpu_usage_ratio || '0/0';
            breakdown.runpod.percentage = breakdown.runpod.capacity > 0 ? 
                Math.round((breakdown.runpod.used / breakdown.runpod.capacity) * 100) : 0;
        }
        
        // Extract On-demand GPU data
        if (allData.ondemand && allData.ondemand.gpu_summary) {
            const gpu = allData.ondemand.gpu_summary;
            breakdown.ondemand.used = gpu.gpu_used || 0;
            breakdown.ondemand.capacity = gpu.gpu_capacity || 0;
            breakdown.ondemand.ratio = gpu.gpu_usage_ratio || '0/0';
            breakdown.ondemand.percentage = breakdown.ondemand.capacity > 0 ? 
                Math.round((breakdown.ondemand.used / breakdown.ondemand.capacity) * 100) : 0;
        }
        
        // Extract Spot GPU data
        if (allData.spot && allData.spot.gpu_summary) {
            const gpu = allData.spot.gpu_summary;
            breakdown.spot.used = gpu.gpu_used || 0;
            breakdown.spot.capacity = gpu.gpu_capacity || 0;
            breakdown.spot.ratio = gpu.gpu_usage_ratio || '0/0';
            breakdown.spot.percentage = breakdown.spot.capacity > 0 ? 
                Math.round((breakdown.spot.used / breakdown.spot.capacity) * 100) : 0;
        }
        
        // Extract Contracts GPU data
        if (allData.contracts && allData.contracts.gpu_summary) {
            const gpu = allData.contracts.gpu_summary;
            breakdown.contracts.used = gpu.gpu_used || 0;
            breakdown.contracts.capacity = gpu.gpu_capacity || 0;
            breakdown.contracts.ratio = gpu.gpu_usage_ratio || '0/0';
            breakdown.contracts.percentage = breakdown.contracts.capacity > 0 ? 
                Math.round((breakdown.contracts.used / breakdown.contracts.capacity) * 100) : 0;
        }

        // Extract Out of Stock count
        if (allData.outofstock && allData.outofstock.hosts) {
            breakdown.outofstock.count = allData.outofstock.hosts.length;
        }

        // Calculate totals
        breakdown.totalUsed = breakdown.runpod.used + breakdown.ondemand.used + 
                             breakdown.spot.used + breakdown.contracts.used;
        breakdown.totalCapacity = breakdown.runpod.capacity + breakdown.ondemand.capacity + 
                                 breakdown.spot.capacity + breakdown.contracts.capacity;
        breakdown.totalPercentage = breakdown.totalCapacity > 0 ? 
            Math.round((breakdown.totalUsed / breakdown.totalCapacity) * 100) : 0;
        breakdown.unused = breakdown.totalCapacity - breakdown.totalUsed;

        return breakdown;
    }

    /**
     * Update allocation statistics display (using total GPU usage)
     */
    updateAllocationStats(breakdown) {
        // Update allocation text with total GPU usage
        const allocationElement = document.getElementById(this.gpuUsageElementId);
        if (allocationElement) {
            allocationElement.textContent = `${breakdown.totalUsed}/${breakdown.totalCapacity}`;
        }
        
        // Update percentage text
        const percentElement = document.getElementById(this.gpuPercentElementId);
        if (percentElement) {
            percentElement.textContent = breakdown.totalPercentage + '%';
        }
        
        // Update progress bar
        const progressBarElement = document.getElementById(this.gpuProgressBarElementId);
        if (progressBarElement) {
            progressBarElement.style.width = breakdown.totalPercentage + '%';
        }
    }

    /**
     * Render comprehensive GPU usage summary
     * Format: "Runpod 40/40 On-demand GPU Usage: 398/496 (80%), spot GPU Usage: 10/32 (31%)"
     *         "Contracts GPU Usage: 24/32 (75%) Out of Stock 0"
     *         "Unused: 0/0 (0%)"
     */
    renderSummaryContent(breakdown) {
        const container = document.getElementById(this.hostsContainerId);
        if (!container) {
            console.error('❌ Summary container not found');
            return;
        }

        // Generate comprehensive summary text in requested format
        const line1 = `Runpod ${breakdown.runpod.ratio} On-demand GPU Usage: ${breakdown.ondemand.ratio} (${breakdown.ondemand.percentage}%), spot GPU Usage: ${breakdown.spot.ratio} (${breakdown.spot.percentage}%)`;
        const line2 = `Contracts GPU Usage: ${breakdown.contracts.ratio} (${breakdown.contracts.percentage}%) Out of Stock ${breakdown.outofstock.count}`;
        const line3 = `Unused: ${breakdown.unused}/${breakdown.totalCapacity} (${breakdown.totalCapacity > 0 ? Math.round((breakdown.unused / breakdown.totalCapacity) * 100) : 0}%)`;

        container.innerHTML = `
            <div class="summary-text mb-3">
                <div class="comprehensive-summary">
                    <p class="summary-line mb-1"><strong>${line1}</strong></p>
                    <p class="summary-line mb-1"><strong>${line2}</strong></p>
                    <p class="summary-line mb-2"><strong>${line3}</strong></p>
                </div>
            </div>
            <div class="summary-breakdown">
                <div class="summary-item">
                    <i class="fas fa-rocket" style="color: #6f42c1;"></i>
                    <span class="summary-label">Runpod</span>
                    <span class="summary-usage">${breakdown.runpod.ratio}</span>
                    <span class="summary-percent badge bg-purple">${breakdown.runpod.percentage}%</span>
                </div>
                <div class="summary-item">
                    <i class="fas fa-server text-primary"></i>
                    <span class="summary-label">On-demand</span>
                    <span class="summary-usage">${breakdown.ondemand.ratio}</span>
                    <span class="summary-percent badge bg-primary">${breakdown.ondemand.percentage}%</span>
                </div>
                <div class="summary-item">
                    <i class="fas fa-flash text-warning"></i>
                    <span class="summary-label">Spot</span>
                    <span class="summary-usage">${breakdown.spot.ratio}</span>
                    <span class="summary-percent badge bg-warning text-dark">${breakdown.spot.percentage}%</span>
                </div>
                <div class="summary-item">
                    <i class="fas fa-file-contract text-success"></i>
                    <span class="summary-label">Contracts</span>
                    <span class="summary-usage">${breakdown.contracts.ratio}</span>
                    <span class="summary-percent badge bg-success">${breakdown.contracts.percentage}%</span>
                </div>
                <div class="summary-item">
                    <i class="fas fa-exclamation-triangle text-danger"></i>
                    <span class="summary-label">Out of Stock</span>
                    <span class="summary-count badge bg-danger">${breakdown.outofstock.count} hosts</span>
                </div>
                <div class="summary-item">
                    <i class="fas fa-chart-line text-info"></i>
                    <span class="summary-label">Total Usage</span>
                    <span class="summary-usage">${breakdown.totalUsed}/${breakdown.totalCapacity}</span>
                    <span class="summary-percent badge bg-info">${breakdown.totalPercentage}%</span>
                </div>
            </div>
        `;
    }
}

// Export for use by main script
window.SummaryColumn = SummaryColumn;