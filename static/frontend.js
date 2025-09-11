// Frontend UI operations for OpenStack Spot Manager
// EXACT ORIGINAL FUNCTIONS - only variable names changed for modular access

// Global state variables - exact match to original
let currentGpuType = '';
let selectedHosts = new Set();
let aggregateData = {};
let pendingOperations = [];
let availableGpuTypes = [];
let isExecutionInProgress = false;

// EXACT ORIGINAL renderAggregateData function
function renderAggregateData(data) {
    console.log('🔥 renderAggregateData called for GPU type:', data.gpu_type);
    
    // FIRST: Clean up any existing variant columns from previous GPU type selections
    // This prevents duplicate columns when switching between GPU types or refreshing
    console.log('🧹 Starting aggressive column cleanup...');
    
    // Remove any existing variant columns specifically (these are dynamically created)
    const existingVariantColumns = document.querySelectorAll('[id*="VariantColumn"], [class*="variant-column"]');
    console.log(`🔍 Found ${existingVariantColumns.length} variant columns to remove`);
    existingVariantColumns.forEach(col => {
        console.log('🗑️ Removing variant column:', col.id);
        col.remove();
    });
    
    // Also check in the main hosts row for any bootstrap columns
    const mainRow = document.getElementById('hostsRow');
    if (mainRow) {
        // Get all column divs - use more comprehensive selector
        const existingColumns = mainRow.querySelectorAll('[class*="col-md-"], [class*="col-lg-"], [class*="col-sm-"], [class*="col-xl-"], .col');
        console.log(`🔍 Found ${existingColumns.length} columns to check in hostsRow`);
        
        existingColumns.forEach((col, index) => {
            const columnDiv = col.querySelector('.aggregate-column');
            
            // Debug logging to see what we're finding
            console.log(`🔍 Column ${index}:`, {
                colId: col.id,
                columnDivId: columnDiv ? columnDiv.id : 'no div',
                classList: col.classList.toString(),
                innerHTML: col.innerHTML.substring(0, 100) + '...'
            });
            
            // More aggressive: check if this column contains any of the core aggregate IDs
            const hasRunpodColumn = col.querySelector('#runpodColumn');
            const hasSpotColumn = col.querySelector('#spotColumn');
            const hasOndemandColumn = col.querySelector('#ondemandColumn');
            const hasContractColumn = col.querySelector('#contractAggregateColumn');
            
            const isCoreColumn = col.id === 'ondemandColumnFallback' || 
                               col.id === 'contractColumn' ||
                               col.querySelector('#summaryColumn') ||     // Summary column (v0.2)
                               col.querySelector('#outofstockColumn') ||  // Out of Stock column (v0.2)
                               hasRunpodColumn || hasSpotColumn || hasOndemandColumn || hasContractColumn;
            
            if (!isCoreColumn) {
                // This is a dynamically added variant column - remove it
                console.log('🗑️ AGGRESSIVE cleanup: Removing non-core column:', {
                    colId: col.id,
                    columnDivId: columnDiv ? columnDiv.id : 'no div'
                });
                col.remove();
            } else {
                console.log('✅ Keeping core column:', {
                    colId: col.id,
                    columnDivId: columnDiv ? columnDiv.id : 'no div',
                    reason: col.id === 'ondemandColumnFallback' ? 'fallback' : 
                           col.id === 'contractColumn' ? 'contract' :
                           col.querySelector('#summaryColumn') ? 'summary' :
                           col.querySelector('#outofstockColumn') ? 'outofstock' :
                           hasRunpodColumn ? 'runpod' :
                           hasSpotColumn ? 'spot' :
                           hasOndemandColumn ? 'ondemand' :
                           hasContractColumn ? 'contract-aggregate' : 'unknown'
                });
            }
        });
    }
    
    // Clear existing content
    document.getElementById('ondemandHosts').innerHTML = '';
    document.getElementById('runpodHosts').innerHTML = '';
    document.getElementById('spotHosts').innerHTML = '';
    
    // Clear GPU usage statistics first before updating with new data
    const ondemandGpuUsage = document.getElementById('ondemandGpuUsage');
    const ondemandGpuPercent = document.getElementById('ondemandGpuPercent');
    const ondemandGpuProgressBar = document.getElementById('ondemandGpuProgressBar');
    const runpodGpuUsage = document.getElementById('runpodGpuUsage');
    const runpodGpuPercent = document.getElementById('runpodGpuPercent');
    const runpodGpuProgressBar = document.getElementById('runpodGpuProgressBar');
    const spotGpuUsage = document.getElementById('spotGpuUsage');
    const spotGpuPercent = document.getElementById('spotGpuPercent');
    const spotGpuProgressBar = document.getElementById('spotGpuProgressBar');
    
    if (ondemandGpuUsage) ondemandGpuUsage.textContent = '0/0';
    if (ondemandGpuPercent) ondemandGpuPercent.textContent = '0%';
    if (ondemandGpuProgressBar) ondemandGpuProgressBar.style.width = '0%';
    if (runpodGpuUsage) runpodGpuUsage.textContent = '0/0';
    if (runpodGpuPercent) runpodGpuPercent.textContent = '0%';
    if (runpodGpuProgressBar) runpodGpuProgressBar.style.width = '0%';
    if (spotGpuUsage) spotGpuUsage.textContent = '0/0';
    if (spotGpuPercent) spotGpuPercent.textContent = '0%';
    if (spotGpuProgressBar) spotGpuProgressBar.style.width = '0%';
    
    // Update column headers - keep On-Demand detailed, simplify RunPod/Spot
    document.getElementById('ondemandName').textContent = data.ondemand.name || 'N/A';
    document.getElementById('runpodName').textContent = 'RunPod';
    document.getElementById('spotName').textContent = 'Spot';
    
    // Show variant information if multiple variants exist
    if (data.ondemand.variants && data.ondemand.variants.length > 1) {
        const variantNames = data.ondemand.variants.map(v => v.variant).join(', ');
        document.getElementById('ondemandName').title = `Includes variants: ${variantNames}`;
    }
    
    // Add tooltips to show actual aggregate names for RunPod/Spot
    document.getElementById('runpodName').title = data.runpod.name || 'RunPod aggregate';
    document.getElementById('spotName').title = data.spot.name || 'Spot aggregate';
    
    document.getElementById('ondemandCount').textContent = data.ondemand.hosts ? data.ondemand.hosts.length : 0;
    document.getElementById('runpodCount').textContent = data.runpod.hosts ? data.runpod.hosts.length : 0;
    document.getElementById('spotCount').textContent = data.spot.hosts ? data.spot.hosts.length : 0;
    
    // Update per-column GPU statistics
    if (data.ondemand.gpu_summary) {
        const ondemandPercent = Math.round((data.ondemand.gpu_summary.gpu_used / data.ondemand.gpu_summary.gpu_capacity) * 100) || 0;
        document.getElementById('ondemandGpuUsage').textContent = data.ondemand.gpu_summary.gpu_usage_ratio;
        document.getElementById('ondemandGpuPercent').textContent = ondemandPercent + '%';
        document.getElementById('ondemandGpuProgressBar').style.width = ondemandPercent + '%';
    }
    if (data.spot.gpu_summary) {
        const spotPercent = Math.round((data.spot.gpu_summary.gpu_used / data.spot.gpu_summary.gpu_capacity) * 100) || 0;
        document.getElementById('spotGpuUsage').textContent = data.spot.gpu_summary.gpu_usage_ratio;
        document.getElementById('spotGpuPercent').textContent = spotPercent + '%';
        document.getElementById('spotGpuProgressBar').style.width = spotPercent + '%';
    }
    
    // Update RunPod GPU statistics
    if (data.runpod.gpu_summary) {
        const runpodPercent = Math.round((data.runpod.gpu_summary.gpu_used / data.runpod.gpu_summary.gpu_capacity) * 100) || 0;
        document.getElementById('runpodGpuUsage').textContent = data.runpod.gpu_summary.gpu_usage_ratio;
        document.getElementById('runpodGpuPercent').textContent = runpodPercent + '%';
        document.getElementById('runpodGpuProgressBar').style.width = runpodPercent + '%';
    }
    
    // Update overall summary banner
    if (data.gpu_overview) {
        document.getElementById('totalGpuUsage').textContent = data.gpu_overview.gpu_usage_ratio + ' GPUs';
        document.getElementById('gpuUsagePercentage').textContent = data.gpu_overview.gpu_usage_percentage + '%';
        // Legacy progress bar elements removed in new design
    }
    
    // Calculate and update overall host statistics
    let totalAvailableHosts = 0;
    let totalInUseHosts = 0;
    
    [data.ondemand.hosts, data.runpod.hosts, data.spot.hosts].forEach(hostArray => {
        if (hostArray) {
            hostArray.forEach(host => {
                if (host.has_vms) {
                    totalInUseHosts++;
                } else {
                    totalAvailableHosts++;
                }
            });
        }
    });
    
    
    // Calculate and update total GPU usage across ALL columns (runpod, spot, ondemand variants, contracts)
    let totalGpuUsed = 0;
    let totalGpuCapacity = 0;
    
    // Add RunPod GPUs
    if (data.runpod && data.runpod.gpu_summary) {
        totalGpuUsed += data.runpod.gpu_summary.gpu_used || 0;
        totalGpuCapacity += data.runpod.gpu_summary.gpu_capacity || 0;
    }
    
    // Add Spot GPUs
    if (data.spot && data.spot.gpu_summary) {
        totalGpuUsed += data.spot.gpu_summary.gpu_used || 0;
        totalGpuCapacity += data.spot.gpu_summary.gpu_capacity || 0;
    }
    
    // Add On-Demand GPUs (including all NVLink variants)
    if (data.ondemand && data.ondemand.gpu_summary) {
        totalGpuUsed += data.ondemand.gpu_summary.gpu_used || 0;
        totalGpuCapacity += data.ondemand.gpu_summary.gpu_capacity || 0;
    }
    
    // Add Contract GPUs (get from loaded contract data)
    const contractGpuData = getContractGpuTotals();
    if (contractGpuData) {
        totalGpuUsed += contractGpuData.used || 0;
        totalGpuCapacity += contractGpuData.capacity || 0;
    }
    
    // Add Out-of-Stock GPUs (capacity only, usage should be 0)
    if (data.outofstock && data.outofstock.gpu_summary) {
        totalGpuUsed += data.outofstock.gpu_summary.gpu_used || 0;
        totalGpuCapacity += data.outofstock.gpu_summary.gpu_capacity || 0;
    }
    
    // Update total GPU display
    const totalGpuPercentage = totalGpuCapacity > 0 ? Math.round((totalGpuUsed / totalGpuCapacity) * 100) : 0;
    document.getElementById('totalGpuUsage').textContent = `${totalGpuUsed}/${totalGpuCapacity} GPUs`;
    document.getElementById('gpuUsagePercentage').textContent = `${totalGpuPercentage}%`;
    
    console.log(`📊 Total GPU Usage: ${totalGpuUsed}/${totalGpuCapacity} (${totalGpuPercentage}%) - RunPod: ${data.runpod?.gpu_summary?.gpu_used || 0}, Spot: ${data.spot?.gpu_summary?.gpu_used || 0}, OnDemand: ${data.ondemand?.gpu_summary?.gpu_used || 0}, Contracts: ${contractGpuData?.used || 0}, OutOfStock: ${data.outofstock?.gpu_summary?.gpu_capacity || 0} capacity`);
    
    // Update NetBox vs Columns comparison (handled by banner.js)
    if (window.updateNetBoxInventoryComparison) {
        window.updateNetBoxInventoryComparison(data);
    }
    
    // Store data for other functions
    aggregateData = data;
    
    // Render On-Demand variants as separate columns only if NVLink variants exist
    if (data.ondemand.hosts) {
        renderOnDemandVariantColumns(data.ondemand);
    }
    if (data.runpod.hosts) {
        renderHosts('runpodHosts', data.runpod.hosts, 'runpod', data.runpod.name);
    }
    if (data.spot.hosts) {
        renderHosts('spotHosts', data.spot.hosts, 'spot', data.spot.name);
    }
    
    // Update Contract column (v0.2) - use same data as other columns
    if (window.columns && window.columns.contract) {
        console.log('🔄 Updating Contract column using same data as other columns');
        window.columns.contract.update(data);
    }
    
    // Update Out of Stock column directly (Summary column removed)
    // Handle special case where outofstock API returns nested structure
    if (data.gpu_type === 'outofstock' && data.outofstock) {
        console.log(`✅ Using outofstock API response: ${data.outofstock.hosts?.length || 0} devices`);
        // Restructure for compatibility with existing frontend code
        data.outofstock = data.outofstock;
    } else if (!data.outofstock) {
        console.log('⚠️ No out-of-stock data found in cached results, using empty fallback');
        data.outofstock = { hosts: [], gpu_summary: { gpu_used: 0, gpu_capacity: 0, gpu_usage_ratio: '0/0' }, name: 'Out of Stock' };
    } else {
        console.log(`✅ Using cached out-of-stock data: ${data.outofstock.hosts?.length || 0} devices`);
    }
    
    // Update the Out of Stock column if it exists
    if (window.columns && window.columns.outofstock && data.outofstock) {
        console.log('🔄 Updating Out of Stock column with cached data');
        window.columns.outofstock.update(data.outofstock);
    }
    
    // Setup drag and drop
    setupDragAndDrop();
}

