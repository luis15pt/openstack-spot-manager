// Frontend UI operations for OpenStack Spot Manager
// Handles DOM manipulation, user interactions, and UI updates

// Global state
let aggregateData = null;
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

// Render aggregate data in the UI
function renderAggregateData(data) {
    console.log('🎨 Rendering aggregate data:', data);
    window.Logs.addToDebugLog('Frontend', 'Rendering aggregate data', 'info');
    
    // Clear existing host data
    document.getElementById('runpodHosts').innerHTML = '<div class="drop-zone" data-type="runpod"><p class="text-muted text-center">Drop hosts here or select and move</p></div>';
    document.getElementById('ondemandHosts').innerHTML = '<div class="drop-zone" data-type="ondemand"><p class="text-muted text-center">Drop hosts here or select and move</p></div>';
    document.getElementById('spotHosts').innerHTML = '<div class="drop-zone" data-type="spot"><p class="text-muted text-center">Drop hosts here or select and move</p></div>';
    
    // Update aggregate names in headers
    document.getElementById('runpodName').textContent = data.runpod.name ? `(${data.runpod.name})` : '';
    document.getElementById('ondemandName').textContent = data.ondemand.name ? `(${data.ondemand.name})` : '';
    document.getElementById('spotName').textContent = data.spot.name ? `(${data.spot.name})` : '';
    
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
    
    // Update counters
    updateAggregateCounters();
    
    // Setup drag and drop (call from main script)
    if (window.setupDragAndDrop) {
        window.setupDragAndDrop();
    }
    
    // Update control buttons (call from main script)
    if (window.updateControlButtons) {
        window.updateControlButtons();
    }
    
    window.Logs.addToDebugLog('Frontend', 'Aggregate data rendered successfully', 'success');
}

// Render on-demand variants with grouping
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
    let html = '<div class="drop-zone" data-type="ondemand"><p class="text-muted text-center">Drop hosts here or select and move</p></div>';
    
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

// Render hosts in a container
function renderHosts(containerId, hosts, type, aggregateName = null, variants = null) {
    const container = document.getElementById(containerId);
    
    if (!hosts || hosts.length === 0) {
        container.innerHTML = '<div class="drop-zone" data-type="' + type + '"><p class="text-muted text-center">Drop hosts here or select and move</p></div>';
        return;
    }
    
    // Filter out hosts with invalid/undefined names and log them
    const validHosts = hosts.filter(host => {
        if (!host || !host.name) {
            console.warn('⚠️ Found host with undefined name:', host);
            window.Logs.addToDebugLog('Frontend', `Invalid host object found: ${JSON.stringify(host)}`, 'warning');
            return false;
        }
        return true;
    });
    
    if (validHosts.length !== hosts.length) {
        console.warn(`⚠️ Filtered out ${hosts.length - validHosts.length} invalid hosts from ${type} aggregate`);
        window.Logs.addToDebugLog('Frontend', `Filtered ${hosts.length - validHosts.length} invalid hosts from ${type}`, 'warning');
    }
    
    // Sort valid hosts by name
    validHosts.sort((a, b) => a.name.localeCompare(b.name));
    
    // Create drop zone
    let html = '<div class="drop-zone" data-type="' + type + '"><p class="text-muted text-center">Drop hosts here or select and move</p></div>';
    
    // Add valid hosts
    html += '<div class="row">';
    validHosts.forEach(host => {
        html += `<div class="col-md-6 col-lg-4 mb-3">${createHostCard(host, type, aggregateName)}</div>`;
    });
    html += '</div>';
    
    container.innerHTML = html;
}

