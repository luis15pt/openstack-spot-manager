// OpenStack Spot Manager JavaScript

let currentGpuType = '';
let selectedHosts = new Set();
let aggregateData = {};
let pendingOperations = [];

// Background loading system
let availableGpuTypes = [];
let gpuDataCache = new Map(); // Cache for loaded GPU data
let backgroundLoadingInProgress = false;
let backgroundLoadingStarted = false;

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    initializeEventListeners();
    loadGpuTypes();
});

function loadGpuTypes() {
    fetch('/api/gpu-types')
        .then(response => response.json())
        .then(data => {
            const select = document.getElementById('gpuTypeSelect');
            // Clear existing options except the default
            select.innerHTML = '<option value="">Select GPU Type...</option>';
            
            // Store available GPU types for background loading
            availableGpuTypes = data.gpu_types;
            
            // Add discovered GPU types
            data.gpu_types.forEach(gpuType => {
                const option = document.createElement('option');
                option.value = gpuType;
                option.textContent = gpuType;
                select.appendChild(option);
            });
            
            // Show preload button if there are multiple GPU types
            if (data.gpu_types.length > 1) {
                const preloadBtn = document.getElementById('preloadAllBtn');
                if (preloadBtn) {
                    preloadBtn.style.display = 'inline-block';
                }
            }
        })
        .catch(error => {
            console.error('Error loading GPU types:', error);
            showNotification('Failed to load GPU types', 'error');
        });
}

function initializeEventListeners() {
    // GPU type selector
    document.getElementById('gpuTypeSelect').addEventListener('change', function() {
        const selectedType = this.value;
        if (selectedType) {
            currentGpuType = selectedType;
            loadAggregateData(selectedType);
        } else {
            hideMainContent();
        }
    });

    // Control buttons
    document.getElementById('moveToSpotBtn').addEventListener('click', () => moveSelectedHosts('spot'));
    document.getElementById('moveToOndemandBtn').addEventListener('click', () => moveSelectedHosts('ondemand'));
    document.getElementById('moveToRunpodBtn').addEventListener('click', () => moveSelectedHosts('runpod'));
    document.getElementById('refreshBtn').addEventListener('click', refreshData);
    
    // Migration confirmation
    document.getElementById('confirmMigrationBtn').addEventListener('click', executeMigration);
    
    // Command log buttons
    document.getElementById('refreshLogBtn').addEventListener('click', loadCommandLog);
    document.getElementById('clearLogBtn').addEventListener('click', clearCommandLog);
    
    // Pending operations buttons
    document.getElementById('commitBtn').addEventListener('click', commitAllOperations);
    document.getElementById('clearPendingBtn').addEventListener('click', clearPendingOperations);
    
    // Preload all button
    document.getElementById('preloadAllBtn').addEventListener('click', handlePreloadAll);
    
    // Tab switching - refresh data when switching to command log or results
    document.getElementById('commands-tab').addEventListener('click', loadCommandLog);
    document.getElementById('results-tab').addEventListener('click', loadResultsSummary);
    
    // Load initial command log
    loadCommandLog();
}