// EXACT ORIGINAL renderHosts function
function renderHosts(containerId, hosts, type, aggregateName = null, variants = null) {
    const container = document.getElementById(containerId);
    
    if (!container) {
        console.error(`❌ Container element '${containerId}' not found for renderHosts`);
        return;
    }
    
    if (hosts.length === 0) {
        container.innerHTML = `
            <div class="drop-zone" data-type="${type}">
                <div class="empty-state">
                    <i class="fas fa-server"></i>
                    <p>No hosts in this aggregate</p>
                </div>
            </div>
        `;
        
        // Re-setup drag and drop for new elements
        setupDragAndDrop();
        return;
    }
    
    // If this is on-demand with multiple variants, render by variant
    if (type === 'ondemand' && variants && variants.length > 1) {
        console.log('🔍 Detected multiple variants for ondemand:', {
            variantCount: variants.length,
            hostCount: hosts.length,
            variants: variants
        });
        renderOnDemandVariants(container, hosts, variants);
        return;
    }
    
    // Separate hosts into groups
    const availableHosts = hosts.filter(host => !host.has_vms);
    const inUseHosts = hosts.filter(host => host.has_vms);
    
    // Create sections
    let sectionsHtml = '';
    
    // Available hosts section (shown first - most likely to be moved)
    if (availableHosts.length > 0) {
        // Group available hosts by owner
        const nexgenHosts = availableHosts.filter(host => host.owner_group === 'Nexgen Cloud');
        const investorHosts = availableHosts.filter(host => host.owner_group === 'Investors');
        
        const availableId = `available-${type}`;
        let availableSubGroups = '';
        
        // Nexgen Cloud devices sub-group
        if (nexgenHosts.length > 0) {
            const nexgenCards = nexgenHosts.map(host => createHostCardCompact(host, type, aggregateName)).join('');
            const nexgenSubGroupId = `available-nexgen-${type}`;
            
            availableSubGroups += `
                <div class="host-subgroup nexgen-group">
                    <div class="host-subgroup-header clickable" onclick="toggleGroup('${nexgenSubGroupId}')">
                        <i class="fas fa-cloud text-info"></i>
                        <span class="subgroup-title">Nexgen Cloud (${nexgenHosts.length})</span>
                        <i class="fas fa-chevron-right toggle-icon" id="${nexgenSubGroupId}-icon"></i>
                    </div>
                    <div class="host-subgroup-content collapsed" id="${nexgenSubGroupId}">
                        <div class="host-cards-compact">
                            ${nexgenCards}
                        </div>
                    </div>
                </div>
            `;
        }
        
        // Investor devices sub-group
        if (investorHosts.length > 0) {
            const investorCards = investorHosts.map(host => createHostCardCompact(host, type, aggregateName)).join('');
            const investorSubGroupId = `available-investors-${type}`;
            
            availableSubGroups += `
                <div class="host-subgroup investors-group">
                    <div class="host-subgroup-header clickable" onclick="toggleGroup('${investorSubGroupId}')">
                        <i class="fas fa-users text-warning"></i>
                        <span class="subgroup-title">Investor Devices (${investorHosts.length})</span>
                        <i class="fas fa-chevron-right toggle-icon" id="${investorSubGroupId}-icon"></i>
                    </div>
                    <div class="host-subgroup-content collapsed" id="${investorSubGroupId}">
                        <div class="host-cards-compact">
                            ${investorCards}
                        </div>
                    </div>
                </div>
            `;
        }
        
        sectionsHtml += `
            <div class="host-group">
                <div class="host-group-header clickable" onclick="toggleGroup('${availableId}')">
                    <i class="fas fa-circle-check text-success"></i>
                    <h6 class="mb-0">Available (${availableHosts.length})</h6>
                    <i class="fas fa-chevron-right toggle-icon" id="${availableId}-icon"></i>
                </div>
                <div class="host-group-content collapsed" id="${availableId}">
                    ${availableSubGroups}
                </div>
            </div>
        `;
    }
    
    // In-use hosts section
    if (inUseHosts.length > 0) {
        const inUseId = `inuse-${type}`;
        let inUseSubGroups = '';
        
        // For all aggregates (runpod, spot, ondemand), group by GPU usage
        const hostsByGpuUsage = {};
        inUseHosts.forEach(host => {
            const gpuUsage = host.gpu_used || 0;
            if (!hostsByGpuUsage[gpuUsage]) {
                hostsByGpuUsage[gpuUsage] = [];
            }
            hostsByGpuUsage[gpuUsage].push(host);
        });
        
        Object.keys(hostsByGpuUsage).sort((a, b) => b - a).forEach(gpuUsage => {
            const hostsInGroup = hostsByGpuUsage[gpuUsage];
            const subGroupId = `inuse-${type}-${gpuUsage}gpus`;
            const cards = hostsInGroup.map(host => createHostCardCompact(host, type, aggregateName)).join('');
            
            inUseSubGroups += `
                <div class="host-subgroup gpu-group">
                    <div class="host-subgroup-header clickable" onclick="toggleGroup('${subGroupId}')">
                        <i class="fas fa-microchip text-danger"></i>
                        <span class="subgroup-title">${gpuUsage} GPU${gpuUsage != 1 ? 's' : ''} (${hostsInGroup.length})</span>
                        <i class="fas fa-chevron-right toggle-icon" id="${subGroupId}-icon"></i>
                    </div>
                    <div class="host-subgroup-content collapsed" id="${subGroupId}">
                        <div class="host-cards-compact">
                            ${cards}
                        </div>
                    </div>
                </div>
            `;
        });
        
        sectionsHtml += `
            <div class="host-group">
                <div class="host-group-header clickable" onclick="toggleGroup('${inUseId}')">
                    <i class="fas fa-exclamation-triangle text-warning"></i>
                    <h6 class="mb-0">In Use (${inUseHosts.length})</h6>
                    <i class="fas fa-chevron-right toggle-icon" id="${inUseId}-icon"></i>
                </div>
                <div class="host-group-content collapsed" id="${inUseId}">
                    ${inUseSubGroups}
                </div>
            </div>
        `;
    }
    
    // No need to add drop zones anymore - entire columns are now drop zones
    
    container.innerHTML = sectionsHtml;
    
    // Re-setup drag and drop for new elements
    setupDragAndDrop();
}