// Create a host card
function createHostCard(host, type, aggregateName = null) {
    // Safety check for valid host object
    if (!host || !host.name) {
        console.error('❌ Cannot create card for invalid host:', host);
        return '<div class="col-md-6 col-lg-4 mb-3"><div class="alert alert-warning">Invalid host data</div></div>';
    }
    
    const isSelected = selectedHosts.has(host.name);
    const vmCount = host.vms ? host.vms.length : 0;
    const hasVms = vmCount > 0;
    
    // Determine if host is in use
    const inUse = hasVms || host.status === 'in-use';
    
    // Get GPU usage information
    const gpuUsage = host.gpu_usage || { used: 0, total: 0 };
    const gpuPercentage = gpuUsage.total > 0 ? Math.round((gpuUsage.used / gpuUsage.total) * 100) : 0;
    
    // Determine card styling
    const cardClass = inUse ? 'host-card in-use' : 'host-card';
    const selectedClass = isSelected ? 'selected' : '';
    
    // Get status styling
    const statusClass = window.Utils.getStatusClass(host.status || 'UNKNOWN');
    const statusIcon = window.Utils.getStatusIcon(host.status || 'UNKNOWN');
    
    // Pending operation indicator
    const pendingOp = pendingOperations.find(op => op.hostname === host.name);
    const pendingIndicator = pendingOp ? `
        <div class="pending-indicator">
            <i class="fas fa-clock text-warning"></i>
            <small class="text-warning">Pending</small>
        </div>` : '';
    
    return `
        <div class="card ${cardClass} ${selectedClass}" 
             data-host="${host.name}" 
             data-type="${type}" 
             draggable="true"
             onclick="handleHostClick(event)">
            ${pendingIndicator}
            <div class="card-body">
                <div class="d-flex justify-content-between align-items-start mb-2">
                    <h6 class="card-title mb-0">${host.name}</h6>
                    <span class="badge bg-${statusClass}">
                        <i class="${statusIcon}"></i>
                    </span>
                </div>
                
                <div class="gpu-info mb-2">
                    <div class="d-flex justify-content-between">
                        <small class="text-muted">GPU Usage:</small>
                        <small class="text-muted">${gpuUsage.used}/${gpuUsage.total} (${gpuPercentage}%)</small>
                    </div>
                    <div class="progress" style="height: 4px;">
                        <div class="progress-bar ${gpuPercentage > 80 ? 'bg-danger' : gpuPercentage > 60 ? 'bg-warning' : 'bg-success'}" 
                             style="width: ${gpuPercentage}%"></div>
                    </div>
                </div>
                
                ${hasVms ? `
                    <div class="vm-info">
                        <small class="text-muted">
                            <i class="fas fa-desktop me-1"></i>
                            ${vmCount} VM${vmCount !== 1 ? 's' : ''}
                            <button class="btn btn-sm btn-outline-info ms-2" 
                                    onclick="event.stopPropagation(); showVmDetails('${host.name}')">
                                View
                            </button>
                        </small>
                    </div>
                ` : ''}
                
                <div class="host-actions mt-2">
                    <button class="btn btn-sm btn-primary me-1" 
                            onclick="event.stopPropagation(); window.OpenStack.previewMigration('${host.name}', '${type}', 'ondemand')">
                        <i class="fas fa-arrow-left"></i>
                    </button>
                    <button class="btn btn-sm btn-purple me-1" 
                            onclick="event.stopPropagation(); window.Hyperstack.scheduleRunpodLaunch('${host.name}')">
                        <i class="fas fa-rocket"></i>
                    </button>
                    <button class="btn btn-sm btn-warning" 
                            onclick="event.stopPropagation(); window.OpenStack.previewMigration('${host.name}', '${type}', 'spot')">
                        <i class="fas fa-arrow-right"></i>
                    </button>
                </div>
            </div>
        </div>`;
}

// Update aggregate counters
function updateAggregateCounters() {
    if (!aggregateData) return;
    
    // Update individual aggregate counters
    document.getElementById('runpodCount').textContent = aggregateData.runpod.hosts?.length || 0;
    document.getElementById('ondemandCount').textContent = aggregateData.ondemand.hosts?.length || 0;
    document.getElementById('spotCount').textContent = aggregateData.spot.hosts?.length || 0;
    
    // Calculate VM usage for runpod
    const runpodVms = aggregateData.runpod.hosts?.reduce((total, host) => total + (host.vms?.length || 0), 0) || 0;
    document.getElementById('runpodVmUsage').textContent = `${runpodVms} VMs`;
    
    // Calculate GPU usage for ondemand and spot
    const ondemandGpuUsage = calculateGpuUsage(aggregateData.ondemand.hosts);
    const spotGpuUsage = calculateGpuUsage(aggregateData.spot.hosts);
    const totalGpuUsage = {
        used: ondemandGpuUsage.used + spotGpuUsage.used,
        total: ondemandGpuUsage.total + spotGpuUsage.total
    };
    
    // Update ondemand GPU usage
    document.getElementById('ondemandGpuUsage').textContent = `${ondemandGpuUsage.used}/${ondemandGpuUsage.total}`;
    document.getElementById('ondemandGpuPercent').textContent = `${ondemandGpuUsage.percentage}%`;
    document.getElementById('ondemandGpuProgressBar').style.width = `${ondemandGpuUsage.percentage}%`;
    
    // Update spot GPU usage
    document.getElementById('spotGpuUsage').textContent = `${spotGpuUsage.used}/${spotGpuUsage.total}`;
    document.getElementById('spotGpuPercent').textContent = `${spotGpuUsage.percentage}%`;
    document.getElementById('spotGpuProgressBar').style.width = `${spotGpuUsage.percentage}%`;
    
    // Update total GPU usage
    const totalPercentage = totalGpuUsage.total > 0 ? Math.round((totalGpuUsage.used / totalGpuUsage.total) * 100) : 0;
    document.getElementById('totalGpuUsage').textContent = `${totalGpuUsage.used}/${totalGpuUsage.total} GPUs`;
    document.getElementById('gpuUsagePercentage').textContent = `${totalPercentage}%`;
    document.getElementById('gpuProgressBar').style.width = `${totalPercentage}%`;
    document.getElementById('gpuProgressText').textContent = `${totalPercentage}%`;
    
    // Update available/in-use host counts
    const allHosts = [
        ...(aggregateData.runpod.hosts || []),
        ...(aggregateData.ondemand.hosts || []),
        ...(aggregateData.spot.hosts || [])
    ];
    
    const availableHosts = allHosts.filter(host => !host.vms || host.vms.length === 0);
    const inUseHosts = allHosts.filter(host => host.vms && host.vms.length > 0);
    
    document.getElementById('availableHostsCount').textContent = availableHosts.length;
    document.getElementById('inUseHostsCount').textContent = inUseHosts.length;
}