function loadAggregateData(gpuType, isBackgroundLoad = false) {
    // Check cache first
    if (gpuDataCache.has(gpuType)) {
        console.log(`✅ Loading ${gpuType} from cache`);
        if (!isBackgroundLoad) {
            aggregateData = gpuDataCache.get(gpuType);
            renderAggregateData(aggregateData);
            showMainContent();
            
            // Start background loading after first successful load
            if (!backgroundLoadingStarted) {
                startBackgroundLoading(gpuType);
            }
        }
        return Promise.resolve(gpuDataCache.get(gpuType));
    }
    
    if (!isBackgroundLoad) {
        showLoading(true, `Loading ${gpuType} aggregate data...`, 'Discovering aggregates...', 10);
    }
    
    return fetch(`/api/aggregates/${gpuType}`)
        .then(response => {
            if (!isBackgroundLoad) {
                updateLoadingProgress('Fetching host information...', 30);
            }
            return response.json();
        })
        .then(data => {
            if (data.error) {
                if (!isBackgroundLoad) {
                    showNotification(data.error, 'danger');
                    showLoading(false);
                }
                throw new Error(data.error);
            }
            
            if (!isBackgroundLoad) {
                updateLoadingProgress('Querying NetBox for tenant data...', 50);
            }
            
            // Cache the data
            gpuDataCache.set(gpuType, data);
            console.log(`📦 Cached data for ${gpuType}`);
            
            if (!isBackgroundLoad) {
                // Simulate processing time for NetBox queries (only for foreground loading)
                setTimeout(() => {
                    updateLoadingProgress('Calculating GPU utilization...', 70);
                    
                    setTimeout(() => {
                        updateLoadingProgress('Rendering host data...', 90);
                        
                        setTimeout(() => {
                            aggregateData = data;
                            renderAggregateData(data);
                            updateLoadingProgress('Complete!', 100);
                            
                            setTimeout(() => {
                                showLoading(false);
                                showMainContent();
                                
                                // Start background loading after first successful load
                                if (!backgroundLoadingStarted) {
                                    startBackgroundLoading(gpuType);
                                }
                            }, 200);
                        }, 200);
                    }, 300);
                }, 300);
            }
            
            return data;
        })
        .catch(error => {
            if (!isBackgroundLoad) {
                showNotification('Error loading aggregate data: ' + error.message, 'danger');
                showLoading(false);
            } else {
                console.warn(`⚠️ Background loading failed for ${gpuType}:`, error.message);
            }
            throw error;
        });
}

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
    
    // Render hosts for each column
    if (data.ondemand.hosts) {
        renderHosts('ondemandHosts', data.ondemand.hosts, 'ondemand', data.ondemand.name);
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


function renderHosts(containerId, hosts, type, aggregateName = null) {
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
    
    // In-use hosts section with sub-grouping by GPU utilization (for spot/ondemand) or VM count (for runpod)
    if (inUseHosts.length > 0) {
        const inUseId = `inuse-${type}`;
        let inUseSubGroups = '';
        
        if (type === 'runpod') {
            // For Runpod, group by VM count as before
            const hostsByVmCount = {};
            inUseHosts.forEach(host => {
                const vmCount = host.vm_count;
                if (!hostsByVmCount[vmCount]) {
                    hostsByVmCount[vmCount] = [];
                }
                hostsByVmCount[vmCount].push(host);
            });
            
            // Sort by VM count (1 VM first, then 2, 3, etc.)
            const sortedVmCounts = Object.keys(hostsByVmCount).sort((a, b) => parseInt(a) - parseInt(b));
            
            sortedVmCounts.forEach(vmCount => {
                const hosts = hostsByVmCount[vmCount];
                const hostCards = hosts.map(host => createHostCard(host, type, aggregateName)).join('');
                const subGroupId = `inuse-${vmCount}vm-${type}`;
                const vmLabel = vmCount === '1' ? '1 VM' : `${vmCount} VMs`;
                const priorityClass = vmCount === '1' ? 'priority-high' : vmCount <= '3' ? 'priority-medium' : 'priority-low';
                
                inUseSubGroups += `
                    <div class="host-subgroup ${priorityClass}">
                        <div class="host-subgroup-header clickable" onclick="toggleGroup('${subGroupId}')">
                            <i class="fas fa-server text-muted"></i>
                            <span class="subgroup-title">${vmLabel} (${hosts.length} host${hosts.length !== 1 ? 's' : ''})</span>
                            ${vmCount === '1' ? '<span class="badge bg-info ms-2">Easier to migrate</span>' : ''}
                            <i class="fas fa-chevron-down toggle-icon" id="${subGroupId}-icon"></i>
                        </div>
                        <div class="host-subgroup-content" id="${subGroupId}">
                            ${hostCards}
                        </div>
                    </div>
                `;
            });
        } else {
            // For spot/ondemand, group by GPU utilization percentage
            const hostsByGpuUsage = {};
            inUseHosts.forEach(host => {
                const gpuUsed = host.gpu_used || 0;
                const gpuCapacity = host.gpu_capacity || 8;
                const gpuUtilization = Math.round((gpuUsed / gpuCapacity) * 100);
                
                // Group by utilization ranges: Low (1-33%), Medium (34-66%), High (67-100%)
                let utilizationRange;
                if (gpuUtilization <= 33) {
                    utilizationRange = 'low';
                } else if (gpuUtilization <= 66) {
                    utilizationRange = 'medium';
                } else {
                    utilizationRange = 'high';
                }
                
                if (!hostsByGpuUsage[utilizationRange]) {
                    hostsByGpuUsage[utilizationRange] = [];
                }
                hostsByGpuUsage[utilizationRange].push(host);
            });
            
            // Sort by GPU utilization (low first - easier to migrate)
            const utilizationOrder = ['low', 'medium', 'high'];
            
            utilizationOrder.forEach(range => {
                if (hostsByGpuUsage[range]) {
                    const hosts = hostsByGpuUsage[range];
                    // Sort hosts within each range by actual GPU usage (ascending)
                    hosts.sort((a, b) => (a.gpu_used || 0) - (b.gpu_used || 0));
                    
                    const hostCards = hosts.map(host => createHostCard(host, type, aggregateName)).join('');
                    const subGroupId = `inuse-${range}-gpu-${type}`;
                    
                    let rangeLabel, priorityClass, badge;
                    if (range === 'low') {
                        rangeLabel = 'Low GPU Usage (1-33%)';
                        priorityClass = 'priority-high';
                        badge = '<span class="badge bg-success ms-2">Easier to migrate</span>';
                    } else if (range === 'medium') {
                        rangeLabel = 'Medium GPU Usage (34-66%)';
                        priorityClass = 'priority-medium';
                        badge = '<span class="badge bg-warning ms-2">Moderate effort</span>';
                    } else {
                        rangeLabel = 'High GPU Usage (67-100%)';
                        priorityClass = 'priority-low';
                        badge = '<span class="badge bg-danger ms-2">Harder to migrate</span>';
                    }
                    
                    inUseSubGroups += `
                        <div class="host-subgroup ${priorityClass}">
                            <div class="host-subgroup-header clickable" onclick="toggleGroup('${subGroupId}')">
                                <i class="fas fa-microchip text-muted"></i>
                                <span class="subgroup-title">${rangeLabel} (${hosts.length} host${hosts.length !== 1 ? 's' : ''})</span>
                                ${badge}
                                <i class="fas fa-chevron-down toggle-icon" id="${subGroupId}-icon"></i>
                            </div>
                            <div class="host-subgroup-content" id="${subGroupId}">
                                ${hostCards}
                            </div>
                        </div>
                    `;
                }
            });
        }
        
        sectionsHtml += `
            <div class="host-group">
                <div class="host-group-header clickable" onclick="toggleGroup('${inUseId}')">
                    <i class="fas fa-circle-exclamation text-warning"></i>
                    <h6 class="mb-0">In Use (${inUseHosts.length})</h6>
                    <small class="text-muted">Has running VMs - Click to expand</small>
                    <i class="fas fa-chevron-right toggle-icon" id="${inUseId}-icon"></i>
                </div>
                <div class="host-group-content collapsed" id="${inUseId}">
                    <div class="subgroups-container">
                        ${inUseSubGroups}
                    </div>
                </div>
            </div>
        `;
    }
    
    container.innerHTML = `
        <div class="drop-zone" data-type="${type}">
            ${sectionsHtml}
        </div>
    `;
}

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
             data-aggregate="${aggregateName || ''}"
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
    this.classList.add('drag-over');
}

function handleDragLeave(e) {
    if (!this.contains(e.relatedTarget)) {
        this.classList.remove('drag-over');
    }
}

function handleDrop(e) {
    e.preventDefault();
    this.classList.remove('drag-over');
    
    const hostname = e.dataTransfer.getData('text/plain');
    const sourceType = e.dataTransfer.getData('source-type');
    const targetType = this.dataset.type;
    
    if (sourceType !== targetType) {
        addToPendingOperations(hostname, sourceType, targetType);
    }
}

function handleHostClick(e) {
    e.stopPropagation();
    const hostname = this.dataset.host;
    
    if (selectedHosts.has(hostname)) {
        selectedHosts.delete(hostname);
        this.classList.remove('selected');
    } else {
        selectedHosts.add(hostname);
        this.classList.add('selected');
    }
    
    updateControlButtons();
}

function updateControlButtons() {
    const moveToSpotBtn = document.getElementById('moveToSpotBtn');
    const moveToOndemandBtn = document.getElementById('moveToOndemandBtn');
    const moveToRunpodBtn = document.getElementById('moveToRunpodBtn');
    
    const selectedOndemandHosts = Array.from(selectedHosts).filter(host => {
        const card = document.querySelector(`[data-host="${host}"]`);
        return card && card.dataset.type === 'ondemand';
    });
    
    const selectedRunpodHosts = Array.from(selectedHosts).filter(host => {
        const card = document.querySelector(`[data-host="${host}"]`);
        return card && card.dataset.type === 'runpod';
    });
    
    const selectedSpotHosts = Array.from(selectedHosts).filter(host => {
        const card = document.querySelector(`[data-host="${host}"]`);
        return card && card.dataset.type === 'spot';
    });
    
    // Enable buttons based on selected hosts from different columns
    const hasSelectedHosts = selectedHosts.size > 0;
    moveToOndemandBtn.disabled = !hasSelectedHosts || selectedOndemandHosts.length === selectedHosts.size;
    moveToRunpodBtn.disabled = !hasSelectedHosts || selectedRunpodHosts.length === selectedHosts.size;
    moveToSpotBtn.disabled = !hasSelectedHosts || selectedSpotHosts.length === selectedHosts.size;
}

function moveSelectedHosts(targetType) {
    const hostsToMove = Array.from(selectedHosts).filter(host => {
        const card = document.querySelector(`[data-host="${host}"]`);
        // Allow moving from any column to any other column
        return card && card.dataset.type !== targetType;
    });
    
    if (hostsToMove.length === 0) return;
    
    // Add all selected hosts to pending operations
    hostsToMove.forEach(hostname => {
        const card = document.querySelector(`[data-host="${hostname}"]`);
        const sourceType = card ? card.dataset.type : '';
        addToPendingOperations(hostname, sourceType, targetType);
    });
    
    // Clear selections
    selectedHosts.clear();
    document.querySelectorAll('.machine-card.selected, .host-card.selected').forEach(card => {
        card.classList.remove('selected');
    });
    updateControlButtons();
}

