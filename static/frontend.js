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
    // Clear existing content
    document.getElementById('ondemandHosts').innerHTML = '';
    document.getElementById('runpodHosts').innerHTML = '';
    document.getElementById('spotHosts').innerHTML = '';
    
    // Update column headers with aggregate names and counts
    document.getElementById('ondemandName').textContent = data.ondemand.name || 'N/A';
    document.getElementById('runpodName').textContent = data.runpod.name || 'N/A';
    document.getElementById('spotName').textContent = data.spot.name || 'N/A';
    
    // Show variant information if multiple variants exist
    if (data.ondemand.variants && data.ondemand.variants.length > 1) {
        const variantNames = data.ondemand.variants.map(v => v.variant).join(', ');
        document.getElementById('ondemandName').title = `Includes variants: ${variantNames}`;
    }
    
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
    
    // Update Runpod VM statistics
    if (data.runpod.hosts) {
        const totalVms = data.runpod.hosts.reduce((total, host) => total + (host.vm_count || 0), 0);
        document.getElementById('runpodVmUsage').textContent = totalVms + ' VMs';
    }
    
    // Update overall summary banner
    if (data.gpu_overview) {
        document.getElementById('totalGpuUsage').textContent = data.gpu_overview.gpu_usage_ratio + ' GPUs';
        document.getElementById('gpuUsagePercentage').textContent = data.gpu_overview.gpu_usage_percentage + '%';
        document.getElementById('gpuProgressBar').style.width = data.gpu_overview.gpu_usage_percentage + '%';
        document.getElementById('gpuProgressText').textContent = data.gpu_overview.gpu_usage_percentage + '%';
        
        // Update progress bar color based on usage
        const progressBar = document.getElementById('gpuProgressBar');
        const percentage = data.gpu_overview.gpu_usage_percentage;
        progressBar.className = 'progress-bar';
        if (percentage < 50) {
            progressBar.classList.add('bg-success');
        } else if (percentage < 80) {
            progressBar.classList.add('bg-warning');
        } else {
            progressBar.classList.add('bg-danger');
        }
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
    
    document.getElementById('availableHostsCount').textContent = totalAvailableHosts;
    document.getElementById('inUseHostsCount').textContent = totalInUseHosts;
    
    // Store data for other functions
    aggregateData = data;
    
    // Render On-Demand variants as separate columns
    if (data.ondemand.hosts) {
        renderOnDemandVariantColumns(data.ondemand);
    }
    if (data.runpod.hosts) {
        renderHosts('runpodHosts', data.runpod.hosts, 'runpod', data.runpod.name);
    }
    if (data.spot.hosts) {
        renderHosts('spotHosts', data.spot.hosts, 'spot', data.spot.name);
    }
    
    // Setup drag and drop
    setupDragAndDrop();
}