// Calculate GPU usage for a set of hosts
function calculateGpuUsage(hosts) {
    if (!hosts || hosts.length === 0) {
        return { used: 0, total: 0, percentage: 0 };
    }
    
    const usage = hosts.reduce((total, host) => {
        const hostUsage = host.gpu_usage || { used: 0, total: 0 };
        return {
            used: total.used + hostUsage.used,
            total: total.total + hostUsage.total
        };
    }, { used: 0, total: 0 });
    
    const percentage = usage.total > 0 ? Math.round((usage.used / usage.total) * 100) : 0;
    
    return { ...usage, percentage };
}

// Helper function to get aggregate from card
function getAggregateFromCard(card) {
    const aggregateHeader = card.closest('.card').querySelector('.card-header');
    if (aggregateHeader) {
        const aggregateSpan = aggregateHeader.querySelector('span');
        if (aggregateSpan) {
            return aggregateSpan.textContent.trim();
        }
    }
    return null;
}

// Helper function to get target aggregate
function getTargetAggregate(targetType) {
    if (targetType === 'ondemand' && aggregateData?.ondemand?.name) {
        return aggregateData.ondemand.name;
    } else if (targetType === 'runpod' && aggregateData?.runpod?.name) {
        return aggregateData.runpod.name;
    } else if (targetType === 'spot' && aggregateData?.spot?.name) {
        return aggregateData.spot.name;
    }
    return null;
}

// Add operation to pending operations
function addToPendingOperations(hostname, sourceType, targetType, options = {}) {
    console.log(`📝 Adding to pending operations: ${hostname} from ${sourceType} to ${targetType}`);
    window.Logs.addToDebugLog('Frontend', `Adding pending operation: ${hostname} from ${sourceType} to ${targetType}`, 'info', hostname);
    
    // Handle regular migrations
    if (targetType !== 'runpod-launch') {
        // Existing migration logic...
        const sourceCard = document.querySelector(`[data-host="${hostname}"]`);
        if (!sourceCard) {
            console.error(`Host card not found for ${hostname}`);
            return;
        }
        
        const sourceAggregate = getAggregateFromCard(sourceCard);
        const targetAggregate = getTargetAggregate(targetType);
        
        if (!sourceAggregate || !targetAggregate) {
            console.error(`Could not determine aggregates for ${hostname}`);
            return;
        }
        
        // Check if already pending
        const existing = pendingOperations.find(op => op.hostname === hostname);
        if (existing) {
            console.log(`Operation already pending for ${hostname}`);
            return;
        }
        
        // Add to pending operations
        pendingOperations.push({
            hostname: hostname,
            sourceType: sourceType,
            targetType: targetType,
            sourceAggregate: sourceAggregate,
            targetAggregate: targetAggregate,
            type: 'migration',
            timestamp: new Date().toISOString()
        });
        
        updatePendingOperationsDisplay();
        updateCardPendingIndicators();
        
        showNotification(`Added ${hostname} migration to pending operations`, 'info');
        return;
    }
    
    // Handle runpod-launch operations
    console.log(`🚀 Adding RunPod launch operation for ${hostname}`);
    window.Logs.addToDebugLog('Frontend', `Adding RunPod launch operation for ${hostname}`, 'info', hostname);
    
    // Check if already pending
    const existing = pendingOperations.find(op => op.hostname === hostname && op.type === 'runpod-launch');
    if (existing) {
        console.log(`RunPod launch already pending for ${hostname}`);
        showNotification(`RunPod launch already pending for ${hostname}`, 'warning');
        return;
    }
    
    // Add runpod-launch operation
    pendingOperations.push({
        hostname: hostname,
        sourceType: sourceType,
        targetType: targetType,
        type: 'runpod-launch',
        vm_name: options.vm_name || hostname,
        manual: options.manual || false,
        timestamp: new Date().toISOString()
    });
    
    updatePendingOperationsDisplay();
    updateCardPendingIndicators();
    
    showNotification(`Added VM launch for ${hostname} to pending operations`, 'info');
}

