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
    
    // Render hosts for each column
    if (data.ondemand.hosts) {
        renderHosts('ondemandHosts', data.ondemand.hosts, 'ondemand', data.ondemand.name, data.ondemand.variants);
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
    
    // Add drop zone at the end
    sectionsHtml += `
        <div class="drop-zone" data-type="${type}">
            <div class="drop-zone-content">
                <i class="fas fa-download"></i>
                <p>Drop hosts here to move to ${type}</p>
            </div>
        </div>
    `;
    
    container.innerHTML = sectionsHtml;
}

// EXACT ORIGINAL renderOnDemandVariants function
function renderOnDemandVariants(container, hosts, variants) {
    let variantsHtml = '';
    
    // Create a section for each variant with collapsible structure
    variants.forEach((variant, index) => {
        const variantHosts = hosts.filter(host => host.variant === variant);
        if (variantHosts.length === 0) return;
        
        const variantId = `variant-${variant.replace(/\s+/g, '-')}`;
        const isCollapsed = index > 0; // Collapse all except first variant
        
        // Separate available and in-use hosts for this variant
        const availableHosts = variantHosts.filter(host => !host.has_vms);
        const inUseHosts = variantHosts.filter(host => host.has_vms);
        
        let variantContent = '';
        
        // Available hosts for this variant
        if (availableHosts.length > 0) {
            const availableCards = availableHosts.map(host => createHostCard(host, 'ondemand', variant)).join('');
            variantContent += `
                <div class="variant-section">
                    <div class="variant-section-header">
                        <i class="fas fa-circle-check text-success"></i>
                        <span class="section-title">Available (${availableHosts.length})</span>
                    </div>
                    <div class="variant-section-content">
                        ${availableCards}
                    </div>
                </div>
            `;
        }
        
        // In-use hosts for this variant
        if (inUseHosts.length > 0) {
            const inUseCards = inUseHosts.map(host => createHostCard(host, 'ondemand', variant)).join('');
            variantContent += `
                <div class="variant-section">
                    <div class="variant-section-header">
                        <i class="fas fa-exclamation-triangle text-warning"></i>
                        <span class="section-title">In Use (${inUseHosts.length})</span>
                    </div>
                    <div class="variant-section-content">
                        ${inUseCards}
                    </div>
                </div>
            `;
        }
        
        variantsHtml += `
            <div class="variant-group">
                <div class="variant-header clickable" onclick="toggleGroup('${variantId}')">
                    <i class="fas fa-tag text-primary"></i>
                    <h6 class="mb-0">${variant} (${variantHosts.length})</h6>
                    <i class="fas fa-chevron-${isCollapsed ? 'right' : 'down'} toggle-icon" id="${variantId}-icon"></i>
                </div>
                <div class="variant-content ${isCollapsed ? 'collapsed' : ''}" id="${variantId}">
                    ${variantContent}
                </div>
            </div>
        `;
    });
    
    // Add drop zone at the end
    variantsHtml += `
        <div class="drop-zone" data-type="ondemand">
            <div class="drop-zone-content">
                <i class="fas fa-download"></i>
                <p>Drop hosts here to move to on-demand</p>
            </div>
        </div>
    `;
    
    container.innerHTML = variantsHtml;
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
    
    if (sourceType !== targetType) {
        addToPendingOperations(hostname, sourceType, targetType);
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

function addToPendingOperations(hostname, sourceType, targetType) {
    pendingOperations.push({
        hostname: hostname,
        sourceType: sourceType,
        targetType: targetType,
        timestamp: new Date().toISOString()
    });
    console.log(`Added ${hostname} to pending operations: ${sourceType} → ${targetType}`);
}

// Placeholder for scheduleRunpodLaunch function (referenced in host cards)
function scheduleRunpodLaunch(hostname) {
    console.log(`Schedule RunPod launch for ${hostname}`);
    if (window.Hyperstack && window.Hyperstack.scheduleRunpodLaunch) {
        window.Hyperstack.scheduleRunpodLaunch(hostname);
    }
}

// Make functions globally available for HTML onclick handlers
window.toggleGroup = toggleGroup;
window.handleHostClick = handleHostClick;
window.scheduleRunpodLaunch = scheduleRunpodLaunch;

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
    addToPendingOperations
};