// EXACT ORIGINAL renderHosts function
function renderHosts(containerId, hosts, type, aggregateName = null, variants = null) {
    const container = document.getElementById(containerId);
    
    if (hosts.length === 0) {
        container.innerHTML = `
            <div class="drop-zone" data-type="${type}">
                <div class="empty-state">
                    <i class="fas fa-server"></i>
                    <p>No hosts in this aggregate</p>
                </div>
            </div>
        `;
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
            const nexgenCards = nexgenHosts.map(host => createHostCard(host, type, aggregateName)).join('');
            const nexgenSubGroupId = `available-nexgen-${type}`;
            
            availableSubGroups += `
                <div class="host-subgroup nexgen-group">
                    <div class="host-subgroup-header clickable" onclick="toggleGroup('${nexgenSubGroupId}')">
                        <i class="fas fa-cloud text-info"></i>
                        <span class="subgroup-title">Nexgen Cloud (${nexgenHosts.length})</span>
                        <i class="fas fa-chevron-down toggle-icon" id="${nexgenSubGroupId}-icon"></i>
                    </div>
                    <div class="host-subgroup-content" id="${nexgenSubGroupId}">
                        ${nexgenCards}
                    </div>
                </div>
            `;
        }
        
        // Investor devices sub-group
        if (investorHosts.length > 0) {
            const investorCards = investorHosts.map(host => createHostCard(host, type, aggregateName)).join('');
            const investorSubGroupId = `available-investors-${type}`;
            
            availableSubGroups += `
                <div class="host-subgroup investors-group">
                    <div class="host-subgroup-header clickable" onclick="toggleGroup('${investorSubGroupId}')">
                        <i class="fas fa-users text-warning"></i>
                        <span class="subgroup-title">Investor Devices (${investorHosts.length})</span>
                        <i class="fas fa-chevron-down toggle-icon" id="${investorSubGroupId}-icon"></i>
                    </div>
                    <div class="host-subgroup-content" id="${investorSubGroupId}">
                        ${investorCards}
                    </div>
                </div>
            `;
        }
        
        sectionsHtml += `
            <div class="host-group">
                <div class="host-group-header clickable" onclick="toggleGroup('${availableId}')">
                    <i class="fas fa-circle-check text-success"></i>
                    <h6 class="mb-0">Available (${availableHosts.length})</h6>
                    <small class="text-muted">No VMs - Ready to move</small>
                    <i class="fas fa-chevron-down toggle-icon" id="${availableId}-icon"></i>
                </div>
                <div class="host-group-content" id="${availableId}">
                    ${availableSubGroups}
                </div>
            </div>
        `;
    }
    
    // In-use hosts section
    if (inUseHosts.length > 0) {
        const inUseId = `inuse-${type}`;
        let inUseSubGroups = '';
        
        if (type === 'runpod') {
            // For Runpod, group by VM count
            const hostsByVmCount = {};
            inUseHosts.forEach(host => {
                const vmCount = host.vm_count;
                if (!hostsByVmCount[vmCount]) {
                    hostsByVmCount[vmCount] = [];
                }
                hostsByVmCount[vmCount].push(host);
            });
            
            Object.keys(hostsByVmCount).sort((a, b) => b - a).forEach(vmCount => {
                const hostsInGroup = hostsByVmCount[vmCount];
                const subGroupId = `inuse-${type}-${vmCount}vms`;
                const cards = hostsInGroup.map(host => createHostCard(host, type, aggregateName)).join('');
                
                inUseSubGroups += `
                    <div class="host-subgroup vm-group">
                        <div class="host-subgroup-header clickable" onclick="toggleGroup('${subGroupId}')">
                            <i class="fas fa-desktop text-danger"></i>
                            <span class="subgroup-title">${vmCount} VM${vmCount != 1 ? 's' : ''} (${hostsInGroup.length})</span>
                            <i class="fas fa-chevron-down toggle-icon" id="${subGroupId}-icon"></i>
                        </div>
                        <div class="host-subgroup-content" id="${subGroupId}">
                            ${cards}
                        </div>
                    </div>
                `;
            });
        } else {
            // For spot/ondemand, group by GPU usage
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
                const cards = hostsInGroup.map(host => createHostCard(host, type, aggregateName)).join('');
                
                inUseSubGroups += `
                    <div class="host-subgroup gpu-group">
                        <div class="host-subgroup-header clickable" onclick="toggleGroup('${subGroupId}')">
                            <i class="fas fa-microchip text-danger"></i>
                            <span class="subgroup-title">${gpuUsage} GPU${gpuUsage != 1 ? 's' : ''} (${hostsInGroup.length})</span>
                            <i class="fas fa-chevron-down toggle-icon" id="${subGroupId}-icon"></i>
                        </div>
                        <div class="host-subgroup-content" id="${subGroupId}">
                            ${cards}
                        </div>
                    </div>
                `;
            });
        }
        
        sectionsHtml += `
            <div class="host-group">
                <div class="host-group-header clickable" onclick="toggleGroup('${inUseId}')">
                    <i class="fas fa-exclamation-triangle text-warning"></i>
                    <h6 class="mb-0">In Use (${inUseHosts.length})</h6>
                    <small class="text-muted">Has VMs - Move carefully</small>
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
                        <i class="fas fa-chevron-down toggle-icon" id="${variantId}-icon"></i>
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
                const nexgenCards = nexgenHosts.map(host => createHostCard(host, 'ondemand', variant.aggregate)).join('');
                const nexgenSubGroupId = `available-nexgen-${variant.aggregate}`;
                
                availableSubGroups += `
                    <div class="host-subgroup nexgen-group">
                        <div class="host-subgroup-header clickable" onclick="toggleGroup('${nexgenSubGroupId}')">
                            <i class="fas fa-cloud text-info"></i>
                            <span class="subgroup-title">Nexgen Cloud (${nexgenHosts.length})</span>
                            <i class="fas fa-chevron-down toggle-icon" id="${nexgenSubGroupId}-icon"></i>
                        </div>
                        <div class="host-subgroup-content" id="${nexgenSubGroupId}">
                            ${nexgenCards}
                        </div>
                    </div>
                `;
            }
            
            // Investors devices sub-group
            if (investorHosts.length > 0) {
                const investorCards = investorHosts.map(host => createHostCard(host, 'ondemand', variant.aggregate)).join('');
                const investorSubGroupId = `available-investor-${variant.aggregate}`;
                
                availableSubGroups += `
                    <div class="host-subgroup investors-group">
                        <div class="host-subgroup-header clickable" onclick="toggleGroup('${investorSubGroupId}')">
                            <i class="fas fa-users text-warning"></i>
                            <span class="subgroup-title">Investors (${investorHosts.length})</span>
                            <i class="fas fa-chevron-down toggle-icon" id="${investorSubGroupId}-icon"></i>
                        </div>
                        <div class="host-subgroup-content" id="${investorSubGroupId}">
                            ${investorCards}
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
                        <i class="fas fa-chevron-down toggle-icon" id="${availableId}-icon"></i>
                    </div>
                    <div class="host-group-content" id="${availableId}">
                        <div class="subgroups-container">
                            ${availableSubGroups}
                        </div>
                    </div>
                </div>
            `;
        }
        
        // In-use hosts section
        if (inUseHosts.length > 0) {
            const inUseCards = inUseHosts.map(host => createHostCard(host, 'ondemand', variant.aggregate)).join('');
            const inUseId = `inuse-${variant.aggregate}`;
            
            sectionsHtml += `
                <div class="host-group">
                    <div class="host-group-header clickable" onclick="toggleGroup('${inUseId}')">
                        <i class="fas fa-exclamation-triangle text-warning"></i>
                        <h6>In Use (${inUseHosts.length})</h6>
                        <small class="text-muted">Have running VMs</small>
                        <i class="fas fa-chevron-down toggle-icon" id="${inUseId}-icon"></i>
                    </div>
                    <div class="host-group-content" id="${inUseId}">
                        ${inUseCards}
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
                    <i class="fas fa-chevron-down toggle-icon" id="${variantId}-icon"></i>
                </div>
                <div class="host-group-content" id="${variantId}">
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
             data-owner-group="${ownerGroup}">
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
                        ${ownerGroup}
                    </span>
                </div>
                <div class="nvlinks-info">
                    <span class="nvlinks-badge ${host.nvlinks ? 'enabled' : 'disabled'}" title="NVLinks ${host.nvlinks ? 'Enabled' : 'Disabled'}">
                        <i class="fas fa-link"></i>
                        NVLinks: ${host.nvlinks ? 'Yes' : 'No'}
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
                            onclick="scheduleRunpodLaunch('${host.name}')" 
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
    // Add event listeners to both machine cards and host cards
    document.querySelectorAll('.machine-card, .host-card').forEach(card => {
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
}

function handleDragLeave(e) {
    e.currentTarget.classList.remove('drag-over');
}

function handleDrop(e) {
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
        addToPendingOperations(hostname, sourceType, targetType, targetVariant);
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
        mainContent.classList.add('d-none');
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
    document.getElementById('mainContent').classList.add('d-none');
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

function addToPendingOperations(hostname, sourceType, targetType, targetVariant = null) {
    // Get the aggregate name from the card data
    const sourceCard = document.querySelector(`[data-host="${hostname}"]`);
    const sourceAggregate = sourceCard ? sourceCard.dataset.aggregate : '';
    
    console.log('🔍 addToPendingOperations:', {
        hostname,
        sourceType,
        targetType,
        sourceAggregate,
        hasVariants: aggregateData.ondemand?.variants?.length || 0
    });
    
    // For target aggregate, determine based on new data structure
    let targetAggregate = '';
    if (aggregateData.ondemand && aggregateData.ondemand.variants && aggregateData.spot) {
        if (targetType === 'spot') {
            // Moving to spot - always use the single spot aggregate
            targetAggregate = aggregateData.spot.name;
        } else if (targetType === 'runpod') {
            // Moving to runpod
            if (aggregateData.runpod) {
                targetAggregate = aggregateData.runpod.name;
            }
        } else if (targetType === 'ondemand') {
            // Moving to on-demand - use the specific variant from drop zone
            if (targetVariant) {
                // User dropped into a specific variant drop zone
                targetAggregate = targetVariant;
                
                // Check if host NVLink capability matches the target variant
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
            } else if (aggregateData.ondemand.variants && aggregateData.ondemand.variants.length > 0) {
                // No specific variant specified, use smart logic
                const sourceVariant = aggregateData.ondemand.variants.find(variant => 
                    variant.aggregate === sourceAggregate
                );
                if (sourceVariant) {
                    targetAggregate = sourceVariant.aggregate;
                } else {
                    // Fallback to first available variant
                    targetAggregate = aggregateData.ondemand.variants[0].aggregate;
                }
            } else {
                // Fallback to single ondemand aggregate
                targetAggregate = aggregateData.ondemand.name;
            }
        }
    } else {
        // Fallback for old data structure
        if (targetType === 'spot' && aggregateData.spot) {
            targetAggregate = aggregateData.spot.name;
        } else if (targetType === 'ondemand' && aggregateData.ondemand) {
            targetAggregate = aggregateData.ondemand.name;
        } else if (targetType === 'runpod' && aggregateData.runpod) {
            targetAggregate = aggregateData.runpod.name;
        }
    }
    
    console.log('🔍 Target aggregate determined:', {
        targetAggregate,
        targetType,
        variants: aggregateData.ondemand?.variants,
        variantDetails: aggregateData.ondemand?.variants?.map(v => ({
            variant: v.variant,
            aggregate: v.aggregate
        }))
    });
    
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
            const checkedAttr = isCompleted ? 'checked' : 'checked'; // Default to checked
            
            return `
                <div class="${commandClass}">
                    <div class="command-header">
                        <input type="checkbox" class="form-check-input command-operation-checkbox me-2" 
                               id="${commandId}" ${checkedAttr} ${disabledAttr}
                               onchange="updateCommitButtonState()">
                        <label class="form-check-label command-title" for="${commandId}">
                            ${statusIcon}
                            <i class="${window.Utils.getCommandIcon(cmd.command_type)}"></i>
                            <strong>${cmd.title}</strong>
                            <span class="badge ${isCompleted ? 'bg-success' : 'bg-secondary'} ms-2">${isCompleted ? 'Completed' : cmd.timing}</span>
                        </label>
                    </div>
                    
                    <div class="command-details mt-2">
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
                                    title="Expand/Collapse operation">
                                <i class="fas fa-chevron-down"></i>
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
                <div class="card-body collapse show" id="operation-body-${index}">
                    <div class="commands-list">
                        <h6 class="text-primary mb-3">
                            <i class="fas fa-list-ol me-1"></i>
                            Commands to Execute (${commands.length} total)
                        </h6>
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
    document.querySelectorAll('.machine-card, .host-card').forEach(card => {
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
    const container = document.getElementById('ondemandColumns');
    if (!container) return;
    
    console.log('🔍 renderOnDemandVariantColumns:', {
        variants: ondemandData.variants,
        totalHosts: ondemandData.hosts.length
    });
    
    let columnsHtml = '';
    
    if (ondemandData.variants && ondemandData.variants.length > 1) {
        // Multiple variants - create separate columns
        ondemandData.variants.forEach((variant, index) => {
            const variantHosts = ondemandData.hosts.filter(host => host.variant === variant.aggregate);
            const variantId = variant.aggregate.replace(/[^a-zA-Z0-9]/g, '');
            
            console.log(`🔍 Variant ${variant.variant}:`, {
                aggregate: variant.aggregate,
                hostCount: variantHosts.length
            });
            
            columnsHtml += `
                <div class="col-md-3">
                    <div class="aggregate-column" id="${variantId}Column">
                        <div class="card">
                            <div class="card-header bg-primary text-white">
                                <h4 class="mb-0">
                                    <i class="fas fa-server"></i> 
                                    ${variant.variant}
                                    <span class="badge bg-light text-dark ms-2">${variantHosts.length}</span>
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
        });
    } else {
        // Single variant or no variants - use original single column
        const variantName = ondemandData.variants && ondemandData.variants.length > 0 ? 
            ondemandData.variants[0].variant : ondemandData.name;
        
        columnsHtml = `
            <div class="col-md-3">
                <div class="aggregate-column" id="ondemandColumn">
                    <div class="card">
                        <div class="card-header bg-primary text-white">
                            <h4 class="mb-0">
                                <i class="fas fa-server"></i> 
                                ${variantName}
                                <span class="badge bg-light text-dark ms-2">${ondemandData.hosts.length}</span>
                            </h4>
                            <div class="mt-2">
                                <small class="text-light">GPU Usage: <span id="ondemandGpuUsage">0/0</span> (<span id="ondemandGpuPercent">0%</span>)</small>
                                <div class="progress mt-1" style="height: 6px;">
                                    <div class="progress-bar bg-light" role="progressbar" style="width: 0%" id="ondemandGpuProgressBar"></div>
                                </div>
                            </div>
                        </div>
                        <div class="card-body drop-zone" id="ondemandHosts" data-type="ondemand" data-variant="${ondemandData.variants?.[0]?.aggregate || ''}">
                            <!-- On-demand hosts will be dynamically inserted here -->
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    
    container.innerHTML = columnsHtml;
    
    // Now render hosts for each variant column
    if (ondemandData.variants && ondemandData.variants.length > 1) {
        ondemandData.variants.forEach(variant => {
            const variantHosts = ondemandData.hosts.filter(host => host.variant === variant.aggregate);
            const variantId = variant.aggregate.replace(/[^a-zA-Z0-9]/g, '');
            const container = document.getElementById(`${variantId}Hosts`);
            
            if (container) {
                renderHosts(container.id, variantHosts, 'ondemand', variant.aggregate);
            }
        });
    } else {
        // Single variant
        const container = document.getElementById('ondemandHosts');
        if (container) {
            renderHosts(container.id, ondemandData.hosts, 'ondemand', ondemandData.name);
        }
    }
}

// Generate individual command operations for pending operations
function generateIndividualCommandOperations(operation) {
    const commands = [];
    
    if (operation.type === 'runpod-launch') {
        // Wait command
        commands.push({
            type: 'wait-command',
            hostname: operation.hostname,
            parent_operation: 'runpod-launch',
            title: 'Wait for aggregate migration to complete',
            description: 'Ensure host is properly moved to Runpod aggregate before VM deployment - prevents deployment failures',
            command: `sleep 60  # Wait for OpenStack aggregate membership to propagate across all services`,
            timing: '60s delay',
            command_type: 'timing',
            purpose: 'Prevent deployment failures by ensuring aggregate membership is fully propagated',
            expected_output: 'Wait completed - aggregate membership propagated',
            dependencies: [],
            timestamp: new Date().toISOString()
        });
        
        // VM Launch command
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
    "name": "${operation.vm_name || operation.hostname}",
    "environment_name": "CA1-RunPod",
    "image_name": "Ubuntu Server 22.04 LTS (Jammy Jellyfish)",
    "flavor_name": "<gpu-flavor>",
    "assign_floating_ip": true,
    "user_data": "#!/bin/bash\\necho \\"api_key=<RUNPOD_API_KEY>\\" > /tmp/runpod-config"
  }'`,
            timing: 'Immediate',
            command_type: 'api',
            purpose: 'Create the virtual machine on the specified compute host with proper configuration for RunPod integration',
            expected_output: 'VM created successfully with assigned ID and floating IP',
            dependencies: ['wait-command'],
            timestamp: new Date().toISOString()
        });
        
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

window.toggleGroup = toggleGroup;
window.handleHostClick = handleHostClick;
window.scheduleRunpodLaunch = scheduleRunpodLaunch;
window.removePendingOperation = removePendingOperation;
window.generateIndividualCommandOperations = generateIndividualCommandOperations;
window.updateCommitButtonState = updateCommitButtonState;
window.toggleOperationCollapse = toggleOperationCollapse;

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
    showLoading,
    updateLoadingProgress,
    showMainContent,
    hideMainContent,
    showNotification,
    updateGpuTypeSelector,
    addToPendingOperations,
    updatePendingOperationsDisplay,
    updateCardPendingIndicators
};