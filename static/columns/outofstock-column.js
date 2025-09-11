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
        
        // Use proper Available/In Use grouping like other columns
        if (data.hosts && data.hosts.length > 0) {
            this.renderOutOfStockWithGrouping(data.hosts);
        } else {
            // Show empty state
            this.renderEmptyState();
        }
    }

    /**
     * Render out-of-stock hosts with Available/In Use grouping by owner organization
     */
    renderOutOfStockWithGrouping(hosts) {
        const container = document.getElementById(this.hostsContainerId);
        if (!container) return;

        // Clear existing content
        container.innerHTML = '';

        // Group hosts by GPU usage (Available vs In Use) then by owner
        const availableHosts = hosts.filter(host => (host.gpu_used || 0) === 0);
        const inUseHosts = hosts.filter(host => (host.gpu_used || 0) > 0);

        // Render Available section
        if (availableHosts.length > 0) {
            this.renderOwnerGroupSection(container, 'Available', availableHosts);
        }

        // Render In Use section  
        if (inUseHosts.length > 0) {
            this.renderOwnerGroupSection(container, 'In Use', inUseHosts);
        }
    }

    /**
     * Render a section (Available/In Use) grouped by owner organization
     */
    renderOwnerGroupSection(container, sectionTitle, hosts) {
        // Group by owner organization
        const nexgenHosts = hosts.filter(host => host.owner_group === 'Nexgen Cloud');
        const investorHosts = hosts.filter(host => host.owner_group === 'Investors');

        // Section header
        const sectionHtml = `
            <div class="host-section mb-3">
                <h6 class="text-muted mb-2">
                    <i class="fas fa-${sectionTitle === 'Available' ? 'circle' : 'play-circle'} me-1"></i>
                    ${sectionTitle} (${hosts.length})
                </h6>
                <div class="owner-groups">
                    ${nexgenHosts.length > 0 ? this.renderOwnerGroup('Nexgen Cloud', nexgenHosts) : ''}
                    ${investorHosts.length > 0 ? this.renderOwnerGroup('Investors', investorHosts) : ''}
                </div>
            </div>
        `;
        
        container.insertAdjacentHTML('beforeend', sectionHtml);
    }

    /**
     * Render hosts grouped by owner with outofstock_reason using standard compact cards
     */
    renderOwnerGroup(ownerGroup, hosts) {
        // Group by outofstock_reason
        const reasonGroups = {};
        hosts.forEach(host => {
            const reason = host.outofstock_reason || 'Unknown reason';
            if (!reasonGroups[reason]) {
                reasonGroups[reason] = [];
            }
            reasonGroups[reason].push(host);
        });

        const reasonGroupsHtml = Object.entries(reasonGroups).map(([reason, reasonHosts]) => `
            <div class="reason-group mb-2">
                <div class="small text-muted mb-1">${reason} (${reasonHosts.length})</div>
                <div class="host-cards-compact">
                    ${reasonHosts.map(host => window.Frontend.createHostCardCompact(host, 'outofstock', 'Out of Stock')).join('')}
                </div>
            </div>
        `).join('');

        return `
            <div class="owner-group mb-3">
                <div class="fw-bold mb-2">
                    <i class="fas fa-building me-1"></i>
                    ${ownerGroup} (${hosts.length})
                </div>
                ${reasonGroupsHtml}
            </div>
        `;
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