function previewMigration(hostname, sourceType, targetType) {
    // Get aggregate names from card data
    const sourceCard = document.querySelector(`[data-host="${hostname}"]`);
    const sourceAggregate = sourceCard ? sourceCard.dataset.aggregate : '';
    
    // Get target aggregate name from the new three-column structure
    let targetAggregate = '';
    if (targetType === 'ondemand' && aggregateData.ondemand.name) {
        targetAggregate = aggregateData.ondemand.name;
    } else if (targetType === 'runpod' && aggregateData.runpod.name) {
        targetAggregate = aggregateData.runpod.name;
    } else if (targetType === 'spot' && aggregateData.spot.name) {
        targetAggregate = aggregateData.spot.name;
    }
    
    fetch('/api/preview-migration', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            host: hostname,
            source_aggregate: sourceAggregate,
            target_aggregate: targetAggregate
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            showNotification(data.error, 'danger');
            return;
        }
        
        showMigrationModal(data, sourceType === 'spot');
    })
    .catch(error => {
        showNotification('Error previewing migration: ' + error.message, 'danger');
    });
}

function previewMultipleMigration(hostnames, sourceType, targetType) {
    const commands = [];
    let sourceAggregate = '';
    let targetAggregate = '';
    
    // For multiple hosts, we need to handle each host individually since they might be in different variants
    hostnames.forEach(hostname => {
        const sourceCard = document.querySelector(`[data-host="${hostname}"]`);
        const hostSourceAggregate = sourceCard ? sourceCard.dataset.aggregate : '';
        
        let hostTargetAggregate = '';
        if (aggregateData.ondemand_variants && aggregateData.spot) {
            if (targetType === 'spot') {
                // Moving to spot - always use the single spot aggregate
                hostTargetAggregate = aggregateData.spot.name;
            } else {
                // Moving to on-demand - find the original variant for this host
                const sourceVariant = aggregateData.ondemand_variants.find(variant => 
                    variant.aggregate === hostSourceAggregate
                );
                if (sourceVariant) {
                    hostTargetAggregate = sourceVariant.aggregate;
                }
            }
        } else {
            // Fallback for old data structure
            hostTargetAggregate = targetType === 'ondemand' ? aggregateData.ondemand.name : aggregateData.spot.name;
        }
        
        commands.push(`openstack aggregate remove host ${hostSourceAggregate} ${hostname}`);
        commands.push(`openstack aggregate add host ${hostTargetAggregate} ${hostname}`);
        
        // Set the aggregate names for the modal (use the first host's aggregates)
        if (!sourceAggregate) {
            sourceAggregate = hostSourceAggregate;
            targetAggregate = hostTargetAggregate;
        }
    });
    
    const data = {
        commands: commands,
        hosts: hostnames,
        source: sourceAggregate,
        target: targetAggregate
    };
    
    showMigrationModal(data, sourceType === 'spot');
}

function showMigrationModal(data, fromSpot) {
    const modal = new bootstrap.Modal(document.getElementById('migrationModal'));
    const commandPreview = document.getElementById('commandPreview');
    const warningDiv = document.getElementById('migrationWarning');
    
    // Show warning if moving from spot with VMs
    if (fromSpot) {
        const hasVms = data.hosts ? 
            data.hosts.some(host => document.querySelector(`[data-host="${host}"]`).dataset.hasVms === 'true') :
            document.querySelector(`[data-host="${data.host}"]`).dataset.hasVms === 'true';
        
        if (hasVms) {
            warningDiv.classList.remove('d-none');
        } else {
            warningDiv.classList.add('d-none');
        }
    } else {
        warningDiv.classList.add('d-none');
    }
    
    commandPreview.textContent = data.commands.join('\n');
    
    // Store migration data for execution
    window.currentMigrationData = data;
    
    modal.show();
}

function executeMigration() {
    const data = window.currentMigrationData;
    if (!data) return;
    
    const confirmBtn = document.getElementById('confirmMigrationBtn');
    confirmBtn.disabled = true;
    confirmBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Executing...';
    
    if (data.hosts) {
        // Multiple hosts migration
        executeMultipleMigration(data.hosts, data.source, data.target);
    } else {
        // Single host migration
        executeSingleMigration(data.host, data.source, data.target);
    }
}

function executeSingleMigration(hostname, sourceAggregate, targetAggregate) {
    fetch('/api/execute-migration', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            host: hostname,
            source_aggregate: sourceAggregate,
            target_aggregate: targetAggregate
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            showNotification(data.error, 'danger');
        } else {
            showNotification(data.message, 'success');
            refreshData();
        }
        
        bootstrap.Modal.getInstance(document.getElementById('migrationModal')).hide();
        resetMigrationButton();
    })
    .catch(error => {
        showNotification('Error executing migration: ' + error.message, 'danger');
        bootstrap.Modal.getInstance(document.getElementById('migrationModal')).hide();
        resetMigrationButton();
    });
}

function executeMultipleMigration(hostnames, sourceAggregate, targetAggregate) {
    // Execute migrations sequentially
    let completed = 0;
    let errors = [];
    
    const executeNext = (index) => {
        if (index >= hostnames.length) {
            // All migrations completed
            if (errors.length > 0) {
                showNotification(`Completed with ${errors.length} errors: ${errors.join(', ')}`, 'warning');
            } else {
                showNotification(`Successfully migrated ${completed} hosts`, 'success');
            }
            refreshData();
            bootstrap.Modal.getInstance(document.getElementById('migrationModal')).hide();
            resetMigrationButton();
            return;
        }
        
        const hostname = hostnames[index];
        fetch('/api/execute-migration', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                host: hostname,
                source_aggregate: sourceAggregate,
                target_aggregate: targetAggregate
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                errors.push(hostname);
            } else {
                completed++;
            }
            executeNext(index + 1);
        })
        .catch(error => {
            errors.push(hostname);
            executeNext(index + 1);
        });
    };
    
    executeNext(0);
}

function resetMigrationButton() {
    const confirmBtn = document.getElementById('confirmMigrationBtn');
    confirmBtn.disabled = false;
    confirmBtn.innerHTML = 'Execute Migration';
}