// EXACT ORIGINAL renderOnDemandVariants function
function renderOnDemandVariants(container, hosts, variants) {
    console.log('🔍 renderOnDemandVariants called with:', {
        container: container.id,
        hosts: hosts.length,
        variants: variants
    });
    
    let variantsHtml = '';
    
    // Create a section for each variant with collapsible structure
    variants.forEach((variant, index) => {
        const variantHosts = hosts.filter(host => host.variant === variant.aggregate);
        console.log(`🔍 Variant ${variant.variant}:`, {
            aggregate: variant.aggregate,
            filteredHosts: variantHosts.length,
            sampleHost: hosts[0] ? {
                name: hosts[0].name,
                variant: hosts[0].variant,
                has_vms: hosts[0].has_vms
            } : 'No hosts'
        });
        const variantId = `variant-${variant.aggregate.replace(/[^a-zA-Z0-9]/g, '-')}`;
        
        if (variantHosts.length === 0) {
            variantsHtml += `
                <div class="host-group">
                    <div class="host-group-header clickable" onclick="toggleGroup('${variantId}')">
                        <i class="fas fa-microchip text-primary"></i>
                        <h6>${variant.variant} <span class="badge bg-secondary ms-2">0</span></h6>
                        <small class="text-muted">No hosts available</small>
                        <i class="fas fa-chevron-right toggle-icon" id="${variantId}-icon"></i>
                    </div>
                    <div class="host-group-content collapsed" id="${variantId}">
                        <div class="drop-zone" data-type="ondemand" data-variant="${variant.aggregate}">
                            <div class="empty-state">
                                <i class="fas fa-server"></i>
                                <p>No hosts in this variant</p>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            return;
        }
        
        // Separate hosts into groups
        const availableHosts = variantHosts.filter(host => !host.has_vms);
        const inUseHosts = variantHosts.filter(host => host.has_vms);
        
        let sectionsHtml = '';
        
        // Available hosts section
        if (availableHosts.length > 0) {
            // Group available hosts by owner
            const nexgenHosts = availableHosts.filter(host => host.owner_group === 'Nexgen Cloud');
            const investorHosts = availableHosts.filter(host => host.owner_group === 'Investors');
            
            const availableId = `available-${variant.aggregate}`;
            let availableSubGroups = '';
            
            // Nexgen Cloud devices sub-group
            if (nexgenHosts.length > 0) {
                const nexgenCards = nexgenHosts.map(host => createHostCardCompact(host, 'ondemand', variant.aggregate)).join('');
                const nexgenSubGroupId = `available-nexgen-${variant.aggregate}`;
                
                availableSubGroups += `
                    <div class="host-subgroup nexgen-group">
                        <div class="host-subgroup-header clickable" onclick="toggleGroup('${nexgenSubGroupId}')">
                            <i class="fas fa-cloud text-info"></i>
                            <span class="subgroup-title">Nexgen Cloud (${nexgenHosts.length})</span>
                            <i class="fas fa-chevron-right toggle-icon" id="${nexgenSubGroupId}-icon"></i>
                        </div>
                        <div class="host-subgroup-content collapsed" id="${nexgenSubGroupId}">
                            <div class="host-cards-compact">
                                ${nexgenCards}
                            </div>
                        </div>
                    </div>
                `;
            }
            
            // Investors devices sub-group
            if (investorHosts.length > 0) {
                const investorCards = investorHosts.map(host => createHostCardCompact(host, 'ondemand', variant.aggregate)).join('');
                const investorSubGroupId = `available-investor-${variant.aggregate}`;
                
                availableSubGroups += `
                    <div class="host-subgroup investors-group">
                        <div class="host-subgroup-header clickable" onclick="toggleGroup('${investorSubGroupId}')">
                            <i class="fas fa-users text-warning"></i>
                            <span class="subgroup-title">Investor Devices (${investorHosts.length})</span>
                            <i class="fas fa-chevron-right toggle-icon" id="${investorSubGroupId}-icon"></i>
                        </div>
                        <div class="host-subgroup-content collapsed" id="${investorSubGroupId}">
                            <div class="host-cards-compact">
                                ${investorCards}
                            </div>
                        </div>
                    </div>
                `;
            }
            
            sectionsHtml += `
                <div class="host-group">
                    <div class="host-group-header clickable" onclick="toggleGroup('${availableId}')">
                        <i class="fas fa-check-circle text-success"></i>
                        <h6>Available (${availableHosts.length})</h6>
                        <small class="text-muted">Ready for deployment</small>
                        <i class="fas fa-chevron-right toggle-icon" id="${availableId}-icon"></i>
                    </div>
                    <div class="host-group-content collapsed" id="${availableId}">
                        <div class="subgroups-container">
                            ${availableSubGroups}
                        </div>
                    </div>
                </div>
            `;
        }
        
        // In-use hosts section
        if (inUseHosts.length > 0) {
            const inUseCards = inUseHosts.map(host => createHostCardCompact(host, 'ondemand', variant.aggregate)).join('');
            const inUseId = `inuse-${variant.aggregate}`;
            
            sectionsHtml += `
                <div class="host-group">
                    <div class="host-group-header clickable" onclick="toggleGroup('${inUseId}')">
                        <i class="fas fa-exclamation-triangle text-warning"></i>
                        <h6>In Use (${inUseHosts.length})</h6>
                        <small class="text-muted">Have running VMs</small>
                        <i class="fas fa-chevron-right toggle-icon" id="${inUseId}-icon"></i>
                    </div>
                    <div class="host-group-content collapsed" id="${inUseId}">
                        <div class="host-cards-compact">
                            ${inUseCards}
                        </div>
                    </div>
                </div>
            `;
        }
        
        // Create collapsible variant section
        variantsHtml += `
            <div class="host-group">
                <div class="host-group-header clickable" onclick="toggleGroup('${variantId}')">
                    <i class="fas fa-microchip text-primary"></i>
                    <h6>${variant.variant} <span class="badge bg-secondary ms-2">${variantHosts.length}</span></h6>
                    <small class="text-muted">Available: ${availableHosts.length} | In Use: ${inUseHosts.length}</small>
                    <i class="fas fa-chevron-right toggle-icon" id="${variantId}-icon"></i>
                </div>
                <div class="host-group-content collapsed" id="${variantId}">
                    <div class="drop-zone" data-type="ondemand" data-variant="${variant.aggregate}">
                        <div class="subgroups-container">
                            ${sectionsHtml}
                        </div>
                    </div>
                </div>
            </div>
        `;
    });
    
    // Wrap all variants in a main drop zone for the column
    container.innerHTML = `
        <div class="drop-zone" data-type="ondemand">
            ${variantsHtml}
        </div>
    `;
    
    // Re-setup drag and drop for new elements
    setupDragAndDrop();
}

// EXACT ORIGINAL createHostCard function
function createHostCard(host, type, aggregateName = null) {
    const hasVms = host.has_vms;
    const vmBadgeClass = hasVms ? 'vm-badge active' : 'vm-badge zero';
    const warningIcon = hasVms ? '<i class="fas fa-exclamation-triangle warning-icon"></i>' : '';
    const cardClass = hasVms ? 'machine-card has-vms' : 'machine-card';
    
    // Create tenant badge
    const tenant = host.tenant || 'Unknown';
    const ownerGroup = host.owner_group || 'Investors';
    const tenantBadgeClass = ownerGroup === 'Nexgen Cloud' ? 'tenant-badge nexgen' : 'tenant-badge investors';
    const tenantIcon = ownerGroup === 'Nexgen Cloud' ? 'fas fa-cloud' : 'fas fa-users';
    
    return `
        <div class="${cardClass}" 
             draggable="true" 
             data-host="${host.name}" 
             data-type="${type}"
             data-aggregate="${host.variant || aggregateName || ''}"
             data-has-vms="${hasVms}"
             data-owner-group="${ownerGroup}"
             data-nvlinks="${host.nvlinks}">
            <div class="machine-card-header">
                <i class="fas fa-grip-vertical drag-handle"></i>
                <div class="machine-name">${host.name}</div>
                ${warningIcon}
            </div>
            <div class="machine-status">
                <div class="vm-info ${host.vm_count > 0 ? 'clickable-vm-count' : ''}" 
                     ${host.vm_count > 0 ? `onclick="showVmDetails('${host.name}')"` : ''}>
                    <i class="fas fa-circle status-dot ${hasVms ? 'active' : 'inactive'}"></i>
                    ${type === 'runpod' ? 
                        `<span class="${vmBadgeClass}">${host.vm_count}</span>
                         <span class="vm-label">${host.vm_count > 0 ? 'VMs' : 'No VMs'}</span>` :
                        `<span class="gpu-badge ${host.gpu_used > 0 ? 'active' : 'zero'}">${host.gpu_usage_ratio || '0/8'}</span>
                         <span class="gpu-label">GPUs</span>`
                    }
                </div>
                <div class="tenant-info">
                    <span class="${tenantBadgeClass}" title="${tenant}">
                        <i class="${tenantIcon}"></i>
                        ${ownerGroup === 'Nexgen Cloud' ? ownerGroup : tenant}
                    </span>
                </div>
                <div class="nvlinks-info">
                    <span class="nvlinks-badge ${host.nvlinks === true ? 'enabled' : (host.nvlinks === false ? 'disabled' : 'unknown')}" title="NVLinks ${host.nvlinks === true ? 'Enabled' : (host.nvlinks === false ? 'Disabled' : 'Unknown')}">
                        <i class="fas fa-link"></i>
                        NVLinks: ${host.nvlinks === true ? 'Yes' : (host.nvlinks === false ? 'No' : 'Unknown')}
                    </span>
                </div>
                ${host.variant ? `
                <div class="variant-info">
                    <span class="variant-badge" title="Aggregate: ${host.variant}">
                        <i class="fas fa-tag"></i>
                        ${host.variant}
                    </span>
                </div>` : ''}
                ${type === 'runpod' && !hasVms ? `
                <div class="launch-runpod-info">
                    <button class="btn btn-sm btn-outline-primary launch-runpod-btn" 
                            onclick="window.Hyperstack.scheduleRunpodLaunch('${host.name}')" 
                            title="Schedule VM launch on this host">
                        <i class="fas fa-rocket"></i> Launch into Runpod
                    </button>
                </div>` : ''}
            </div>
        </div>
    `;
}

// EXACT ORIGINAL setupDragAndDrop function
function setupDragAndDrop() {
    // Remove existing event listeners to prevent duplicates
    document.querySelectorAll('.machine-card').forEach(card => {
        card.removeEventListener('dragstart', handleDragStart);
        card.removeEventListener('dragend', handleDragEnd);
        card.removeEventListener('click', handleHostClick);
    });
    
    document.querySelectorAll('.drop-zone').forEach(zone => {
        zone.removeEventListener('dragover', handleDragOver);
        zone.removeEventListener('drop', handleDrop);
        zone.removeEventListener('dragenter', handleDragEnter);
        zone.removeEventListener('dragleave', handleDragLeave);
    });
    
    // Add event listeners to machine cards
    document.querySelectorAll('.machine-card').forEach(card => {
        card.addEventListener('dragstart', handleDragStart);
        card.addEventListener('dragend', handleDragEnd);
        card.addEventListener('click', handleHostClick);
    });
    
    // Add event listeners to drop zones
    document.querySelectorAll('.drop-zone').forEach(zone => {
        zone.addEventListener('dragover', handleDragOver);
        zone.addEventListener('drop', handleDrop);
        zone.addEventListener('dragenter', handleDragEnter);
        zone.addEventListener('dragleave', handleDragLeave);
    });
}

function handleDragStart(e) {
    console.log('🚀 handleDragStart called:', {
        host: this.dataset.host,
        type: this.dataset.type,
        element: this,
        classes: this.className
    });
    
    this.classList.add('dragging');
    e.dataTransfer.setData('text/plain', this.dataset.host);
    e.dataTransfer.setData('source-type', this.dataset.type);
}

function handleDragEnd(e) {
    this.classList.remove('dragging');
}

function handleDragOver(e) {
    e.preventDefault();
}

function handleDragEnter(e) {
    e.preventDefault();
    e.currentTarget.classList.add('drag-over');
    console.log('🎯 Drag entered drop zone:', {
        type: e.currentTarget.dataset.type,
        variant: e.currentTarget.dataset.variant,
        id: e.currentTarget.id
    });
}

function handleDragLeave(e) {
    if (!e.currentTarget.contains(e.relatedTarget)) {
        e.currentTarget.classList.remove('drag-over');
        console.log('🚪 Drag left drop zone:', {
            type: e.currentTarget.dataset.type,
            variant: e.currentTarget.dataset.variant,
            id: e.currentTarget.id
        });
    }
}

async function handleDrop(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    
    const hostname = e.dataTransfer.getData('text/plain');
    const sourceType = e.dataTransfer.getData('source-type');
    const targetType = e.currentTarget.dataset.type;
    const targetVariant = e.currentTarget.dataset.variant; // Get specific variant if available
    
    console.log('🔍 handleDrop:', {
        hostname,
        sourceType,
        targetType,
        targetVariant,
        dropZone: e.currentTarget
    });
    
    if (sourceType !== targetType) {
        await addToPendingOperations(hostname, sourceType, targetType, targetVariant);
    }
}

// Handle host card clicks - needed for selection
function handleHostClick(e) {
    if (e.target.closest('button')) {
        return; // Don't handle clicks on buttons
    }
    
    const card = e.currentTarget;
    const hostname = card.dataset.host;
    
    if (card.classList.contains('selected')) {
        card.classList.remove('selected');
        selectedHosts.delete(hostname);
    } else {
        card.classList.add('selected');
        selectedHosts.add(hostname);
    }
    
    // Update control buttons if function exists
    if (typeof window.updateControlButtons === 'function') {
        window.updateControlButtons();
    }
}

// Toggle group visibility - EXACT ORIGINAL logic
function toggleGroup(groupId) {
    const content = document.getElementById(groupId);
    const icon = document.getElementById(`${groupId}-icon`);
    
    if (content.classList.contains('collapsed')) {
        content.classList.remove('collapsed');
        icon.classList.remove('fa-chevron-right');
        icon.classList.add('fa-chevron-down');
    } else {
        content.classList.add('collapsed');
        icon.classList.remove('fa-chevron-down');
        icon.classList.add('fa-chevron-right');
    }
}

// Basic loading/notification functions for modular compatibility
function showLoading(show, message = 'Loading...', step = 'Initializing...', progress = 0) {
    const loadingIndicator = document.getElementById('loadingIndicator');
    const mainContent = document.getElementById('mainContent');
    
    if (show) {
        loadingIndicator.classList.remove('d-none');
        // ALWAYS keep main content visible so contract column stays visible
        // Don't hide main content during loading - just show loading indicator
        mainContent.classList.remove('d-none');
    } else {
        loadingIndicator.classList.add('d-none');
        mainContent.classList.remove('d-none');
    }
}

function updateLoadingProgress(step, progress) {
    // Basic implementation
}

function showMainContent() {
    document.getElementById('mainContent').classList.remove('d-none');
}

function hideMainContent() {
    // NO-OP: Never hide main content to keep contract column always visible
    console.log('⚠️ hideMainContent() called but ignored to keep contract column visible');
}

function showNotification(message, type = 'info') {
    console.log(`${type.toUpperCase()}: ${message}`);
}

function updateGpuTypeSelector(cachedTypes = []) {
    const select = document.getElementById('gpuTypeSelect');
    if (!select) return;
    
    const options = select.querySelectorAll('option');
    options.forEach(option => {
        if (option.value && cachedTypes.includes(option.value)) {
            if (!option.textContent.includes('⚡')) {
                option.textContent = option.textContent + ' ⚡';
            }
        }
    });
}

async function addToPendingOperations(hostname, sourceType, targetType, targetVariant = null) {
    // Get the aggregate name from the card data
    const sourceCard = document.querySelector(`[data-host="${hostname}"]`);
    const sourceAggregate = sourceCard ? sourceCard.dataset.aggregate : '';
    
    console.log('🔍 addToPendingOperations:', {
        hostname,
        sourceType,
        targetType,
        sourceAggregate,
        targetVariant
    });
    
    try {
        // Determine target aggregate based on target type
        let targetAggregate = '';
        
        if (targetType === 'contract') {
            // For contract drops, get the selected contract from the dropdown
            const contractSelect = document.getElementById('contractColumnSelect');
            if (!contractSelect) {
                throw new Error('Contract dropdown not initialized yet. Please wait for the page to fully load and try again.');
            }
            if (!contractSelect.value) {
                throw new Error('No contract selected. Please select a contract from the dropdown first.');
            }
            targetAggregate = contractSelect.value;
        } else if (targetType === 'spot') {
            // Use spot aggregate from current data
            if (window.Frontend.aggregateData && window.Frontend.aggregateData.spot && window.Frontend.aggregateData.spot.name) {
                targetAggregate = window.Frontend.aggregateData.spot.name;
            } else {
                throw new Error('Spot aggregate not available');
            }
        } else if (targetType === 'runpod') {
            // Always use the selected GPU type for RunPod migrations to ensure correct aggregate
            if (window.currentGpuType) {
                // Construct runpod aggregate name from selected GPU type
                targetAggregate = `${window.currentGpuType}-n3-runpod`;
                console.log('🔄 Using selected GPU type for runpod aggregate:', targetAggregate);
            } else {
                throw new Error('No GPU type selected for RunPod migration');
            }
        } else if (targetVariant) {
            // For variant drops, construct the aggregate name
            const gpuType = window.currentGpuType;
            if (!gpuType) {
                throw new Error('Current GPU type not available');
            }
            
            // Find the variant aggregate name from the data
            if (window.Frontend.aggregateData && window.Frontend.aggregateData.ondemand) {
                if (window.Frontend.aggregateData.ondemand.variants && window.Frontend.aggregateData.ondemand.variants.length > 0) {
                    const variant = window.Frontend.aggregateData.ondemand.variants.find(v => v.variant === targetVariant);
                    if (variant && variant.aggregate) {
                        targetAggregate = variant.aggregate;
                    } else {
                        // Fallback: if variant not found in data, construct it from the targetVariant name
                        // This supports dynamic GPU types not defined in AGGREGATE_PAIRS
                        targetAggregate = targetVariant;
                        console.log(`⚠️ Variant not found in data, using fallback aggregate: ${targetAggregate}`);
                    }
                } else {
                    // Fallback: if no variants defined, use the targetVariant directly as aggregate name
                    targetAggregate = targetVariant;
                    console.log(`⚠️ No variants data available, using fallback aggregate: ${targetAggregate}`);
                }
            } else {
                throw new Error('Ondemand data not available');
            }
        } else {
            throw new Error(`Unknown target type: ${targetType}`);
        }
        
        console.log('✅ Determined target aggregate locally:', {
            hostname,
            target_type: targetType,
            target_variant: targetVariant,
            target_aggregate: targetAggregate
        });
        
        // Check if source and target aggregates are the same
        if (sourceAggregate === targetAggregate) {
            console.log('⚠️ Ignoring drag and drop - host is already in target aggregate:', {
                hostname,
                sourceAggregate,
                targetAggregate
            });
            showNotification(`Host ${hostname} is already in ${targetAggregate}`, 'warning');
            return;
        }
        
        // Extract GPU types from aggregate names for validation
        const extractGpuType = (aggregateName) => {
            if (!aggregateName) return null;
            // Extract base GPU type from aggregate name
            const parts = aggregateName.split('-');
            if (parts.length < 2) return null;
            
            // Handle special cases for common GPU types
            if (parts[0] === 'RTX') {
                if (parts[1] === 'PRO6000' && parts[2] === 'SE') {
                    return 'RTX-PRO6000-SE';  // RTX-PRO6000-SE-n3 -> RTX-PRO6000-SE
                } else {
                    return `${parts[0]}-${parts[1]}`;  // RTX-A6000-n3 -> RTX-A6000
                }
            } else if (['H100', 'A100', 'L40', 'H200'].includes(parts[0])) {
                if (parts[0] === 'H100' && parts[1] === 'SXM5') {
                    return parts[2] === 'GB' ? 'H100-SXM5-GB' : 'H100-SXM5';  // Handle H100-SXM5-GB vs H100-SXM5
                } else if (parts[0] === 'H200' && parts[1] === 'SXM5') {
                    return 'H200-SXM5';  // H200-SXM5-n3 -> H200-SXM5
                } else {
                    return parts[0];  // H100, A100, L40, H200
                }
            }
            return parts[0];  // Fallback to first part
        };
        
        const sourceGpuType = extractGpuType(sourceAggregate);
        const targetGpuType = extractGpuType(targetAggregate);
        
        // Validate GPU type compatibility
        if (sourceGpuType && targetGpuType && sourceGpuType !== targetGpuType) {
            console.log('❌ Invalid GPU type migration:', {
                hostname,
                sourceAggregate,
                targetAggregate,
                sourceGpuType,
                targetGpuType
            });
            showNotification(`❌ Cannot migrate ${hostname}: GPU types don't match (${sourceGpuType} → ${targetGpuType})`, 'error');
            return;
        }
        
        // For on-demand moves with variants, check NVLink compatibility
        if (targetType === 'ondemand' && targetVariant && aggregateData.ondemand?.variants) {
            const hostCard = document.querySelector(`[data-host="${hostname}"]`);
            const hasNVLink = hostCard && hostCard.dataset.nvlinks === 'true';
            const targetVariantInfo = aggregateData.ondemand.variants?.find(v => v.aggregate === targetVariant);
            const targetIsNVLink = targetVariantInfo?.variant.toLowerCase().includes('nvlink');
            
            // Show warning if NVLink mismatch
            if (hasNVLink && !targetIsNVLink) {
                const proceed = confirm(`⚠️ Warning: Host ${hostname} has NVLink capability but you're moving it to a non-NVLink variant (${targetVariantInfo?.variant}). Do you want to proceed?`);
                if (!proceed) return;
            } else if (!hasNVLink && targetIsNVLink) {
                const proceed = confirm(`⚠️ Warning: Host ${hostname} does not have NVLink capability but you're moving it to an NVLink variant (${targetVariantInfo?.variant}). Do you want to proceed?`);
                if (!proceed) return;
            }
        }
        
        // Check if operation already exists
        const existingIndex = pendingOperations.findIndex(op => op.hostname === hostname);
        if (existingIndex !== -1) {
            // Update existing operation
            pendingOperations[existingIndex] = {
                hostname,
                sourceType,
                targetType,
                sourceAggregate,
                targetAggregate,
                timestamp: new Date().toISOString()
            };
        } else {
            // Add new operation
            pendingOperations.push({
                hostname,
                sourceType,
                targetType,
                sourceAggregate,
                targetAggregate,
                timestamp: new Date().toISOString()
            });
        }
        
        updatePendingOperationsDisplay();
        showNotification(`Added ${hostname} to pending operations (${sourceType} → ${targetType})`, 'info');
        
    } catch (error) {
        console.error('❌ Failed to determine target aggregate:', error);
        showNotification(`Failed to add ${hostname}: ${error.message}`, 'error');
    }
}

// Add RunPod launch operation (separate from migrations)
function addRunPodLaunchOperation(hostname, vmDetails) {
    // Get the host card to check current aggregate
    const sourceCard = document.querySelector(`[data-host="${hostname}"]`);
    const currentAggregate = sourceCard ? sourceCard.dataset.aggregate : '';
    const isRunPodHost = sourceCard ? sourceCard.dataset.type === 'runpod' : false;
    
    console.log('🔍 addRunPodLaunchOperation:', {
        hostname,
        currentAggregate,
        isRunPodHost,
        vmDetails
    });
    
    // Check if host is already in RunPod aggregate
    if (!isRunPodHost) {
        // Host needs to be moved to RunPod first, then launched
        showNotification(`Host ${hostname} must be moved to RunPod aggregate first`, 'warning');
        return;
    }
    
    // Validate that required image information is provided
    if (!vmDetails.image_name) {
        console.error('❌ Cannot create operation: No image_name provided in vmDetails');
        showNotification('Cannot launch VM: No image selected. Please select an image first.', 'error');
        return;
    }
    
    // Create RunPod launch operation
    const operation = {
        hostname: hostname,
        type: 'runpod-launch',
        sourceAggregate: currentAggregate,
        targetAggregate: currentAggregate, // Same aggregate, just launching VM
        vm_name: vmDetails.vm_name || hostname,
        flavor_name: vmDetails.flavor_name,
        image_name: vmDetails.image_name,
        image_id: vmDetails.image_id,
        key_name: vmDetails.key_name,
        timestamp: new Date().toISOString(),
        manual: vmDetails.manual || false,
        source: vmDetails.source || 'unknown'
    };
    
    // Check for duplicates
    const existingOperation = pendingOperations.find(op => 
        op.hostname === hostname && op.type === 'runpod-launch'
    );
    
    if (existingOperation) {
        showNotification(`RunPod launch for ${hostname} is already pending`, 'warning');
        return;
    }
    
    pendingOperations.push(operation);
    
    console.log('✅ Added RunPod launch operation:', operation);
    updateCardPendingIndicators();
    updatePendingOperationsDisplay();
    showNotification(`Added RunPod launch for ${hostname} to pending operations`, 'info');
}

function updatePendingOperationsDisplay() {
    const list = document.getElementById('pendingOperationsList');
    const count = document.getElementById('pendingCount');
    const tabCount = document.getElementById('pendingTabCount');
    
    // Update counts
    if (count) {
        count.textContent = pendingOperations.length;
        count.classList.add('updated');
        setTimeout(() => count.classList.remove('updated'), 500);
    }
    if (tabCount) {
        tabCount.textContent = pendingOperations.length;
    }
    
    // Update visual indicators on cards
    updateCardPendingIndicators();
    
    if (!list) return;
    
    if (pendingOperations.length === 0) {
        list.innerHTML = `
            <div class="text-center text-muted">
                <i class="fas fa-clock fa-3x mb-3"></i>
                <p>No pending operations. Select hosts and add operations to see them here.</p>
            </div>
        `;
        updateCommitButtonState();
        return;
    }
    
    const operationsHtml = pendingOperations.map((op, index) => {
        // Generate individual command operations for this operation
        const commands = generateIndividualCommandOperations(op);
        
        const operationTitle = op.type === 'runpod-launch' ? 
            `🚀 Launch VM '${op.vm_name || op.hostname}' on ${op.hostname}` : 
            `🔄 Move ${op.hostname} from ${op.sourceAggregate} to ${op.targetAggregate}`;
        
        const purposeText = op.type === 'runpod-launch' ? 
            'Deploy new virtual machine with automated networking and security configuration' :
            'Relocate compute host between resource pools for different billing models';
        
        const commandsHtml = commands.map((cmd, cmdIndex) => {
            const commandId = `cmd-${op.hostname}-${cmd.type}-${cmdIndex}`;
            const isCompleted = op.completedCommands && op.completedCommands.includes(cmd.type);
            const commandClass = isCompleted ? 'command-operation completed-step' : 'command-operation';
            const statusIcon = isCompleted ? '<i class="fas fa-check-circle text-success me-1"></i>' : '';
            const disabledAttr = isCompleted ? 'disabled' : '';
            const checkedAttr = isCompleted ? 'checked' : ''; // Only check completed commands by default
            
            // Determine status badge and icon
            let statusBadge, statusClass;
            if (isCompleted) {
                statusBadge = 'Completed';
                statusClass = 'bg-success';
            } else {
                statusBadge = 'Pending';
                statusClass = 'bg-secondary';
            }
            
            return `
                <div class="${commandClass}" data-command-id="${commandId}">
                    <div class="command-header-container">
                        <div class="command-main-header d-flex align-items-center">
                            <input type="checkbox" class="form-check-input command-operation-checkbox me-2" 
                                   id="${commandId}" ${checkedAttr} ${disabledAttr}
                                   data-operation-index="${index}" data-command-index="${cmdIndex}"
                                   onchange="updateCommitButtonState()">
                            
                            <button class="btn btn-sm btn-outline-secondary me-2 command-collapse-btn" 
                                    onclick="toggleCommandDetails('${commandId}')"
                                    title="Expand/Collapse command details">
                                <i class="fas fa-chevron-right" id="${commandId}-chevron"></i>
                            </button>
                            
                            <div class="command-title-section flex-grow-1">
                                <label class="form-check-label command-title d-flex align-items-center" for="${commandId}">
                                    ${statusIcon}
                                    <i class="${window.Utils.getCommandIcon(cmd.command_type)} me-1"></i>
                                    <strong>${cmd.title}</strong>
                                </label>
                                
                                <!-- Progress bar for timed operations -->
                                ${cmd.type === 'wait-command' || cmd.type === 'vm-status-poll' || cmd.type === 'firewall-wait-command' ? `
                                <div class="command-progress mt-1" id="${commandId}-progress" style="display: none;">
                                    <div class="progress" style="height: 6px;">
                                        <div class="progress-bar progress-bar-striped progress-bar-animated bg-warning" 
                                             role="progressbar" style="width: 0%" id="${commandId}-progress-bar">
                                        </div>
                                    </div>
                                    <small class="text-muted" id="${commandId}-progress-text">Waiting...</small>
                                </div>` : ''}
                            </div>
                            
                            <span class="badge ${statusClass} ms-2 command-status-badge" id="${commandId}-status">${statusBadge}</span>
                        </div>
                    </div>
                    
                    <div class="command-details mt-2" style="display: none;">
                        <div class="command-purpose">
                            <strong class="text-primary">Purpose:</strong>
                            <div class="text-muted small mt-1">${cmd.purpose}</div>
                        </div>
                        
                        <div class="command-description mt-2">
                            <strong class="text-info">Description:</strong>
                            <div class="text-muted small mt-1">${cmd.description}</div>
                        </div>
                        
                        <div class="command-to-execute mt-2">
                            <strong class="text-dark">Command:</strong>
                            <code class="d-block mt-1 p-2 bg-light rounded small">${cmd.command}</code>
                        </div>
                        
                        <div class="command-expected mt-2">
                            <strong class="text-success">Expected Output:</strong>
                            <div class="text-muted small mt-1 font-italic">${cmd.expected_output}</div>
                        </div>
                        
                        <div class="command-actual-output mt-2" id="${commandId}-actual-output" style="display: none;">
                            <strong class="text-primary">Actual Output:</strong>
                            <div class="actual-output-content bg-dark text-light p-2 rounded small mt-1" style="font-family: monospace; white-space: pre-wrap;"></div>
                        </div>
                        
                        ${cmd.dependencies && cmd.dependencies.length > 0 ? `
                        <div class="command-dependencies mt-2">
                            <strong class="text-warning">Dependencies:</strong>
                            <div class="small mt-1">
                                ${cmd.dependencies.map(dep => `<span class="badge bg-warning text-dark me-1">${dep}</span>`).join('')}
                            </div>
                        </div>
                        ` : ''}
                    </div>
                </div>
            `;
        }).join('');
        
        return `
            <div class="pending-operation-card card mb-4" data-index="${index}">
                <div class="card-header bg-primary text-white">
                    <div class="d-flex justify-content-between align-items-center">
                        <div class="d-flex align-items-center">
                            <button class="btn btn-sm btn-outline-light me-2" 
                                    onclick="toggleOperationCollapse(${index})" 
                                    id="collapse-btn-${index}"
                                    title="Expand operation">
                                <i class="fas fa-chevron-right"></i>
                            </button>
                            <h6 class="mb-0">${operationTitle}</h6>
                        </div>
                        <button class="btn btn-sm btn-outline-light" onclick="removePendingOperation(${index})" title="Remove operation">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                    <small class="text-light">
                        <strong>Purpose:</strong> ${purposeText}
                    </small>
                </div>
                <div class="card-body collapse" id="operation-body-${index}">
                    <div class="commands-list">
                        <div class="d-flex justify-content-between align-items-center mb-3">
                            <h6 class="text-primary mb-0">
                                <i class="fas fa-list-ol me-1"></i>
                                Commands to Execute (${commands.length} total)
                            </h6>
                            <div class="btn-group" role="group">
                                <button type="button" class="btn btn-sm btn-outline-secondary" onclick="expandAllCommands()" title="Expand all commands">
                                    <i class="fas fa-expand-alt me-1"></i>Expand All
                                </button>
                                <button type="button" class="btn btn-sm btn-outline-secondary" onclick="collapseAllCommands()" title="Collapse all commands">
                                    <i class="fas fa-compress-alt me-1"></i>Collapse All
                                </button>
                            </div>
                        </div>
                        ${commandsHtml}
                    </div>
                    
                    <div class="operation-meta mt-3 pt-3 border-top">
                        <small class="text-muted">
                            <i class="fas fa-clock"></i> Added ${new Date(op.timestamp).toLocaleString()}
                        </small>
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    list.innerHTML = operationsHtml;
    updateCommitButtonState();
}

function updateCardPendingIndicators() {
    // Remove all pending indicators
    document.querySelectorAll('.machine-card').forEach(card => {
        card.classList.remove('pending-operation');
    });
    
    // Add pending indicators to cards with pending operations
    pendingOperations.forEach(op => {
        const card = document.querySelector(`[data-host="${op.hostname}"]`);
        if (card) {
            card.classList.add('pending-operation');
        }
    });
}

function removePendingOperation(index) {
    if (index >= 0 && index < pendingOperations.length) {
        const operation = pendingOperations[index];
        pendingOperations.splice(index, 1);
        updatePendingOperationsDisplay();
        showNotification(`Removed ${operation.hostname} from pending operations`, 'info');
    }
}

// Clean up invalid pending operations where source equals target
function cleanupInvalidPendingOperations() {
    const originalCount = pendingOperations.length;
    const invalidOperations = [];
    
    // Find operations where source and target aggregates are the same
    for (let i = pendingOperations.length - 1; i >= 0; i--) {
        const operation = pendingOperations[i];
        if (operation.sourceAggregate === operation.targetAggregate) {
            invalidOperations.push(operation.hostname);
            pendingOperations.splice(i, 1);
        }
    }
    
    if (invalidOperations.length > 0) {
        console.log('🧹 Cleaned up invalid pending operations:', invalidOperations);
        updatePendingOperationsDisplay();
        showNotification(`Removed ${invalidOperations.length} invalid operations where source equals target: ${invalidOperations.join(', ')}`, 'info');
        return invalidOperations.length;
    }
    
    return 0;
}

// Placeholder for scheduleRunpodLaunch function (referenced in host cards)
function scheduleRunpodLaunch(hostname) {
    console.log(`Schedule RunPod launch for ${hostname}`);
    if (window.Hyperstack && window.Hyperstack.scheduleRunpodLaunch) {
        window.Hyperstack.scheduleRunpodLaunch(hostname);
    }
}

// Make functions globally available for HTML onclick handlers
// Render On-Demand variants as separate columns
function renderOnDemandVariantColumns(ondemandData) {
    console.log('🔍 renderOnDemandVariantColumns:', {
        variants: ondemandData.variants,
        totalHosts: ondemandData.hosts.length,
        gpuType: ondemandData.name || 'unknown',
        hostSample: ondemandData.hosts.slice(0, 3).map(h => ({hostname: h.hostname, variant: h.variant}))
    });
    
    // FIRST: Clean up ALL existing variant columns regardless of their state
    // This ensures we start fresh and prevents duplicates
    const mainRow = document.querySelector('.row.mt-3');
    if (mainRow) {
        // Get all column divs with more comprehensive selector
        const existingColumns = mainRow.querySelectorAll('[class*="col-md-"], [class*="col-lg-"], [class*="col-sm-"], [class*="col-xl-"], .col');
        existingColumns.forEach(col => {
            const columnDiv = col.querySelector('.aggregate-column');
            
            // Debug logging to see what we're finding
            console.log('🔍 Pre-cleanup found column:', {
                colId: col.id,
                columnDivId: columnDiv ? columnDiv.id : 'no div',
                classList: col.classList.toString()
            });
            
            // Check if this is a core column that should be kept
            const isKeepColumn = col.id === 'ondemandColumnFallback' || 
                                col.id === 'contractColumn' ||
                                (columnDiv && ['runpodColumn', 'spotColumn', 'ondemandColumn', 'contractAggregateColumn'].includes(columnDiv.id));
            
            if (!isKeepColumn) {
                // This is a dynamically added variant column - remove it
                if (columnDiv && columnDiv.id) {
                    console.log('🗑️ Pre-cleanup: Removing variant column by ID:', columnDiv.id);
                } else {
                    console.log('🗑️ Pre-cleanup: Removing variant column without ID');
                }
                col.remove();
            } else {
                console.log('✅ Pre-cleanup keeping core column:', columnDiv ? columnDiv.id : col.id);
            }
        });
    }
    
    // Calculate column width based on total number of columns to ensure everything fits
    const totalVariants = ondemandData.variants ? ondemandData.variants.length : 1;
    // Total columns: RunPod + Spot + Contract + OutOfStock + OnDemand variants
    const totalColumns = 4 + totalVariants; // 4 fixed columns + variable OnDemand columns
    const columnPercentage = Math.floor(100 / totalColumns * 10) / 10; // Round down to 1 decimal place for clean percentages
    
    console.log('🔍 Column calculation:', {
        totalVariants,
        totalColumns,
        columnPercentage: `${columnPercentage}% (equal width for all columns)`
    });
    
    // Update fixed column widths to match the calculated percentage
    const fixedColumns = ['runpodColumn', 'spotColumn', 'contractColumn', 'outofstockColumn'];
    fixedColumns.forEach(columnId => {
        const column = document.getElementById(columnId);
        if (column && column.parentElement) {
            column.parentElement.style.flex = `0 0 ${columnPercentage}%`;
        }
    });
    
    // Check if variants include NVLink differentiation (only split columns for NVLink variants)
    const hasNVLinkVariants = ondemandData.variants && ondemandData.variants.length > 1 && 
        ondemandData.variants.some(v => v.variant.toLowerCase().includes('nvlink'));
        
    if (hasNVLinkVariants) {
        // Multiple variants - create separate columns
        // Hide fallback column
        const fallbackColumn = document.getElementById('ondemandColumnFallback');
        if (fallbackColumn) {
            fallbackColumn.style.display = 'none';
        }
        
        // Insert columns directly into the row, not into a separate container  
        const spotColumnElement = document.querySelector('#spotColumn').closest('[class*="col-md-"]');
        
        // Cleanup was already done at the start of the function
        
        // Add each variant column before the spot column
        ondemandData.variants.forEach((variant, index) => {
            const variantHosts = ondemandData.hosts.filter(host => host.variant === variant.aggregate);
            const variantId = variant.aggregate.replace(/[^a-zA-Z0-9]/g, '');
            
            console.log(`🔍 Variant ${variant.variant}:`, {
                aggregate: variant.aggregate,
                hostCount: variantHosts.length
            });
            
            // Double-check: ensure no column with this ID already exists
            const existingColumn = document.getElementById(`${variantId}Column`);
            if (existingColumn) {
                console.log(`⚠️ Column ${variantId}Column already exists, removing it first`);
                existingColumn.closest('[class*="col-md-"]').remove();
            }
            
            const columnHtml = `
                <div class="col-md-6" style="flex: 0 0 ${columnPercentage}%;">
                    <div class="aggregate-column" id="${variantId}Column">
                        <div class="card">
                            <div class="card-header bg-primary text-white">
                                <h4 class="mb-0 d-flex justify-content-between align-items-center">
                                    <span>
                                        <i class="fas fa-server"></i> 
                                        ${variant.variant}
                                        <span class="badge bg-light text-dark ms-2">${variantHosts.length}</span>
                                    </span>
                                </h4>
                                <div class="mt-2">
                                    <small class="text-light">GPU Usage: <span id="${variantId}GpuUsage">0/0</span> (<span id="${variantId}GpuPercent">0%</span>)</small>
                                    <div class="progress mt-1" style="height: 6px;">
                                        <div class="progress-bar bg-light" role="progressbar" style="width: 0%" id="${variantId}GpuProgressBar"></div>
                                    </div>
                                </div>
                            </div>
                            <div class="card-body drop-zone" id="${variantId}Hosts" data-type="ondemand" data-variant="${variant.aggregate}">
                                <!-- ${variant.variant} hosts will be dynamically inserted here -->
                            </div>
                        </div>
                    </div>
                </div>
            `;
            
            spotColumnElement.insertAdjacentHTML('beforebegin', columnHtml);
        });
        
        // Variant refresh buttons removed - using single refresh for all data instead
        
        // Render hosts for each variant column
        ondemandData.variants.forEach(variant => {
            const variantHosts = ondemandData.hosts.filter(host => host.variant === variant.aggregate);
            const variantId = variant.aggregate.replace(/[^a-zA-Z0-9]/g, '');
            const container = document.getElementById(`${variantId}Hosts`);
            
            if (container) {
                renderHosts(container.id, variantHosts, variantId, variant.aggregate);
                
                // Update column statistics
                updateVariantColumnStats(variantId, variantHosts);
            }
        });
        
    } else {
        // Single variant - use fallback column
        const fallbackColumn = document.getElementById('ondemandColumnFallback');
        if (fallbackColumn) {
            fallbackColumn.style.display = 'block';
            // Keep the col-md-4 width set in HTML template for ondemand fallback
            
            // Update the fallback column with data
            const nameElement = document.getElementById('ondemandName');
            const countElement = document.getElementById('ondemandCount');
            const variantName = ondemandData.variants && ondemandData.variants.length > 0 ? 
                ondemandData.variants[0].variant : ondemandData.name;
            
            if (nameElement) nameElement.textContent = variantName;
            if (countElement) countElement.textContent = ondemandData.hosts.length;
            
            // Set variant data attribute
            const hostsContainer = document.getElementById('ondemandHosts');
            if (hostsContainer && ondemandData.variants && ondemandData.variants.length > 0) {
                hostsContainer.setAttribute('data-variant', ondemandData.variants[0].aggregate);
            }
            
            // Render hosts
            const container = document.getElementById('ondemandHosts');
            if (container) {
                renderHosts(container.id, ondemandData.hosts, 'ondemand', ondemandData.name);
            }
        }
    }
}

// Update variant column statistics
function updateVariantColumnStats(variantId, hosts) {
    const gpuUsageElement = document.getElementById(`${variantId}GpuUsage`);
    const gpuPercentElement = document.getElementById(`${variantId}GpuPercent`);
    const gpuProgressBar = document.getElementById(`${variantId}GpuProgressBar`);
    
    if (!hosts || hosts.length === 0) {
        if (gpuUsageElement) gpuUsageElement.textContent = '0/0';
        if (gpuPercentElement) gpuPercentElement.textContent = '0%';
        if (gpuProgressBar) gpuProgressBar.style.width = '0%';
        return;
    }
    
    // Calculate GPU usage
    let totalGpuUsed = 0;
    let totalGpuCapacity = 0;
    
    hosts.forEach(host => {
        if (host.gpu_used) totalGpuUsed += host.gpu_used;
        if (host.gpu_capacity) totalGpuCapacity += host.gpu_capacity;
    });
    
    const gpuPercent = totalGpuCapacity > 0 ? Math.round((totalGpuUsed / totalGpuCapacity) * 100) : 0;
    
    if (gpuUsageElement) gpuUsageElement.textContent = `${totalGpuUsed}/${totalGpuCapacity}`;
    if (gpuPercentElement) gpuPercentElement.textContent = `${gpuPercent}%`;
    if (gpuProgressBar) gpuProgressBar.style.width = `${gpuPercent}%`;
}

// Refresh only affected columns after operations
function refreshAffectedColumns(operations) {
    const affectedAggregates = new Set();
    
    operations.forEach(op => {
        if (op.sourceAggregate) affectedAggregates.add(op.sourceAggregate);
        if (op.targetAggregate) affectedAggregates.add(op.targetAggregate);
    });
    
    console.log('🔄 Refreshing affected aggregates:', Array.from(affectedAggregates));
    
    // Refresh only the affected GPU type data
    if (window.currentGpuType) {
        window.OpenStack.loadAggregateData(window.currentGpuType, false)
            .then(data => {
                // Only update the columns that were affected
                if (data.ondemand.hosts) {
                    renderOnDemandVariantColumns(data.ondemand);
                }
                if (data.runpod.hosts) {
                    renderHosts('runpodHosts', data.runpod.hosts, 'runpod', data.runpod.name);
                }
                if (data.spot.hosts) {
                    renderHosts('spotHosts', data.spot.hosts, 'spot', data.spot.name);
                }
                
                // Setup drag and drop for new elements
                setupDragAndDrop();
            })
            .catch(error => {
                console.error('Error refreshing affected columns:', error);
            });
    }
}

// Generate individual command operations for pending operations
function generateIndividualCommandOperations(operation) {
    const commands = [];
    
    // Debug logging to track operation object
    console.log(`🔍 generateIndividualCommandOperations called with:`, operation);
    console.log(`🔍 operation.image_name:`, operation?.image_name);
    console.log(`🔍 operation type:`, operation?.type);
    
    if (operation.type === 'runpod-launch') {
        // Generate individual commands with explicit sleep operations as separate steps
        
        // 1. VM Launch command (removed wait for aggregate migration)
        commands.push({
            type: 'hyperstack-launch',
            hostname: operation.hostname,
            parent_operation: 'runpod-launch',
            title: 'Deploy VM via Hyperstack API',
            description: 'Creates new virtual machine on the specified host with correct specifications and flavor',
            command: operation.commands ? operation.commands[0] : `curl -X POST https://infrahub-api.nexgencloud.com/v1/core/virtual-machines \\
  -H 'api_key: <HYPERSTACK_API_KEY>' \\
  -H 'Content-Type: application/json' \\
  -d '{
    "name": "<VM_NAME>",
    "environment_name": "CA1-RunPod", 
    "image_name": "${operation.image_name}",
    "flavor_name": "<GPU_FLAVOR>",
    "assign_floating_ip": true,
    "user_data": "<CLOUD_INIT_SCRIPT_WITH_RUNPOD_API_KEY>"
  }' # VM: ${operation.vm_name || operation.hostname}`,
            verification_commands: [
                `openstack server show <VM_NAME> --all-projects`,
                `openstack server list --host <HOSTNAME> --all-projects`
            ],
            timing: 'Immediate',
            command_type: 'api',
            purpose: 'Create the virtual machine on the specified compute host with proper configuration for RunPod integration',
            expected_output: 'VM created successfully with assigned ID and floating IP',
            dependencies: ['wait-command'],
            timestamp: new Date().toISOString()
        });
        
        if (operation.hostname.toLowerCase().startsWith('ca1-')) {
            // 3. Poll VM status until ACTIVE (replaces 120-second sleep)
            commands.push({
                type: 'vm-status-poll',
                hostname: operation.hostname,
                parent_operation: 'runpod-launch',
                title: 'Poll VM status until ACTIVE',
                description: 'Check VM status every 5 seconds until it transitions from BUILD to ACTIVE state',
                command: `# Poll VM status until ACTIVE\nwhile [ "$(openstack server show ${operation.hostname} -c status -f value)" = "BUILD" ]; do\n  echo "VM still building, waiting 5 seconds..."\n  sleep 5\ndone`,
                timing: 'Poll every 5s',
                command_type: 'polling',
                purpose: 'Wait for VM to reach ACTIVE state before network operations to prevent errors',
                expected_output: 'VM status changed from BUILD to ACTIVE - ready for network operations',
                dependencies: ['hyperstack-launch'],
                timestamp: new Date().toISOString()
            });
            
            // 4. Get Server UUID
            commands.push({
                type: 'server-get-uuid',
                hostname: operation.hostname,
                parent_operation: 'runpod-launch',
                title: 'Get server UUID for network operations',
                description: 'Retrieves the OpenStack server UUID required for network attachment',
                command: `openstack server list --all-projects --name "${operation.hostname}" -c ID -f value`,
                timing: 'Immediate',
                command_type: 'server',
                purpose: 'Get the server UUID required for OpenStack network operations',
                expected_output: 'Server UUID (e.g., 832eccd6-d9fb-4c00-9b71-8ee69b19a14b)',
                dependencies: ['vm-status-poll'],
                timestamp: new Date().toISOString()
            });
            
            // 5. Storage Network - Direct Attachment with Retry Logic
            commands.push({
                type: 'storage-attach-network',
                hostname: operation.hostname,
                parent_operation: 'runpod-launch',
                title: 'Attach storage network to VM (with retry)',
                description: 'Attaches the storage network to the VM using server UUID with automatic retry logic',
                command: `openstack server add network <UUID_FROM_STEP_4> "RunPod-Storage-Canada-1"`,
                timing: 'Immediate with retries',
                command_type: 'network',
                purpose: 'Connect VM to high-performance storage network with fault tolerance',
                expected_output: 'Network successfully attached to VM (may retry up to 3 times)',
                dependencies: ['server-get-uuid'],
                timestamp: new Date().toISOString()
            });
            
            // 6. Sleep 10 seconds before firewall operations
            commands.push({
                type: 'firewall-wait-command',
                hostname: operation.hostname,
                parent_operation: 'runpod-launch',
                title: 'Sleep 10 seconds',
                description: 'Wait before firewall attachment to ensure network configuration is complete',
                command: `sleep 10  # Wait before firewall attachment`,
                timing: 'Sleep',
                command_type: 'wait',
                purpose: 'Allow network configuration to stabilize before firewall attachment',
                expected_output: 'Sleep completed successfully',
                dependencies: ['storage-attach-network'],
                timestamp: new Date().toISOString()
            });
            
            // 7. Firewall - Get Current Attachments
            commands.push({
                type: 'firewall-get-attachments',
                hostname: operation.hostname,
                parent_operation: 'runpod-launch',
                title: 'Get current firewall VM attachments',
                description: 'Retrieves list of VMs currently attached to firewall to preserve them during update',
                command: `curl -X GET https://infrahub-api.nexgencloud.com/v1/core/firewalls/971 \\
  -H 'api_key: <HYPERSTACK_API_KEY>' \\
  -H 'Content-Type: application/json'`,
                timing: 'Immediate',
                command_type: 'security',
                purpose: 'Preserve existing VM attachments when updating firewall rules',
                expected_output: 'JSON list of currently attached VM IDs',
                dependencies: ['firewall-wait-command'],
                timestamp: new Date().toISOString()
            });
            
            // 8. Firewall - Update with All VMs
            commands.push({
                type: 'firewall-update-attachments',
                hostname: operation.hostname,
                parent_operation: 'runpod-launch',
                title: 'Update firewall with all VMs (existing + new)',
                description: 'Updates firewall to include all existing VMs plus the newly created VM',
                command: `curl -X POST https://infrahub-api.nexgencloud.com/v1/core/firewalls/971/update-attachments \\
  -H 'api_key: <HYPERSTACK_API_KEY>' \\
  -H 'Content-Type: application/json' \\
  -d '{
    "virtual_machines": [
      "<EXISTING_VM_IDS>",
      "<NEW_VM_ID>"
    ]
  }' # New VM: ${operation.vm_name || operation.hostname}`,
                timing: 'Immediate',
                command_type: 'security',
                purpose: 'Apply security rules to new VM while preserving existing VM protections',
                expected_output: 'Firewall updated successfully with all VM attachments',
                dependencies: ['firewall-get-attachments'],
                timestamp: new Date().toISOString()
            });
        }
        
    } else {
        // Migration commands
        commands.push({
            type: 'aggregate-remove',
            hostname: operation.hostname,
            parent_operation: 'host-migration',
            title: `Remove host from ${operation.sourceAggregate}`,
            description: `Removes compute host from current aggregate to prepare for relocation`,
            command: `openstack aggregate remove host ${operation.sourceAggregate} ${operation.hostname}`,
            timing: 'Immediate',
            command_type: 'migration',
            purpose: 'Remove host from current resource pool to enable relocation',
            expected_output: `Host ${operation.hostname} removed from aggregate ${operation.sourceAggregate}`,
            dependencies: [],
            timestamp: new Date().toISOString()
        });
        
        commands.push({
            type: 'aggregate-add',
            hostname: operation.hostname,
            parent_operation: 'host-migration',
            title: `Add host to ${operation.targetAggregate}`,
            description: `Adds compute host to target aggregate for new resource pool assignment`,
            command: `openstack aggregate add host ${operation.targetAggregate} ${operation.hostname}`,
            timing: 'After removal completes',
            command_type: 'migration',
            purpose: 'Add host to target resource pool with new billing model',
            expected_output: `Host ${operation.hostname} added to aggregate ${operation.targetAggregate}`,
            dependencies: ['aggregate-remove'],
            timestamp: new Date().toISOString()
        });
    }
    
    return commands;
}

