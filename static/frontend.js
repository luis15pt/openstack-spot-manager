// Frontend UI operations for OpenStack Spot Manager - extracted from original working code
// Global state - matching original exactly
let aggregateData = {};
let pendingOperations = [];
let availableGpuTypes = [];
let selectedHosts = new Set();
let isExecutionInProgress = false;

// Show/hide loading indicator
function showLoading(show, message = 'Loading...', step = 'Initializing...', progress = 0) {
    const loadingIndicator = document.getElementById('loadingIndicator');
    const mainContent = document.getElementById('mainContent');
    const loadingMessage = document.getElementById('loadingMessage');
    const loadingStep = document.getElementById('loadingStep');
    const loadingProgress = document.getElementById('loadingProgress');
    
    if (show) {
        loadingIndicator.classList.remove('d-none');
        mainContent.classList.add('d-none');
        loadingMessage.textContent = message;
        loadingStep.textContent = step;
        loadingProgress.style.width = `${progress}%`;
    } else {
        loadingIndicator.classList.add('d-none');
        mainContent.classList.remove('d-none');
    }
}

// Update loading progress
function updateLoadingProgress(step, progress) {
    const loadingStep = document.getElementById('loadingStep');
    const loadingProgress = document.getElementById('loadingProgress');
    
    if (loadingStep) loadingStep.textContent = step;
    if (loadingProgress) loadingProgress.style.width = `${progress}%`;
}

// Show/hide main content
function showMainContent() {
    document.getElementById('mainContent').classList.remove('d-none');
}

function hideMainContent() {
    document.getElementById('mainContent').classList.add('d-none');
}

// Show notification toast
function showNotification(message, type = 'info') {
    const toastElement = document.getElementById('notificationToast');
    const toastBody = document.getElementById('toastBody');
    const toastIcon = toastElement.querySelector('.toast-header i');
    
    // Set the message
    toastBody.textContent = message;
    
    // Set the icon and style based on type
    toastIcon.className = type === 'success' ? 'fas fa-check-circle me-2 text-success' :
                         type === 'danger' ? 'fas fa-exclamation-circle me-2 text-danger' :
                         type === 'warning' ? 'fas fa-exclamation-triangle me-2 text-warning' :
                         'fas fa-info-circle me-2 text-info';
    
    // Show the toast
    const bsToast = new bootstrap.Toast(toastElement);
    bsToast.show();
}

// ORIGINAL renderAggregateData function - exactly as it was working
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
        const percentage = parseInt(data.gpu_overview.gpu_usage_percentage);
        if (percentage > 80) {
            progressBar.className = 'progress-bar bg-danger';
        } else if (percentage > 60) {
            progressBar.className = 'progress-bar bg-warning';
        } else {
            progressBar.className = 'progress-bar bg-success';
        }
        
        // Update available/in-use host counts
        document.getElementById('availableHostsCount').textContent = data.gpu_overview.hosts_available || 0;
        document.getElementById('inUseHostsCount').textContent = data.gpu_overview.hosts_in_use || 0;
    }
    
    // Render hosts for each aggregate
    if (data.runpod.hosts && data.runpod.hosts.length > 0) {
        renderHosts('runpodHosts', data.runpod.hosts, 'runpod', data.runpod.name);
    }
    
    if (data.ondemand.hosts && data.ondemand.hosts.length > 0) {
        renderOnDemandVariants('ondemandHosts', data.ondemand.hosts, data.ondemand.variants);
    }
    
    if (data.spot.hosts && data.spot.hosts.length > 0) {
        renderHosts('spotHosts', data.spot.hosts, 'spot', data.spot.name);
    }
    
    // Setup drag and drop if function exists
    if (typeof window.setupDragAndDrop === 'function') {
        window.setupDragAndDrop();
    }
}

// ORIGINAL renderOnDemandVariants function
function renderOnDemandVariants(containerId, hosts, variants) {
    const container = document.getElementById(containerId);
    
    if (!variants || variants.length === 0) {
        renderHosts(containerId, hosts, 'ondemand');
        return;
    }
    
    // Group hosts by variant
    const hostsByVariant = {};
    hosts.forEach(host => {
        const variant = host.variant || 'default';
        if (!hostsByVariant[variant]) {
            hostsByVariant[variant] = [];
        }
        hostsByVariant[variant].push(host);
    });
    
    // Render grouped hosts
    let html = '';
    
    variants.forEach(variant => {
        const variantHosts = hostsByVariant[variant] || [];
        if (variantHosts.length === 0) return;
        
        const isCollapsed = variant !== 'default';
        const groupId = `ondemand-${variant}`;
        
        html += `
            <div class="host-group mb-3">
                <div class="group-header d-flex justify-content-between align-items-center py-2 px-3 bg-light border rounded" 
                     style="cursor: pointer;" onclick="toggleGroup('${groupId}')">
                    <strong class="text-primary">
                        <i class="fas fa-server me-2"></i>${variant}
                    </strong>
                    <div>
                        <span class="badge bg-primary me-2">${variantHosts.length}</span>
                        <i class="fas fa-chevron-${isCollapsed ? 'down' : 'up'}" id="${groupId}-chevron"></i>
                    </div>
                </div>
                <div class="group-content ${isCollapsed ? 'collapse' : ''}" id="${groupId}">
                    <div class="row">
                        ${variantHosts.map(host => `<div class="col-md-6 col-lg-4 mb-3">${createHostCard(host, 'ondemand')}</div>`).join('')}
                    </div>
                </div>
            </div>`;
    });
    
    container.innerHTML = html;
}