function showVmDetails(hostname) {
    fetch(`/api/host-vms/${hostname}`)
        .then(response => response.json())
        .then(data => {
            const modal = new bootstrap.Modal(document.getElementById('vmDetailsModal'));
            const modalBody = document.getElementById('vmDetailsBody');
            const modalTitle = document.querySelector('#vmDetailsModal .modal-title');
            
            // Update modal title
            modalTitle.textContent = `VMs on Host: ${hostname}`;
            
            if (data.vms && data.vms.length > 0) {
                const vmTableRows = data.vms.map(vm => {
                    const statusClass = getStatusClass(vm.Status);
                    const statusIcon = getStatusIcon(vm.Status);
                    const created = formatDate(vm.Created);
                    
                    return `
                        <tr>
                            <td>
                                <div class="d-flex align-items-center">
                                    <i class="fas ${statusIcon} me-2" style="color: ${getStatusColor(vm.Status)}"></i>
                                    <div>
                                        <strong>${vm.Name}</strong>
                                        <br><small class="text-muted">${vm.ID}</small>
                                    </div>
                                </div>
                            </td>
                            <td>
                                <span class="badge bg-${statusClass}">${vm.Status}</span>
                            </td>
                            <td><small>${vm.Flavor}</small></td>
                            <td><small>${vm.Image}</small></td>
                            <td><small>${created}</small></td>
                        </tr>
                    `;
                }).join('');
                
                modalBody.innerHTML = `
                    <div class="mb-3">
                        <h6 class="text-muted mb-0">Host: ${hostname}</h6>
                        <small class="text-muted">${data.count} VM${data.count !== 1 ? 's' : ''} running</small>
                    </div>
                    <div class="table-responsive">
                        <table class="table table-hover">
                            <thead>
                                <tr>
                                    <th>VM Name</th>
                                    <th>Status</th>
                                    <th>Flavor</th>
                                    <th>Image</th>
                                    <th>Created</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${vmTableRows}
                            </tbody>
                        </table>
                    </div>
                `;
            } else {
                modalBody.innerHTML = `
                    <div class="text-center py-4">
                        <i class="fas fa-server text-muted" style="font-size: 2rem;"></i>
                        <h6 class="mt-2">No VMs Running</h6>
                        <p class="text-muted">Host ${hostname} has no virtual machines currently running.</p>
                    </div>
                `;
            }
            
            modal.show();
        })
        .catch(error => {
            showNotification('Error loading VM details: ' + error.message, 'danger');
        });
}

function getStatusClass(status) {
    switch (status) {
        case 'ACTIVE': return 'success';
        case 'BUILD': return 'warning';
        case 'ERROR': return 'danger';
        case 'SHUTOFF': return 'secondary';
        case 'PAUSED': return 'info';
        case 'SUSPENDED': return 'dark';
        default: return 'secondary';
    }
}

function getStatusIcon(status) {
    switch (status) {
        case 'ACTIVE': return 'fa-play-circle';
        case 'BUILD': return 'fa-hammer';
        case 'ERROR': return 'fa-exclamation-circle';
        case 'SHUTOFF': return 'fa-stop-circle';
        case 'PAUSED': return 'fa-pause-circle';
        case 'SUSPENDED': return 'fa-sleep';
        default: return 'fa-question-circle';
    }
}

function getStatusColor(status) {
    switch (status) {
        case 'ACTIVE': return '#198754';
        case 'BUILD': return '#fd7e14';
        case 'ERROR': return '#dc3545';
        case 'SHUTOFF': return '#6c757d';
        case 'PAUSED': return '#0dcaf0';
        case 'SUSPENDED': return '#212529';
        default: return '#6c757d';
    }
}

function formatDate(dateString) {
    if (!dateString || dateString === 'N/A') return 'N/A';
    try {
        return new Date(dateString).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    } catch (e) {
        return dateString;
    }
}

function refreshData() {
    if (currentGpuType) {
        selectedHosts.clear();
        // Clear cache for current GPU type to force fresh data
        gpuDataCache.delete(currentGpuType);
        showLoading(true, 'Refreshing data...', 'Clearing cache...', 5);
        loadAggregateData(currentGpuType);
    }
}

// Background loading system
function startBackgroundLoading(currentGpuType) {
    if (backgroundLoadingStarted || backgroundLoadingInProgress) {
        return;
    }
    
    backgroundLoadingStarted = true;
    backgroundLoadingInProgress = true;
    
    // Show background loading status
    const statusElement = document.getElementById('backgroundLoadingStatus');
    if (statusElement) {
        statusElement.style.display = 'inline';
    }
    
    console.log('🚀 Starting background loading for other GPU types...');
    
    // Get GPU types to load in background (excluding current one)
    const typesToLoad = availableGpuTypes.filter(type => 
        type !== currentGpuType && !gpuDataCache.has(type)
    );
    
    if (typesToLoad.length === 0) {
        console.log('✅ All GPU types already cached');
        backgroundLoadingInProgress = false;
        if (statusElement) {
            statusElement.style.display = 'none';
        }
        return;
    }
    
    console.log(`📋 Loading ${typesToLoad.length} GPU types in background: ${typesToLoad.join(', ')}`);
    
    // Load all types concurrently using Promise.allSettled for better error handling
    const loadPromises = typesToLoad.map(gpuType => 
        loadAggregateData(gpuType, true)
            .then(data => {
                console.log(`✅ Background loaded: ${gpuType}`);
                return { gpuType, success: true, data };
            })
            .catch(error => {
                console.warn(`⚠️ Background loading failed for ${gpuType}:`, error.message);
                return { gpuType, success: false, error: error.message };
            })
    );
    
    Promise.allSettled(loadPromises)
        .then(results => {
            const successful = results.filter(r => r.status === 'fulfilled' && r.value.success);
            const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.success));
            
            console.log(`📊 Background loading complete: ${successful.length} successful, ${failed.length} failed`);
            
            if (successful.length > 0) {
                // Update GPU type selector to indicate cached types
                updateGpuTypeSelector();
                
                // Show success notification
                showNotification(`Background loading complete: ${successful.length} GPU types cached`, 'success');
            }
            
            backgroundLoadingInProgress = false;
            
            // Hide background loading status
            if (statusElement) {
                statusElement.style.display = 'none';
            }
        })
        .catch(error => {
            console.error('❌ Background loading error:', error);
            backgroundLoadingInProgress = false;
            
            // Hide background loading status
            if (statusElement) {
                statusElement.style.display = 'none';
            }
        });
}

function updateGpuTypeSelector() {
    const select = document.getElementById('gpuTypeSelect');
    const options = select.querySelectorAll('option');
    
    options.forEach(option => {
        if (option.value && gpuDataCache.has(option.value)) {
            // Add indicator for cached types
            if (!option.textContent.includes('⚡')) {
                option.textContent = option.textContent + ' ⚡';
                option.title = 'Cached - will load instantly';
            }
        }
    });
}

function preloadAllGpuTypes() {
    // Alternative function to preload all types at once (can be called manually)
    if (availableGpuTypes.length === 0) {
        console.warn('⚠️ No GPU types available for preloading');
        return Promise.resolve();
    }
    
    console.log('🔄 Preloading all GPU types...');
    
    const loadPromises = availableGpuTypes.map(gpuType => 
        loadAggregateData(gpuType, true)
    );
    
    return Promise.allSettled(loadPromises)
        .then(results => {
            const successful = results.filter(r => r.status === 'fulfilled').length;
            console.log(`📊 Preloading complete: ${successful}/${availableGpuTypes.length} GPU types loaded`);
            updateGpuTypeSelector();
            return results;
        });
}