// Update commit button state based on selected commands
function updateCommitButtonState() {
    const commitBtn = document.getElementById('commitBtn');
    if (!commitBtn) return;
    
    const selectedCommands = document.querySelectorAll('.command-operation-checkbox:checked');
    
    if (selectedCommands.length === 0) {
        commitBtn.disabled = true;
        commitBtn.innerHTML = '<i class="fas fa-check"></i> Commit Selected Operations';
        return;
    }
    
    commitBtn.disabled = false;
    commitBtn.innerHTML = `<i class="fas fa-check"></i> Commit Selected Commands (${selectedCommands.length} commands)`;
}

// Toggle operation collapse/expand
function toggleOperationCollapse(index) {
    const operationBody = document.getElementById(`operation-body-${index}`);
    const collapseBtn = document.getElementById(`collapse-btn-${index}`);
    if (!operationBody || !collapseBtn) return;
    
    const icon = collapseBtn.querySelector('i');
    
    if (operationBody.classList.contains('show')) {
        operationBody.classList.remove('show');
        icon.className = 'fas fa-chevron-right';
        collapseBtn.title = 'Expand operation';
    } else {
        operationBody.classList.add('show');
        icon.className = 'fas fa-chevron-down';
        collapseBtn.title = 'Collapse operation';
    }
}

