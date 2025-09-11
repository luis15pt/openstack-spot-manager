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
        
        // Update count
        this.updateCount(data.hosts ? data.hosts.length : 0);
        
        // Update GPU statistics (for out of stock, this represents unused capacity)
        this.updateGpuStats(data.gpu_summary);
        
        // Use standard host rendering like other columns for consistency
        if (data.hosts && data.hosts.length > 0) {
            // Display comprehensive status breakdown if available
            this.renderStatusBreakdown(data.breakdown_summary);
            
            // Use standard host rendering for consistent styling
            this.renderHosts(data.hosts, data.name);
        } else {
            // Show empty state
            this.renderEmptyState();
        }
    }

    /**
     * Render status breakdown summary
     */
    renderStatusBreakdown(breakdown) {
        if (!breakdown) return;
        
        const container = document.getElementById(this.hostsContainerId);
        if (!container) return;
        
        // Create breakdown summary HTML
        const breakdownItems = [];
        
        if (breakdown.netbox_non_active > 0) {
            breakdownItems.push(`<span class="status-badge status-failed">${breakdown.netbox_non_active} Failed/Offline</span>`);
        }
        if (breakdown.compute_disabled > 0) {
            breakdownItems.push(`<span class="status-badge status-disabled">${breakdown.compute_disabled} Service Disabled</span>`);
        }
        if (breakdown.in_tempest > 0) {
            breakdownItems.push(`<span class="status-badge status-testing">${breakdown.in_tempest} Testing/Tempest</span>`);
        }
        if (breakdown.not_in_openstack > 0) {
            breakdownItems.push(`<span class="status-badge status-unallocated">${breakdown.not_in_openstack} Not Allocated</span>`);
        }
        
        if (breakdownItems.length > 0) {
            const breakdownHtml = `
                <div class="out-of-stock-breakdown mb-3">
                    <div class="small text-muted mb-1">Status Breakdown:</div>
                    <div class="breakdown-badges">
                        ${breakdownItems.join(' ')}
                    </div>
                </div>
            `;
            
            // Insert at the beginning of the container
            container.insertAdjacentHTML('afterbegin', breakdownHtml);
        }
    }

    /**
     * Render out-of-stock hosts with status-specific styling
     */
    renderOutOfStockHosts(hosts) {
        const container = document.getElementById(this.hostsContainerId);
        if (!container) return;
        
        // Clear existing content
        container.innerHTML = '';
        
        // Group hosts by reason for better organization
        const hostsByReason = {};
        hosts.forEach(host => {
            const reason = host.outofstock_reason || 'Unknown';
            if (!hostsByReason[reason]) {
                hostsByReason[reason] = [];
            }
            hostsByReason[reason].push(host);
        });
        
        // Render each group
        Object.entries(hostsByReason).forEach(([reason, reasonHosts]) => {
            const groupHtml = `
                <div class="out-of-stock-group mb-3">
                    <div class="group-header">
                        <small class="text-muted">${reason} (${reasonHosts.length})</small>
                    </div>
                    <div class="host-list">
                        ${reasonHosts.map(host => this.renderOutOfStockHost(host)).join('')}
                    </div>
                </div>
            `;
            container.insertAdjacentHTML('beforeend', groupHtml);
        });
    }

    /**
     * Render individual out-of-stock host with appropriate styling
     */
    renderOutOfStockHost(host) {
        const statusClass = this.getStatusClass(host);
        const statusIcon = this.getStatusIcon(host);
        
        return `
            <div class="host-card ${statusClass} mb-2" data-hostname="${host.hostname}">
                <div class="d-flex justify-content-between align-items-center">
                    <div class="host-info">
                        <div class="host-name">
                            ${statusIcon} ${host.hostname}
                        </div>
                        <div class="host-details small text-muted">
                            ${host.site} | ${host.rack} | ${host.tenant}
                        </div>
                    </div>
                    <div class="host-status">
                        <span class="status-label">${host.status_label || host.status}</span>
                        <div class="gpu-info small">
                            ${host.gpu_capacity} GPUs
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Get CSS class for host status
     */
    getStatusClass(host) {
        const status = host.status?.toLowerCase();
        const reason = host.outofstock_reason?.toLowerCase() || '';
        
        if (status === 'failed' || reason.includes('failed')) return 'host-failed';
        if (status === 'offline' || reason.includes('offline')) return 'host-offline';
        if (reason.includes('disabled')) return 'host-disabled';
        if (reason.includes('tempest') || reason.includes('testing')) return 'host-testing';
        if (reason.includes('not allocated')) return 'host-unallocated';
        
        return 'host-unknown';
    }

    /**
     * Get status icon for host
     */
    getStatusIcon(host) {
        const status = host.status?.toLowerCase();
        const reason = host.outofstock_reason?.toLowerCase() || '';
        
        if (status === 'failed' || reason.includes('failed')) return '<i class="fas fa-times-circle text-danger"></i>';
        if (status === 'offline' || reason.includes('offline')) return '<i class="fas fa-power-off text-warning"></i>';
        if (reason.includes('disabled')) return '<i class="fas fa-ban text-secondary"></i>';
        if (reason.includes('tempest') || reason.includes('testing')) return '<i class="fas fa-flask text-info"></i>';
        if (reason.includes('not allocated')) return '<i class="fas fa-question-circle text-muted"></i>';
        
        return '<i class="fas fa-exclamation-triangle text-warning"></i>';
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