function handlePreloadAll() {
    const preloadBtn = document.getElementById('preloadAllBtn');
    if (preloadBtn) {
        preloadBtn.disabled = true;
        preloadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';
    }
    
    // Show background loading status
    const statusElement = document.getElementById('backgroundLoadingStatus');
    if (statusElement) {
        statusElement.style.display = 'inline';
        statusElement.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Preloading all types...';
    }
    
    const uncachedTypes = availableGpuTypes.filter(type => !gpuDataCache.has(type));
    
    if (uncachedTypes.length === 0) {
        showNotification('All GPU types are already cached!', 'info');
        if (preloadBtn) {
            preloadBtn.disabled = false;
            preloadBtn.innerHTML = '<i class="fas fa-download"></i> Preload All';
        }
        if (statusElement) {
            statusElement.style.display = 'none';
        }
        return;
    }
    
    preloadAllGpuTypes()
        .then(results => {
            const successful = results.filter(r => r.status === 'fulfilled').length;
            const total = results.length;
            
            showNotification(`Preloading complete: ${successful}/${total} GPU types cached`, 'success');
            
            if (preloadBtn) {
                preloadBtn.disabled = false;
                preloadBtn.innerHTML = '<i class="fas fa-check"></i> All Cached';
                setTimeout(() => {
                    preloadBtn.innerHTML = '<i class="fas fa-download"></i> Preload All';
                }, 3000);
            }
        })
        .catch(error => {
            console.error('❌ Preloading error:', error);
            showNotification('Error during preloading', 'danger');
            
            if (preloadBtn) {
                preloadBtn.disabled = false;
                preloadBtn.innerHTML = '<i class="fas fa-download"></i> Preload All';
            }
        })
        .finally(() => {
            if (statusElement) {
                statusElement.style.display = 'none';
            }
        });
}

function showLoading(show, message = 'Loading...', step = 'Initializing...', progress = 0) {
    const loadingIndicator = document.getElementById('loadingIndicator');
    const loadingMessage = document.getElementById('loadingMessage');
    const loadingStep = document.getElementById('loadingStep');
    const loadingProgress = document.getElementById('loadingProgress');
    
    if (show) {
        loadingIndicator.classList.remove('d-none');
        loadingMessage.textContent = message;
        loadingStep.textContent = step;
        loadingProgress.style.width = progress + '%';
    } else {
        loadingIndicator.classList.add('d-none');
        // Reset loading state
        loadingMessage.textContent = 'Loading...';
        loadingStep.textContent = 'Initializing...';
        loadingProgress.style.width = '0%';
    }
}

function updateLoadingProgress(step, progress) {
    const loadingStep = document.getElementById('loadingStep');
    const loadingProgress = document.getElementById('loadingProgress');
    
    if (loadingStep && loadingProgress) {
        loadingStep.textContent = step;
        loadingProgress.style.width = progress + '%';
    }
}

function showMainContent() {
    document.getElementById('mainContent').classList.remove('d-none');
}

function hideMainContent() {
    document.getElementById('mainContent').classList.add('d-none');
}

function showNotification(message, type = 'info') {
    const toast = document.getElementById('notificationToast');
    const toastBody = document.getElementById('toastBody');
    
    // Remove existing classes
    toast.classList.remove('bg-success', 'bg-danger', 'bg-warning', 'bg-info');
    
    // Add appropriate class
    if (type === 'success') toast.classList.add('bg-success');
    else if (type === 'danger') toast.classList.add('bg-danger');
    else if (type === 'warning') toast.classList.add('bg-warning');
    else toast.classList.add('bg-info');
    
    toastBody.textContent = message;
    
    const bsToast = new bootstrap.Toast(toast);
    bsToast.show();
}

// Command Log Functions
function loadCommandLog() {
    fetch('/api/command-log')
        .then(response => response.json())
        .then(data => {
            renderCommandLog(data.commands);
            updateCommandCount(data.count);
        })
        .catch(error => {
            console.error('Error loading command log:', error);
        });
}

function renderCommandLog(commands) {
    const container = document.getElementById('commandLogContainer');
    
    if (commands.length === 0) {
        container.innerHTML = `
            <div class="text-center text-muted">
                <i class="fas fa-terminal fa-3x mb-3"></i>
                <p>No commands executed yet. Commands will appear here when you perform migrations.</p>
            </div>
        `;
        return;
    }
    
    // Sort commands by timestamp (newest first)
    const sortedCommands = commands.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    const commandEntries = sortedCommands.map(cmd => createCommandLogEntry(cmd)).join('');
    container.innerHTML = commandEntries;
}

function createCommandLogEntry(cmd) {
    const timestamp = new Date(cmd.timestamp).toLocaleString();
    const statusClass = cmd.success === null ? 'preview' : (cmd.success ? 'success' : (cmd.type === 'timeout' ? 'timeout' : 'error'));
    const statusText = cmd.success === null ? 'preview' : (cmd.success ? 'success' : cmd.type);
    
    let output = '';
    if (cmd.type !== 'preview') {
        const outputText = cmd.stdout || cmd.stderr || 'No output';
        const outputClass = cmd.stderr ? 'error' : (outputText === 'No output' ? 'empty' : '');
        output = `<div class="command-output ${outputClass}">${outputText}</div>`;
    }
    
    return `
        <div class="command-log-entry ${statusClass}">
            <div class="command-header">
                <span class="command-status ${statusClass}">${statusText}</span>
                <span class="command-timestamp">${timestamp}</span>
            </div>
            <div class="command-text">${cmd.command}</div>
            ${output}
        </div>
    `;
}

function clearCommandLog() {
    if (!confirm('Are you sure you want to clear the command log? This action cannot be undone.')) {
        return;
    }
    
    fetch('/api/clear-log', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        }
    })
    .then(response => response.json())
    .then(data => {
        showNotification(data.message, 'success');
        loadCommandLog();
        loadResultsSummary();
    })
    .catch(error => {
        showNotification('Error clearing log: ' + error.message, 'danger');
    });
}

function updateCommandCount(count) {
    const badge = document.getElementById('commandCount');
    badge.textContent = count;
    badge.classList.add('updated');
    setTimeout(() => badge.classList.remove('updated'), 500);
}

// Results Summary Functions
function loadResultsSummary() {
    fetch('/api/command-log')
        .then(response => response.json())
        .then(data => {
            renderResultsSummary(data.commands);
        })
        .catch(error => {
            console.error('Error loading results summary:', error);
        });
}

function renderResultsSummary(commands) {
    const stats = {
        total: commands.length,
        success: commands.filter(cmd => cmd.success === true).length,
        error: commands.filter(cmd => cmd.success === false).length,
        preview: commands.filter(cmd => cmd.success === null).length
    };
    
    // Update stat cards
    document.getElementById('totalCount').textContent = stats.total;
    document.getElementById('successCount').textContent = stats.success;
    document.getElementById('errorCount').textContent = stats.error;
    document.getElementById('previewCount').textContent = stats.preview;
    
    // Render recent results (last 10 executed commands, excluding previews)
    const executedCommands = commands
        .filter(cmd => cmd.success !== null)
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, 10);
    
    const recentResultsList = document.getElementById('recentResultsList');
    
    if (executedCommands.length === 0) {
        recentResultsList.innerHTML = `
            <div class="text-center text-muted">
                <i class="fas fa-chart-line fa-3x mb-3"></i>
                <p>No results yet. Execute some commands to see results here.</p>
            </div>
        `;
        return;
    }
    
    const recentItems = executedCommands.map(cmd => {
        const resultClass = cmd.success ? 'success' : 'error';
        const time = new Date(cmd.timestamp).toLocaleTimeString();
        
        return `
            <div class="result-item ${resultClass}">
                <div class="result-command">${cmd.command}</div>
                <div class="result-time">${time}</div>
            </div>
        `;
    }).join('');
    
    recentResultsList.innerHTML = recentItems;
}