// Toggle individual command details
function toggleCommandDetails(commandId) {
    const commandElement = document.querySelector(`[data-command-id="${commandId}"]`);
    if (!commandElement) return;
    
    const detailsElement = commandElement.querySelector('.command-details');
    const chevronIcon = document.getElementById(`${commandId}-chevron`);
    
    if (!detailsElement || !chevronIcon) return;
    
    if (detailsElement.style.display === 'none' || !detailsElement.style.display) {
        // Show details
        detailsElement.style.display = 'block';
        chevronIcon.className = 'fas fa-chevron-up';
        commandElement.querySelector('.command-collapse-btn').title = 'Collapse command details';
    } else {
        // Hide details  
        detailsElement.style.display = 'none';
        chevronIcon.className = 'fas fa-chevron-down';
        commandElement.querySelector('.command-collapse-btn').title = 'Expand command details';
    }
}

// Expand all command details
function expandAllCommands() {
    const commandElements = document.querySelectorAll('.command-operation');
    commandElements.forEach(commandElement => {
        const commandId = commandElement.getAttribute('data-command-id');
        const detailsElement = commandElement.querySelector('.command-details');
        const chevronIcon = document.getElementById(`${commandId}-chevron`);
        
        if (detailsElement && chevronIcon) {
            detailsElement.style.display = 'block';
            chevronIcon.className = 'fas fa-chevron-up';
            commandElement.querySelector('.command-collapse-btn').title = 'Collapse command details';
        }
    });
}