// Update pending operations display
function updatePendingOperationsDisplay() {
    const container = document.getElementById('pendingOperationsList');
    const countBadge = document.getElementById('pendingCount');
    const tabBadge = document.getElementById('pendingTabCount');
    
    if (!container) return;
    
    // Update count badges
    countBadge.textContent = pendingOperations.length;
    tabBadge.textContent = pendingOperations.length;
    
    if (pendingOperations.length === 0) {
        container.innerHTML = `
            <div class="text-center text-muted">
                <i class="fas fa-clock fa-3x mb-3"></i>
                <p>No pending operations. Select hosts and add operations to see them here.</p>
            </div>`;
        return;
    }
    
    // Render pending operations
    const operationsHtml = pendingOperations.map((op, index) => {
        const isRunpodLaunch = op.type === 'runpod-launch';
        const icon = isRunpodLaunch ? 'fas fa-rocket' : 'fas fa-exchange-alt';
        const title = isRunpodLaunch ? 
            `🚀 Launch VM '${op.vm_name}' on ${op.hostname}` : 
            `🔄 Move ${op.hostname} from ${op.sourceAggregate} to ${op.targetAggregate}`;
        
        return `
            <div class="pending-operation card mb-3" id="pending-op-${index}">
                <div class="card-header d-flex justify-content-between align-items-center">
                    <div>
                        <i class="${icon} me-2"></i>
                        <strong>${title}</strong>
                    </div>
                    <div>
                        <button class="btn btn-sm btn-outline-danger" onclick="removePendingOperation(${index})">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
                <div class="card-body">
                    <small class="text-muted">Added: ${window.Utils.formatDate(op.timestamp)}</small>
                </div>
            </div>`;
    }).join('');
    
    container.innerHTML = operationsHtml;
}

// Update host card pending indicators
function updateCardPendingIndicators() {
    // Remove all existing pending indicators
    document.querySelectorAll('.pending-indicator').forEach(indicator => {
        indicator.remove();
    });
    
    // Add pending indicators for current operations
    pendingOperations.forEach(op => {
        const card = document.querySelector(`[data-host="${op.hostname}"]`);
        if (card) {
            const indicator = document.createElement('div');
            indicator.className = 'pending-indicator';
            indicator.innerHTML = `
                <i class="fas fa-clock text-warning"></i>
                <small class="text-warning">Pending</small>`;
            card.appendChild(indicator);
        }
    });
}

// Update host after VM launch
function updateHostAfterVMLaunch(hostname) {
    const hostCard = document.querySelector(`[data-host="${hostname}"]`);
    if (hostCard) {
        hostCard.classList.add('in-use');
        
        // Update any VM count displays
        const vmInfo = hostCard.querySelector('.vm-info');
        if (vmInfo) {
            vmInfo.innerHTML = `
                <small class="text-muted">
                    <i class="fas fa-desktop me-1"></i>
                    1 VM
                    <button class="btn btn-sm btn-outline-info ms-2" 
                            onclick="event.stopPropagation(); showVmDetails('${hostname}')">
                        View
                    </button>
                </small>`;
        }
    }
    
    // Update aggregate counters
    updateAggregateCounters();
}

// Update GPU type selector to show cached indicators
function updateGpuTypeSelector(cachedTypes = []) {
    const select = document.getElementById('gpuTypeSelect');
    if (!select) return;
    
    const options = select.querySelectorAll('option');
    
    options.forEach(option => {
        if (option.value && cachedTypes.includes(option.value)) {
            // Add indicator for actually cached types
            if (!option.textContent.includes('⚡')) {
                option.textContent = option.textContent + ' ⚡';
                option.title = 'Cached - will load instantly';
            }
        } else if (option.value && option.textContent.includes('⚡')) {
            // Remove indicator if not cached
            option.textContent = option.textContent.replace(' ⚡', '');
            option.title = '';
        }
    });
}

// Export Frontend functions
window.Frontend = {
    // State - use getters/setters for proper state management
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
    
    // UI functions
    showLoading,
    updateLoadingProgress,
    showMainContent,
    hideMainContent,
    showNotification,
    renderAggregateData,
    renderOnDemandVariants,
    renderHosts,
    createHostCard,
    updateAggregateCounters,
    calculateGpuUsage,
    addToPendingOperations,
    updatePendingOperationsDisplay,
    updateCardPendingIndicators,
    updateHostAfterVMLaunch,
    updateGpuTypeSelector,
    
    // Helper functions
    getAggregateFromCard,
    getTargetAggregate
};