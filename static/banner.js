/**
 * System Overview Banner Component
 * 
 * Professional dashboard banner showing:
 * - Total GPU Usage across all columns
 * - NetBox inventory count (physical hosts)
 * - Columns total with comparison status
 */

/**
 * Update NetBox vs Columns inventory comparison
 */
function updateNetBoxInventoryComparison(data) {
    // Calculate total hosts from all columns
    let columnsTotal = 0;
    
    // Count hosts from each column
    if (data.runpod && data.runpod.hosts) {
        columnsTotal += data.runpod.hosts.length;
    }
    if (data.spot && data.spot.hosts) {
        columnsTotal += data.spot.hosts.length;
    }
    if (data.ondemand && data.ondemand.hosts) {
        columnsTotal += data.ondemand.hosts.length;
    }
    if (data.contracts && data.contracts.hosts) {
        columnsTotal += data.contracts.hosts.length;
    }
    if (data.outofstock && data.outofstock.hosts) {
        columnsTotal += data.outofstock.hosts.length;
    }
    
    // Get NetBox total from inventory validation data (pure NetBox count)
    let netboxTotal = 0;

    // Use the actual NetBox total from inventory validation (not influenced by OpenStack)
    if (data._inventory_validation && data._inventory_validation.netbox_total) {
        netboxTotal = data._inventory_validation.netbox_total;
    } else if (data.netbox_summary && data.netbox_summary.total_hosts) {
        netboxTotal = data.netbox_summary.total_hosts;
    } else {
        // Fallback: use columns total (this was causing the contamination bug)
        netboxTotal = columnsTotal;
    }
    
    // Update the display elements
    const netboxElement = document.getElementById('netboxInventoryCount');
    const columnsElement = document.getElementById('columnsInventoryCount');
    const statusElement = document.getElementById('inventoryStatus');
    
    if (netboxElement) {
        netboxElement.textContent = netboxTotal;
    }
    
    if (columnsElement) {
        columnsElement.textContent = columnsTotal;
    }
    
    if (statusElement) {
        const difference = netboxTotal - columnsTotal;
        if (difference === 0) {
            statusElement.innerHTML = '<i class="fas fa-check-circle text-success"></i> <span class="text-success">Perfect Match</span>';
        } else if (difference > 0) {
            statusElement.innerHTML = `<i class="fas fa-exclamation-triangle text-warning"></i> <span class="text-warning">${difference} missing from columns</span>`;
        } else {
            statusElement.innerHTML = `<i class="fas fa-plus-circle text-info"></i> <span class="text-info">${Math.abs(difference)} extra in columns</span>`;
        }
    }
    
    console.log(`📊 NetBox vs Columns: NetBox=${netboxTotal}, Columns=${columnsTotal}, Difference=${netboxTotal - columnsTotal}`);
}

// Make functions globally available
window.updateNetBoxInventoryComparison = updateNetBoxInventoryComparison;

console.log('📄 BANNER.JS: System overview banner component loaded');