// Collapse all command details
function collapseAllCommands() {
    const commandElements = document.querySelectorAll('.command-operation');
    commandElements.forEach(commandElement => {
        const commandId = commandElement.getAttribute('data-command-id');
        const detailsElement = commandElement.querySelector('.command-details');
        const chevronIcon = document.getElementById(`${commandId}-chevron`);
        
        if (detailsElement && chevronIcon) {
            detailsElement.style.display = 'none';
            chevronIcon.className = 'fas fa-chevron-down';
            commandElement.querySelector('.command-collapse-btn').title = 'Expand command details';
        }
    });
}

window.toggleGroup = toggleGroup;
window.handleHostClick = handleHostClick;
// scheduleRunpodLaunch is now in window.Hyperstack namespace
window.removePendingOperation = removePendingOperation;
window.cleanupInvalidPendingOperations = cleanupInvalidPendingOperations;
window.generateIndividualCommandOperations = generateIndividualCommandOperations;
window.updateCommitButtonState = updateCommitButtonState;
window.toggleOperationCollapse = toggleOperationCollapse;
window.toggleCommandDetails = toggleCommandDetails;
window.expandAllCommands = expandAllCommands;
window.collapseAllCommands = collapseAllCommands;
window.refreshAffectedColumns = refreshAffectedColumns;