// Enhanced migration functions to refresh logs
function executeMigration() {
    const data = window.currentMigrationData;
    if (!data) return;
    
    const confirmBtn = document.getElementById('confirmMigrationBtn');
    confirmBtn.disabled = true;
    confirmBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Executing...';
    
    if (data.hosts) {
        // Multiple hosts migration
        executeMultipleMigration(data.hosts, data.source, data.target);
    } else {
        // Single host migration
        executeSingleMigration(data.host, data.source, data.target);
    }
}

function executeSingleMigration(hostname, sourceAggregate, targetAggregate) {
    fetch('/api/execute-migration', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            host: hostname,
            source_aggregate: sourceAggregate,
            target_aggregate: targetAggregate
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            showNotification(data.error, 'danger');
        } else {
            showNotification(data.message, 'success');
            refreshData();
            // Refresh command log and results after successful migration
            loadCommandLog();
            loadResultsSummary();
        }
        
        bootstrap.Modal.getInstance(document.getElementById('migrationModal')).hide();
        resetMigrationButton();
    })
    .catch(error => {
        showNotification('Error executing migration: ' + error.message, 'danger');
        bootstrap.Modal.getInstance(document.getElementById('migrationModal')).hide();
        resetMigrationButton();
    });
}

function executeMultipleMigration(hostnames, sourceAggregate, targetAggregate) {
    // Execute migrations sequentially
    let completed = 0;
    let errors = [];
    
    const executeNext = (index) => {
        if (index >= hostnames.length) {
            // All migrations completed
            if (errors.length > 0) {
                showNotification(`Completed with ${errors.length} errors: ${errors.join(', ')}`, 'warning');
            } else {
                showNotification(`Successfully migrated ${completed} hosts`, 'success');
            }
            refreshData();
            // Refresh command log and results after migrations
            loadCommandLog();
            loadResultsSummary();
            bootstrap.Modal.getInstance(document.getElementById('migrationModal')).hide();
            resetMigrationButton();
            return;
        }
        
        const hostname = hostnames[index];
        fetch('/api/execute-migration', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                host: hostname,
                source_aggregate: sourceAggregate,
                target_aggregate: targetAggregate
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                errors.push(hostname);
            } else {
                completed++;
            }
            executeNext(index + 1);
        })
        .catch(error => {
            errors.push(hostname);
            executeNext(index + 1);
        });
    };
    
    executeNext(0);
}

// Override the original functions to include log refresh
const originalPreviewMigration = previewMigration;
function previewMigration(hostname, sourceType, targetType) {
    originalPreviewMigration(hostname, sourceType, targetType);
    // Refresh command log after preview to show the preview entries
    setTimeout(() => {
        loadCommandLog();
        loadResultsSummary();
    }, 100);
}

// Pending Operations Management
function generateCommandsForOperation(operation) {
    const commands = [
        `openstack aggregate remove host ${operation.sourceAggregate} ${operation.hostname}`,
        `openstack aggregate add host ${operation.targetAggregate} ${operation.hostname}`
    ];
    return commands;
}