// ORIGINAL renderHosts function
function renderHosts(containerId, hosts, type, aggregateName = null) {
    const container = document.getElementById(containerId);
    
    if (!hosts || hosts.length === 0) {
        container.innerHTML = '<p class="text-muted text-center">No hosts in this aggregate</p>';
        return;
    }
    
    // Sort hosts by name
    hosts.sort((a, b) => a.name.localeCompare(b.name));
    
    let html = '<div class="row">';
    hosts.forEach(host => {
        html += `<div class="col-md-6 col-lg-4 mb-3">${createHostCard(host, type, aggregateName)}</div>`;
    });
    html += '</div>';
    
    container.innerHTML = html;
}

// ORIGINAL createHostCard function - exactly as it was working
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
             onclick="handleHostClick(event)">
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
                         <span class="vm-label">VMs</span>` :
                        `<span class="gpu-info">${host.gpu_used}/${host.gpu_capacity}</span>
                         <span class="gpu-label">GPUs</span>`
                    }
                </div>
                <div class="tenant-info">
                    <div class="${tenantBadgeClass}">
                        <i class="${tenantIcon}"></i>
                        <span class="tenant-name">${tenant}</span>
                    </div>
                </div>
            </div>
            <div class="machine-actions">
                <button class="btn btn-sm btn-primary" onclick="event.stopPropagation(); window.OpenStack.previewMigration('${host.name}', '${type}', 'ondemand')">
                    <i class="fas fa-arrow-left"></i>
                </button>
                <button class="btn btn-sm btn-purple" onclick="event.stopPropagation(); window.Hyperstack.scheduleRunpodLaunch('${host.name}')">
                    <i class="fas fa-rocket"></i>
                </button>
                <button class="btn btn-sm btn-warning" onclick="event.stopPropagation(); window.OpenStack.previewMigration('${host.name}', '${type}', 'spot')">
                    <i class="fas fa-arrow-right"></i>
                </button>
            </div>
        </div>`;
}

// Update GPU type selector to show cached indicators
function updateGpuTypeSelector(cachedTypes = []) {
    const select = document.getElementById('gpuTypeSelect');
    if (!select) return;
    
    const options = select.querySelectorAll('option');
    
    options.forEach(option => {
        if (option.value && cachedTypes.includes(option.value)) {
            if (!option.textContent.includes('⚡')) {
                option.textContent = option.textContent + ' ⚡';
                option.title = 'Cached - will load instantly';
            }
        } else if (option.value && option.textContent.includes('⚡')) {
            option.textContent = option.textContent.replace(' ⚡', '');
            option.title = '';
        }
    });
}

// Show migration preview modal
function showMigrationModal(data, hasVms = false) {
    const modal = new bootstrap.Modal(document.getElementById('migrationModal'));
    const warningDiv = document.getElementById('migrationWarning');
    const commandPreview = document.getElementById('commandPreview');
    const confirmBtn = document.getElementById('confirmMigrationBtn');
    
    if (hasVms) {
        warningDiv.classList.remove('d-none');
    } else {
        warningDiv.classList.add('d-none');
    }
    
    if (data.commands && data.commands.length > 0) {
        const commandsHtml = data.commands.map((cmd, index) => `
            <div class="command-item mb-2">
                <div class="d-flex justify-content-between align-items-center">
                    <strong>${index + 1}. ${cmd.title || `Command ${index + 1}`}</strong>
                    <span class="badge bg-secondary">${cmd.estimated_duration || '~30s'}</span>
                </div>
                <div class="mt-1">
                    <code class="text-muted">${cmd.command || cmd.description || 'Command details'}</code>
                </div>
            </div>
        `).join('');
        commandPreview.innerHTML = commandsHtml;
    } else {
        commandPreview.innerHTML = '<p class="text-muted">No commands available for preview.</p>';
    }
    
    confirmBtn.onclick = function() {
        addToPendingOperations(data.hostname, data.sourceType, data.targetType);
        showNotification(`Added ${data.hostname} migration to pending operations`, 'success');
        modal.hide();
    };
    
    modal.show();
}

// Add to pending operations - simplified version
function addToPendingOperations(hostname, sourceType, targetType) {
    pendingOperations.push({
        hostname: hostname,
        sourceType: sourceType,
        targetType: targetType,
        timestamp: new Date().toISOString()
    });
    
    updatePendingOperationsDisplay();
    showNotification(`Added ${hostname} to pending operations`, 'info');
}

// Update pending operations display
function updatePendingOperationsDisplay() {
    const container = document.getElementById('pendingOperationsList');
    const countBadge = document.getElementById('pendingCount');
    const tabBadge = document.getElementById('pendingTabCount');
    
    if (countBadge) countBadge.textContent = pendingOperations.length;
    if (tabBadge) tabBadge.textContent = pendingOperations.length;
    
    if (!container) return;
    
    if (pendingOperations.length === 0) {
        container.innerHTML = '<p class="text-muted text-center">No pending operations</p>';
        return;
    }
    
    const operationsHtml = pendingOperations.map((op, index) => `
        <div class="pending-operation card mb-3">
            <div class="card-body">
                <h6>Move ${op.hostname} from ${op.sourceType} to ${op.targetType}</h6>
                <small class="text-muted">Added: ${new Date(op.timestamp).toLocaleString()}</small>
                <button class="btn btn-sm btn-danger float-end" onclick="removePendingOperation(${index})">Remove</button>
            </div>
        </div>
    `).join('');
    
    container.innerHTML = operationsHtml;
}

// Export all functions for modular access
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
    showLoading,
    updateLoadingProgress,
    showMainContent,
    hideMainContent,
    showNotification,
    renderAggregateData,
    renderOnDemandVariants,
    renderHosts,
    createHostCard,
    updateGpuTypeSelector,
    showMigrationModal,
    addToPendingOperations,
    updatePendingOperationsDisplay
};