// Helper function to get contract GPU totals from current contract data
function getContractGpuTotals() {
    try {
        // Try to get contract GPU data from the contract header elements
        const contractGpuUsage = document.getElementById('contractGpuUsage');
        if (contractGpuUsage && contractGpuUsage.textContent && contractGpuUsage.textContent !== '0/0') {
            const [used, capacity] = contractGpuUsage.textContent.split('/').map(num => parseInt(num) || 0);
            return { used, capacity };
        }
        
        // Fallback: calculate from loaded parallel data if available
        if (window.loadedParallelData && window.currentGpuType) {
            const gpuData = window.loadedParallelData[window.currentGpuType];
            if (gpuData && gpuData.config && gpuData.config.contracts) {
                let totalUsed = 0;
                let totalCapacity = 0;
                
                gpuData.config.contracts.forEach(contract => {
                    const contractHosts = (gpuData.hosts || []).filter(host => 
                        host.aggregate === contract.aggregate || 
                        (host.host_data && host.host_data.aggregate === contract.aggregate)
                    );
                    
                    contractHosts.forEach(host => {
                        const gpuInfo = host.gpu_info || host.host_data?.gpu_info;
                        if (gpuInfo) {
                            totalUsed += gpuInfo.gpu_used || 0;
                            totalCapacity += gpuInfo.gpu_capacity || 0;
                        }
                    });
                });
                
                return { used: totalUsed, capacity: totalCapacity };
            }
        }
        
        return null;
    } catch (error) {
        console.warn('Error getting contract GPU totals:', error);
        return null;
    }
}

/**
 * Render a simple list of hosts as HTML (for nested groups)
 */