function addToPendingOperations(hostname, sourceType, targetType) {
    // Get the aggregate name from the card data
    const sourceCard = document.querySelector(`[data-host="${hostname}"]`);
    const sourceAggregate = sourceCard ? sourceCard.dataset.aggregate : '';
    
    // For target aggregate, determine based on new data structure
    let targetAggregate = '';
    if (aggregateData.ondemand_variants && aggregateData.spot) {
        if (targetType === 'spot') {
            // Moving to spot - always use the single spot aggregate
            targetAggregate = aggregateData.spot.name;
        } else {
            // Moving to on-demand - find the original variant for this host
            const sourceVariant = aggregateData.ondemand_variants.find(variant => 
                variant.aggregate === sourceAggregate
            );
            if (sourceVariant) {
                targetAggregate = sourceVariant.aggregate;
            }
        }
    } else {
        // Fallback for old data structure
        targetAggregate = targetType === 'ondemand' ? aggregateData.ondemand.name : aggregateData.spot.name;
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
}

function updatePendingOperationsDisplay() {
    const section = document.getElementById('pendingOperationsSection');
    const list = document.getElementById('pendingOperationsList');
    const count = document.getElementById('pendingCount');
    
    count.textContent = pendingOperations.length;
    count.classList.add('updated');
    setTimeout(() => count.classList.remove('updated'), 500);
    
    // Update visual indicators on cards
    updateCardPendingIndicators();
    
    if (pendingOperations.length === 0) {
        section.style.display = 'none';
        return;
    }
    
    section.style.display = 'block';
    
    const operationsHtml = pendingOperations.map((op, index) => {
        const commands = generateCommandsForOperation(op);
        return `
        <div class="pending-operation-item" data-index="${index}">
            <div class="operation-details">
                <div class="operation-header">
                    <strong>${op.hostname}</strong>
                    <span class="operation-flow">
                        <span class="badge bg-${op.sourceType === 'ondemand' ? 'primary' : 'warning'}">${op.sourceAggregate}</span>
                        <i class="fas fa-arrow-right mx-2"></i>
                        <span class="badge bg-${op.targetType === 'ondemand' ? 'primary' : 'warning'}">${op.targetAggregate}</span>
                    </span>
                    <button class="btn btn-sm btn-outline-secondary me-2" onclick="toggleCommands(${index})" title="Show/hide commands">
                        <i class="fas fa-code"></i>
                    </button>
                </div>
                <div class="operation-commands" id="commands-${index}" style="display: none;">
                    <div class="command-list">
                        ${commands.map((cmd, cmdIndex) => `
                            <div class="command-item">
                                <span class="command-number">${cmdIndex + 1}.</span>
                                <code class="command-text">${cmd}</code>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
            <button class="btn btn-sm btn-outline-danger" onclick="removePendingOperation(${index})">
                <i class="fas fa-times"></i>
            </button>
        </div>
        `;
    }).join('');
    
    list.innerHTML = operationsHtml;
}

function toggleCommands(index) {
    const commandsDiv = document.getElementById(`commands-${index}`);
    const toggleBtn = commandsDiv.parentElement.querySelector('button[onclick*="toggleCommands"]');
    const icon = toggleBtn.querySelector('i');
    
    if (commandsDiv.style.display === 'none') {
        commandsDiv.style.display = 'block';
        icon.className = 'fas fa-code-branch';
        toggleBtn.title = 'Hide commands';
    } else {
        commandsDiv.style.display = 'none';
        icon.className = 'fas fa-code';
        toggleBtn.title = 'Show commands';
    }
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

function clearPendingOperations() {
    if (pendingOperations.length === 0) return;
    
    if (confirm(`Clear all ${pendingOperations.length} pending operations?`)) {
        pendingOperations = [];
        updatePendingOperationsDisplay();
        showNotification('Cleared all pending operations', 'info');
    }
}

function commitAllOperations() {
    if (pendingOperations.length === 0) {
        showNotification('No pending operations to commit', 'warning');
        return;
    }
    
    const operationCount = pendingOperations.length;
    const confirmMessage = `Execute ${operationCount} pending operation${operationCount > 1 ? 's' : ''}?`;
    
    if (!confirm(confirmMessage)) return;
    
    const commitBtn = document.getElementById('commitBtn');
    commitBtn.disabled = true;
    commitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Executing...';
    
    executeAllPendingOperations();
}

function executeAllPendingOperations() {
    const operations = [...pendingOperations]; // Copy the array
    let completed = 0;
    let errors = [];
    
    const executeNext = (index) => {
        if (index >= operations.length) {
            // All operations completed
            const commitBtn = document.getElementById('commitBtn');
            commitBtn.disabled = false;
            commitBtn.innerHTML = '<i class="fas fa-check"></i> Commit All Operations';
            
            if (errors.length > 0) {
                showNotification(`Completed with ${errors.length} errors: ${errors.join(', ')}`, 'warning');
            } else {
                showNotification(`Successfully executed ${completed} operations`, 'success');
                pendingOperations = []; // Clear pending operations on success
                updatePendingOperationsDisplay();
            }
            
            refreshData();
            loadCommandLog();
            loadResultsSummary();
            return;
        }
        
        const operation = operations[index];
        
        fetch('/api/execute-migration', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                host: operation.hostname,
                source_aggregate: operation.sourceAggregate,
                target_aggregate: operation.targetAggregate
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                errors.push(operation.hostname);
            } else {
                completed++;
                // Remove this operation from pending list
                const pendingIndex = pendingOperations.findIndex(op => 
                    op.hostname === operation.hostname && 
                    op.sourceAggregate === operation.sourceAggregate &&
                    op.targetAggregate === operation.targetAggregate
                );
                if (pendingIndex !== -1) {
                    pendingOperations.splice(pendingIndex, 1);
                    updatePendingOperationsDisplay();
                }
            }
            executeNext(index + 1);
        })
        .catch(error => {
            errors.push(operation.hostname);
            executeNext(index + 1);
        });
    };
    
    executeNext(0);
}

// Clear selections when clicking outside
document.addEventListener('click', function(e) {
    if (!e.target.closest('.machine-card') && !e.target.closest('.host-card') && !e.target.closest('.btn')) {
        selectedHosts.clear();
        document.querySelectorAll('.machine-card.selected, .host-card.selected').forEach(card => {
            card.classList.remove('selected');
        });
        updateControlButtons();
    }
});

// Runpod Launch Functionality
function scheduleRunpodLaunch(hostname) {
    // Add to pending operations with manual trigger (immediate)
    addToPendingOperations(hostname, 'runpod', 'runpod-launch', {
        vm_name: hostname,
        manual: true,
        scheduled_time: Date.now() // Immediate processing
    });
    
    showNotification(`Scheduled VM launch for ${hostname}`, 'info');
}


// Enhanced addToPendingOperations to support runpod-launch
function addToPendingOperations(hostname, sourceType, targetType, options = {}) {
    // Handle regular migrations
    if (targetType !== 'runpod-launch') {
        // Existing migration logic
        const sourceCard = document.querySelector(`[data-host="${hostname}"]`);
        const sourceAggregate = sourceCard ? sourceCard.dataset.aggregate : '';
        
        let targetAggregate = '';
        if (aggregateData.ondemand_variants && aggregateData.spot) {
            if (targetType === 'spot') {
                targetAggregate = aggregateData.spot.name;
            } else {
                const sourceVariant = aggregateData.ondemand_variants.find(variant => 
                    variant.aggregate === sourceAggregate
                );
                targetAggregate = sourceVariant ? sourceVariant.aggregate : (aggregateData.ondemand.name || '');
            }
        } else {
            // Fallback for single aggregate structure
            if (targetType === 'spot') {
                targetAggregate = aggregateData.spot ? aggregateData.spot.name : '';
            } else if (targetType === 'ondemand') {
                targetAggregate = aggregateData.ondemand ? aggregateData.ondemand.name : '';
            } else if (targetType === 'runpod') {
                targetAggregate = aggregateData.runpod ? aggregateData.runpod.name : '';
            }
        }
        
        // Preview migration commands
        const migrationCommands = [
            `openstack aggregate remove host ${sourceAggregate} ${hostname}`,
            `openstack aggregate add host ${targetAggregate} ${hostname}`
        ];
        
        pendingOperations.push({
            type: 'migration',
            hostname: hostname,
            sourceType: sourceType,
            targetType: targetType,
            sourceAggregate: sourceAggregate,
            targetAggregate: targetAggregate,
            commands: migrationCommands,
            timestamp: new Date().toISOString()
        });
    } else {
        // Handle runpod launch operations - fetch preview command
        fetch('/api/preview-runpod-launch', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ hostname: hostname })
        })
        .then(response => response.json())
        .then(previewData => {
            const operation = {
                type: 'runpod-launch',
                hostname: hostname,
                vm_name: options.vm_name || hostname,
                manual: options.manual || false,
                auto_generated: options.auto_generated || false,
                scheduled_time: options.scheduled_time || Date.now(),
                commands: previewData.command ? [previewData.command] : [`Launch VM ${hostname} via Hyperstack API`],
                timestamp: new Date().toISOString()
            };
            
            pendingOperations.push(operation);
            updatePendingOperationsDisplay();
        })
        .catch(error => {
            console.error('Error fetching runpod preview:', error);
            // Fallback operation without detailed command
            pendingOperations.push({
                type: 'runpod-launch',
                hostname: hostname,
                vm_name: options.vm_name || hostname,
                manual: options.manual || false,
                auto_generated: options.auto_generated || false,
                scheduled_time: options.scheduled_time || Date.now(),
                commands: [`Launch VM ${hostname} via Hyperstack API`],
                timestamp: new Date().toISOString()
            });
            updatePendingOperationsDisplay();
        });
        
        // Early return to avoid duplicate call to updatePendingOperationsDisplay
        if (targetType === 'runpod-launch') {
            showNotification(`Added VM launch for ${hostname} to pending operations`, 'info');
            return;
        }
    }
    
    updatePendingOperationsDisplay();
    
    if (targetType === 'runpod-launch') {
        showNotification(`Added VM launch for ${hostname} to pending operations`, 'info');
    } else {
        showNotification(`Added ${hostname} to pending operations (${sourceType} → ${targetType})`, 'info');
    }
}

// Enhanced updatePendingOperationsDisplay to show countdown timers
function updatePendingOperationsDisplay() {
    const section = document.getElementById('pendingOperationsSection');
    const list = document.getElementById('pendingOperationsList');
    const count = document.getElementById('pendingCount');
    
    count.textContent = pendingOperations.length;
    count.classList.add('updated');
    setTimeout(() => count.classList.remove('updated'), 500);
    
    if (pendingOperations.length === 0) {
        section.style.display = 'none';
        return;
    }
    
    section.style.display = 'block';
    
    const currentTime = Date.now();
    const operationsHtml = pendingOperations.map((op, index) => {
        if (op.type === 'runpod-launch') {
            const commandsHtml = op.commands ? `
                <div class="operation-commands">
                    <div class="command-list">
                        ${op.commands.map((cmd, cmdIndex) => `
                            <div class="command-item">
                                <span class="command-number">${cmdIndex + 1}.</span>
                                <span class="command-text">${cmd}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : '';
            
            return `
                <div class="pending-operation-item ready">
                    <div class="operation-details">
                        <div class="operation-header">
                            <strong><i class="fas fa-rocket text-primary"></i> Launch VM '${op.vm_name}' on host ${op.hostname}</strong>
                            <div class="operation-actions">
                                <span class="badge bg-success">Ready to launch</span>
                                <button class="btn btn-sm btn-outline-danger ms-2" onclick="removePendingOperation(${index})" title="Remove operation">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                        </div>
                        ${commandsHtml}
                        <div class="operation-details-text">
                            <small class="text-muted">
                                Manual VM launch • VM name: ${op.vm_name} • ${new Date(op.timestamp).toLocaleTimeString()}
                            </small>
                        </div>
                    </div>
                </div>
            `;
        } else {
            // Regular migration operation
            const commandsHtml = op.commands ? `
                <div class="operation-commands">
                    <div class="command-list">
                        ${op.commands.map((cmd, cmdIndex) => `
                            <div class="command-item">
                                <span class="command-number">${cmdIndex + 1}.</span>
                                <span class="command-text">${cmd}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : '';
            
            return `
                <div class="pending-operation-item">
                    <div class="operation-details">
                        <div class="operation-header">
                            <strong>${op.hostname}</strong>
                            <div class="operation-actions">
                                <button class="btn btn-sm btn-outline-danger ms-2" onclick="removePendingOperation(${index})" title="Remove operation">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                        </div>
                        <div class="operation-flow">
                            <span class="badge bg-secondary">${op.sourceType}</span>
                            <i class="fas fa-arrow-right mx-2"></i>
                            <span class="badge bg-primary">${op.targetType}</span>
                        </div>
                        ${commandsHtml}
                        <div class="operation-details-text">
                            <small class="text-muted">${op.sourceAggregate} → ${op.targetAggregate} • ${new Date(op.timestamp).toLocaleTimeString()}</small>
                        </div>
                    </div>
                </div>
            `;
        }
    }).join('');
    
    list.innerHTML = operationsHtml;
    
    // Update pending indicators on cards
    document.querySelectorAll('.machine-card, .host-card').forEach(card => {
        card.classList.remove('pending-operation');
    });
    
    pendingOperations.forEach(op => {
        const card = document.querySelector(`[data-host="${op.hostname}"]`);
        if (card) {
            card.classList.add('pending-operation');
        }
    });
}

// Enhanced commitAllOperations to handle runpod launches
function commitAllOperations() {
    if (pendingOperations.length === 0) {
        showNotification('No pending operations to commit', 'warning');
        return;
    }
    
    // Separate migration and launch operations
    const migrations = pendingOperations.filter(op => op.type === 'migration');
    const launches = pendingOperations.filter(op => op.type === 'runpod-launch');
    
    let confirmMessage = '';
    if (migrations.length > 0 && launches.length > 0) {
        confirmMessage = `Execute ${migrations.length} migration(s) and ${launches.length} VM launch(es)?`;
    } else if (migrations.length > 0) {
        confirmMessage = `Execute ${migrations.length} migration(s)?`;
    } else {
        confirmMessage = `Execute ${launches.length} VM launch(es)?`;
    }
    
    if (!confirm(confirmMessage)) return;
    
    const commitBtn = document.getElementById('commitBtn');
    commitBtn.disabled = true;
    commitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Executing...';
    
    // Execute migrations first, then launches
    executeOperationsSequentially([...migrations, ...launches], 0, [], 0);
}

function executeOperationsSequentially(operations, index, errors, completed) {
    if (index >= operations.length) {
        const commitBtn = document.getElementById('commitBtn');
        commitBtn.disabled = false;
        commitBtn.innerHTML = '<i class="fas fa-check"></i> Commit All Operations';
        
        if (errors.length > 0) {
            showNotification(`Completed with ${errors.length} errors: ${errors.join(', ')}`, 'warning');
        } else {
            showNotification(`Successfully executed ${completed} operations`, 'success');
            pendingOperations = []; // Clear pending operations on success
            updatePendingOperationsDisplay();
        }
        
        refreshData();
        loadCommandLog();
        loadResultsSummary();
        return;
    }
    
    const operation = operations[index];
    
    if (operation.type === 'runpod-launch') {
        // Execute VM launch
        executeRunpodLaunch(operation.hostname)
            .then(success => {
                if (success) {
                    completed++;
                } else {
                    errors.push(`Launch ${operation.hostname}`);
                }
                executeOperationsSequentially(operations, index + 1, errors, completed);
            })
            .catch(error => {
                console.error(`Error launching ${operation.hostname}:`, error);
                errors.push(`Launch ${operation.hostname}`);
                executeOperationsSequentially(operations, index + 1, errors, completed);
            });
    } else {
        // Execute migration (existing logic)
        fetch('/api/execute-migration', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                host: operation.hostname,
                source_aggregate: operation.sourceAggregate,
                target_aggregate: operation.targetAggregate
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                completed++;
            } else {
                errors.push(`Migration ${operation.hostname}`);
                console.error(`Migration failed for ${operation.hostname}:`, data.error);
            }
            executeOperationsSequentially(operations, index + 1, errors, completed);
        })
        .catch(error => {
            errors.push(`Migration ${operation.hostname}`);
            console.error(`Error migrating ${operation.hostname}:`, error);
            executeOperationsSequentially(operations, index + 1, errors, completed);
        });
    }
}

function executeRunpodLaunch(hostname) {
    return new Promise((resolve) => {
        // First, preview the launch
        fetch('/api/preview-runpod-launch', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ hostname: hostname })
        })
        .then(response => response.json())
        .then(previewData => {
            if (previewData.error) {
                showNotification(`Preview failed for ${hostname}: ${previewData.error}`, 'danger');
                resolve(false);
                return;
            }
            
            // Show confirmation with preview
            const confirmLaunch = confirm(
                `Launch VM on ${hostname}?\n\n` +
                `VM Name: ${previewData.vm_name}\n` +
                `Flavor: ${previewData.flavor_name}\n` +
                `GPU Type: ${previewData.gpu_type}\n\n` +
                `This will execute the Hyperstack API call.`
            );
            
            if (!confirmLaunch) {
                resolve(false);
                return;
            }
            
            // Execute the launch
            fetch('/api/execute-runpod-launch', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ hostname: hostname })
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    let message = `Successfully launched VM ${data.vm_name} on ${hostname}`;
                    if (data.storage_network_scheduled && hostname.startsWith('CA1-')) {
                        message += `. Storage network will be attached in 120 seconds.`;
                    }
                    showNotification(message, 'success');
                    resolve(true);
                } else {
                    showNotification(`Launch failed for ${hostname}: ${data.error}`, 'danger');
                    resolve(false);
                }
            })
            .catch(error => {
                console.error(`Error launching VM on ${hostname}:`, error);
                showNotification(`Network error launching VM on ${hostname}`, 'danger');
                resolve(false);
            });
        })
        .catch(error => {
            console.error(`Error previewing launch for ${hostname}:`, error);
            showNotification(`Preview error for ${hostname}`, 'danger');
            resolve(false);
        });
    });
}