function renderHostList(hosts, type) {
    if (!hosts || hosts.length === 0) {
        return '<div class="text-muted text-center p-2">No hosts</div>';
    }
    
    return hosts.map(host => {
        const vmCount = host.vm_count || 0;
        const gpuInfo = host.gpu_info || {};
        const gpuUsed = gpuInfo.gpu_used || 0;
        const gpuCapacity = gpuInfo.gpu_capacity || 8;
        const gpuPercent = gpuCapacity > 0 ? Math.round((gpuUsed / gpuCapacity) * 100) : 0;
        
        // Determine owner group style
        const ownerClass = (host.tenant_info?.owner_group === 'Nexgen Cloud') ? 'nexgen-host' : 'investor-host';
        
        return `
            <div class="host-card ${ownerClass}" data-hostname="${host.hostname}" draggable="true">
                <div class="d-flex justify-content-between align-items-start">
                    <div class="flex-grow-1">
                        <div class="host-name">${host.hostname}</div>
                        <div class="host-details">
                            <small class="text-muted">
                                VMs: ${vmCount} | GPUs: ${gpuUsed}/${gpuCapacity} (${gpuPercent}%)
                            </small>
                        </div>
                        <div class="host-owner">
                            <small class="badge ${ownerClass === 'nexgen-host' ? 'bg-info' : 'bg-secondary'}">
                                ${host.tenant_info?.owner_group || 'Unknown'}
                            </small>
                        </div>
                    </div>
                    <div class="host-actions">
                        <button class="btn btn-sm btn-outline-primary" onclick="showHostDetails('${host.hostname}')" title="View Details">
                            <i class="fas fa-info-circle"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// COMPACT PROFESSIONAL HOST CARD
function createHostCardCompact(host, type, aggregateName = null) {
    const hasVms = host.has_vms;
    const gpuUsed = host.gpu_used || 0;
    const gpuCapacity = host.gpu_capacity || 8;
    const gpuRatio = host.gpu_usage_ratio || `${gpuUsed}/${gpuCapacity}`;
    const ownerGroup = host.owner_group || 'Investors';
    const tenant = host.tenant || 'Unknown';
    
    // Determine card status class
    const statusClass = hasVms ? 'has-vms' : 'available';
    
    // GPU badge styling
    const gpuBadgeClass = gpuUsed > 0 ? 'gpu-badge-compact active' : 'gpu-badge-compact zero';
    
    // Owner badge styling
    const ownerBadgeClass = ownerGroup === 'Nexgen Cloud' ? 'owner-badge-compact nexgen' : 'owner-badge-compact investors';
    
    // Create unique ID for tooltip
    const cardId = `host-${host.name.replace(/[^a-zA-Z0-9]/g, '-')}`;
    
    return `
        <div class="machine-card-compact ${statusClass}" 
             id="${cardId}"
             draggable="true" 
             data-host="${host.name}" 
             data-type="${type}"
             data-aggregate="${host.variant || aggregateName || ''}"
             data-has-vms="${hasVms}"
             data-owner-group="${ownerGroup}"
             data-nvlinks="${host.nvlinks}"
             data-outofstock-reason="${host.outofstock_reason || ''}"
             data-site="${host.site || ''}"
             data-rack="${host.rack || ''}"
             data-tenant="${host.tenant || ''}"
             data-gpu-type="${host.gpu_type || ''}"
             data-openstack-aggregate="${host.openstack_aggregate || ''}"
             data-vm-count="${host.vm_count || 0}"
             onmouseenter="showHostTooltip(event, this)"
             onmouseleave="hideHostTooltip()">
            ${host.netbox_url ? `<a href="${host.netbox_url}" target="_blank" class="netbox-link" title="View in NetBox" onclick="event.stopPropagation()"><i class="fas fa-external-link-alt"></i></a>` : ''}
            <div class="machine-card-compact-content">
                <div class="machine-info-compact">
                    <div class="machine-name-compact">${host.name}</div>
                    <div class="machine-stats-compact">
                        <span class="${gpuBadgeClass}">${gpuRatio}</span>
                        <span class="${ownerBadgeClass}">${ownerGroup === 'Nexgen Cloud' ? 'NGC' : tenant}</span>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// TOOLTIP FUNCTIONALITY
let currentTooltip = null;

function showHostTooltip(event, element) {
    // Remove existing tooltip
    hideHostTooltip();
    
    const hostName = element.dataset.host;
    const hasVms = element.dataset.hasVms === 'true';
    const ownerGroup = element.dataset.ownerGroup;
    const nvlinks = element.dataset.nvlinks;
    const outofstockReason = element.dataset.outofstockReason;
    const site = element.dataset.site;
    const rack = element.dataset.rack;
    const tenant = element.dataset.tenant;
    const gpuType = element.dataset.gpuType;
    const openstackAggregate = element.dataset.openstackAggregate;
    const vmCount = element.dataset.vmCount;
    const gpuText = element.querySelector('.gpu-badge-compact').textContent;
    
    // Get additional data from the element or parse from display
    const hasVmsText = hasVms ? 'Yes' : 'No';
    const status = hasVms ? 'In Use' : 'Available';
    
    // Create comprehensive tooltip content
    let tooltipRows = `
        <div class="tooltip-row">
            <span class="tooltip-label">Status:</span>
            <span class="tooltip-value">
                <span class="tooltip-status ${hasVms ? 'in-use' : 'available'}">${status}</span>
            </span>
        </div>`;
    
    // Add out-of-stock reason if this is an out-of-stock device
    if (outofstockReason && outofstockReason.trim() !== '') {
        tooltipRows += `
        <div class="tooltip-row">
            <span class="tooltip-label">Out-of-Stock Reason:</span>
            <span class="tooltip-value">
                <span class="tooltip-status out-of-stock">${outofstockReason}</span>
            </span>
        </div>`;
    }
    
    // Location information
    if (site || rack) {
        tooltipRows += `
        <div class="tooltip-row">
            <span class="tooltip-label">Location:</span>
            <span class="tooltip-value">${site || 'Unknown'}${rack ? ` | ${rack}` : ''}</span>
        </div>`;
    }
    
    // GPU information
    if (gpuType) {
        tooltipRows += `
        <div class="tooltip-row">
            <span class="tooltip-label">GPU Type:</span>
            <span class="tooltip-value">${gpuType}</span>
        </div>`;
    }
    
    tooltipRows += `
        <div class="tooltip-row">
            <span class="tooltip-label">GPU Usage:</span>
            <span class="tooltip-value">${gpuText}</span>
        </div>`;
    
    // VM information
    tooltipRows += `
        <div class="tooltip-row">
            <span class="tooltip-label">VMs:</span>
            <span class="tooltip-value">${vmCount || 0} (${hasVmsText})</span>
        </div>`;
    
    // Ownership information
    if (tenant && tenant !== ownerGroup) {
        tooltipRows += `
        <div class="tooltip-row">
            <span class="tooltip-label">Owner:</span>
            <span class="tooltip-value">${ownerGroup}</span>
        </div>
        <div class="tooltip-row">
            <span class="tooltip-label">Tenant:</span>
            <span class="tooltip-value">${tenant}</span>
        </div>`;
    } else {
        tooltipRows += `
        <div class="tooltip-row">
            <span class="tooltip-label">Owner:</span>
            <span class="tooltip-value">${ownerGroup}</span>
        </div>`;
    }
    
    // OpenStack aggregate
    if (openstackAggregate) {
        tooltipRows += `
        <div class="tooltip-row">
            <span class="tooltip-label">OpenStack Aggregate:</span>
            <span class="tooltip-value">${openstackAggregate}</span>
        </div>`;
    }
    
    // Hardware capabilities
    tooltipRows += `
        <div class="tooltip-row">
            <span class="tooltip-label">NVLinks:</span>
            <span class="tooltip-value">
                <span class="tooltip-status ${nvlinks === 'true' ? 'nvlinks' : ''}">${nvlinks === 'true' ? 'Yes' : nvlinks === 'false' ? 'No' : 'Unknown'}</span>
            </span>
        </div>`;
    
    const tooltipContent = `
        <div class="tooltip-header">${hostName}</div>
        ${tooltipRows}
    `;
    
    // Create tooltip element
    currentTooltip = document.createElement('div');
    currentTooltip.className = 'host-tooltip';
    currentTooltip.innerHTML = tooltipContent;
    document.body.appendChild(currentTooltip);
    
    // Position tooltip - always above the element
    const rect = element.getBoundingClientRect();
    const tooltipRect = currentTooltip.getBoundingClientRect();
    
    // Always position above the element
    let left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);
    let top = rect.top - tooltipRect.height - 15; // More spacing from element
    
    // Adjust horizontal position if tooltip would go off screen
    if (left < 10) left = 10;
    if (left + tooltipRect.width > window.innerWidth - 10) {
        left = window.innerWidth - tooltipRect.width - 10;
    }
    
    // If tooltip would go above the viewport, position it below but prefer above
    if (top < 10) {
        // Only move below if there's more space below than above
        const spaceAbove = rect.top;
        const spaceBelow = window.innerHeight - rect.bottom;
        
        if (spaceBelow > spaceAbove && spaceBelow > tooltipRect.height + 20) {
            top = rect.bottom + 15;
            // Update arrow position for bottom placement
            currentTooltip.classList.add('tooltip-below');
        } else {
            // Keep above but adjust to viewport edge
            top = 10;
        }
    }
    
    currentTooltip.style.left = left + 'px';
    currentTooltip.style.top = top + 'px';
    
    // Show tooltip with animation
    setTimeout(() => {
        if (currentTooltip) {
            currentTooltip.classList.add('show');
        }
    }, 10);
}

function hideHostTooltip() {
    if (currentTooltip) {
        currentTooltip.remove();
        currentTooltip = null;
    }
}

// Export for modular access - only the minimum needed
window.Frontend = {
    // State
    get aggregateData() { return aggregateData; },
    set aggregateData(value) { aggregateData = value; },
    get pendingOperations() { return pendingOperations; },
    set pendingOperations(value) { pendingOperations = value; },
    get availableGpuTypes() { return availableGpuTypes; },
    set availableGpuTypes(value) { availableGpuTypes = value; },
    get selectedHosts() { return selectedHosts; },
    set selectedHosts(value) { selectedHosts = value; },
    get isExecutionInProgress() { return isExecutionInProgress; },
    set isExecutionInProgress(value) { isExecutionInProgress = value; },
    
    // Functions
    renderAggregateData,
    renderHosts,
    renderHostList,
    renderOnDemandVariantColumns,
    setupDragAndDrop,
    showLoading,
    updateLoadingProgress,
    showMainContent,
    hideMainContent,
    showNotification,
    updateGpuTypeSelector,
    addToPendingOperations,
    addRunPodLaunchOperation,
    updatePendingOperationsDisplay,
    updateCardPendingIndicators,
    refreshAffectedColumns,
    createHostCard,
    createHostCardCompact
};


/**
 * Detect narrow columns and apply appropriate card layout
 */
function adjustCardLayoutForColumnWidth() {
    const columns = document.querySelectorAll('.aggregate-column');
    
    columns.forEach(column => {
        const columnWidth = column.offsetWidth;
        
        // If column is less than 120px wide, use single card per row
        if (columnWidth < 120) {
            column.classList.add('narrow-column');
        } else {
            column.classList.remove('narrow-column');
        }
    });
}

// Run on window resize and initially
window.addEventListener('resize', adjustCardLayoutForColumnWidth);
document.addEventListener('DOMContentLoaded', adjustCardLayoutForColumnWidth);

// Make tooltip functions globally available
window.showHostTooltip = showHostTooltip;
window.hideHostTooltip = hideHostTooltip;

// Debug: Log when Frontend module is exported
console.log('📄 FRONTEND.JS: Module loaded, Frontend object exported');
if (!window.scriptLoadOrder) window.scriptLoadOrder = [];
window.scriptLoadOrder.push('frontend.js loaded');
console.log('📅 FRONTEND.JS: Load order so far:', window.scriptLoadOrder);