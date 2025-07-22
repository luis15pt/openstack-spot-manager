// OpenStack Spot Manager JavaScript

let currentGpuType = '';
let selectedHosts = new Set();
let aggregateData = {};
let pendingOperations = [];

// Background loading system
let availableGpuTypes = [];
let gpuDataCache = new Map(); // Cache for loaded GPU data
let backgroundLoadingInProgress = false;

// Debug system
let debugLog = [];
let debugStats = {
    sessionStart: new Date(),
    operationsCount: 0,
    commandsExecuted: 0,
    errorsCount: 0
};
let debugTabInitialized = false;
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
    document.getElementById('commitBtn').addEventListener('click', commitSelectedCommands);
    document.getElementById('clearPendingBtn').addEventListener('click', clearPendingOperations);
    
    // Preload all button
    document.getElementById('preloadAllBtn').addEventListener('click', handlePreloadAll);
    
    // Debug tab buttons
    document.getElementById('clearDebugBtn').addEventListener('click', clearDebugLog);
    document.getElementById('exportDebugBtn').addEventListener('click', exportDebugLog);
    
    // Initialize debug tab
    initializeDebugTab();
    
    // New pending operations buttons
    document.getElementById('selectAllPendingBtn').addEventListener('click', selectAllPendingOperations);
    document.getElementById('deselectAllPendingBtn').addEventListener('click', deselectAllPendingOperations);
    
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

function renderOnDemandVariants(container, hosts, variants) {
    let variantsHtml = '';
    
    // Create a section for each variant with collapsible structure
    variants.forEach((variant, index) => {
        const variantHosts = hosts.filter(host => host.variant === variant.aggregate);
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
    const targetVariant = this.dataset.variant; // For variant-specific drop zones
    
    if (sourceType !== targetType) {
        addToPendingOperations(hostname, sourceType, targetType, { targetVariant });
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
        if (aggregateData.ondemand.variants && aggregateData.spot) {
            if (targetType === 'spot') {
                // Moving to spot - always use the single spot aggregate
                hostTargetAggregate = aggregateData.spot.name;
            } else if (targetType === 'runpod') {
                // Moving to runpod - use the runpod aggregate if it exists
                if (aggregateData.runpod) {
                    hostTargetAggregate = aggregateData.runpod.name;
                } else {
                    showNotification(`No runpod aggregate available for ${aggregateData.gpu_type || 'this GPU type'}`, 'warning');
                    return;
                }
            } else {
                // Moving to on-demand - find the original variant for this host
                const sourceVariant = aggregateData.ondemand.variants.find(variant => 
                    variant.aggregate === hostSourceAggregate
                );
                if (sourceVariant) {
                    hostTargetAggregate = sourceVariant.aggregate;
                }
            }
        } else {
            // Fallback for old data structure
            if (targetType === 'ondemand') {
                hostTargetAggregate = aggregateData.ondemand.name;
            } else if (targetType === 'runpod') {
                hostTargetAggregate = aggregateData.runpod ? aggregateData.runpod.name : '';
            } else {
                hostTargetAggregate = aggregateData.spot.name;
            }
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
            // Only refresh command log and results, don't refresh all host data
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
            // Only refresh command log and results, don't refresh all host data
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
    if (aggregateData.ondemand.variants && aggregateData.spot) {
        if (targetType === 'spot') {
            // Moving to spot - always use the single spot aggregate
            targetAggregate = aggregateData.spot.name;
        } else {
            // Moving to on-demand - find the original variant for this host
            const sourceVariant = aggregateData.ondemand.variants.find(variant => 
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
    const list = document.getElementById('pendingOperationsList');
    const count = document.getElementById('pendingCount');
    const tabCount = document.getElementById('pendingTabCount');
    
    // Update counts
    count.textContent = pendingOperations.length;
    tabCount.textContent = pendingOperations.length;
    count.classList.add('updated');
    setTimeout(() => count.classList.remove('updated'), 500);
    
    // Update visual indicators on cards
    updateCardPendingIndicators();
    
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
            `🚀 Launch VM '${op.vm_name}' on ${op.hostname}` : 
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
                            <i class="${getCommandIcon(cmd.command_type)}"></i>
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
                        
                        <!-- Individual Command Output Section -->
                        <div class="command-output mt-2" id="cmd-output-${commandId}" style="display: none;">
                            <strong class="text-success">Command Output:</strong>
                            <div class="command-output-content mt-1 p-2 bg-dark text-white rounded small">
                                <div class="output-placeholder text-muted">
                                    <i class="fas fa-clock me-1"></i>
                                    Output will appear here when command executes
                                </div>
                            </div>
                        </div>
                        
                        ${cmd.verification_commands ? `
                        <div class="command-verification mt-2">
                            <strong class="text-secondary">Verification:</strong>
                            ${cmd.verification_commands.map(vcmd => `
                                <code class="d-block mt-1 p-1 bg-secondary text-white rounded small">${vcmd}</code>
                            `).join('')}
                        </div>
                        ` : ''}
                        
                        <div class="command-expected mt-2">
                            <strong class="text-success">Expected Output:</strong>
                            <div class="text-muted small mt-1 font-italic">${cmd.expected_output}</div>
                        </div>
                        
                        ${cmd.dependencies.length > 0 ? `
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
                    
                    <!-- Debug Output Section -->
                    <div class="operation-debug mt-3 pt-3 border-top">
                        <div class="d-flex justify-content-between align-items-center">
                            <h6 class="mb-0">
                                <i class="fas fa-bug text-info me-1"></i>
                                Execution Log
                            </h6>
                            <button class="btn btn-sm btn-outline-info" onclick="toggleOperationDebug(${index})" id="debug-toggle-${index}">
                                <i class="fas fa-chevron-down"></i>
                            </button>
                        </div>
                        <div class="operation-debug-content collapse" id="debug-content-${index}">
                            <div class="debug-log mt-2" id="debug-log-${index}">
                                <div class="text-muted small">
                                    <i class="fas fa-info-circle"></i> 
                                    Execution information will appear here during command execution
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    list.innerHTML = operationsHtml;
    updateCommitButtonState();
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

function toggleOperationCollapse(index) {
    const operationBody = document.getElementById(`operation-body-${index}`);
    const collapseBtn = document.getElementById(`collapse-btn-${index}`);
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

function toggleOperationDebug(index) {
    const debugContent = document.getElementById(`debug-content-${index}`);
    const toggleBtn = document.getElementById(`debug-toggle-${index}`);
    const icon = toggleBtn.querySelector('i');
    
    if (debugContent.classList.contains('show')) {
        debugContent.classList.remove('show');
        icon.className = 'fas fa-chevron-down';
        toggleBtn.title = 'Show debug output';
    } else {
        debugContent.classList.add('show');
        icon.className = 'fas fa-chevron-up';
        toggleBtn.title = 'Hide debug output';
    }
}

// Function to add debug information to a specific operation card
function addOperationDebug(hostname, type, message, level = 'info') {
    // Find the operation index for this hostname
    const operationIndex = pendingOperations.findIndex(op => op.hostname === hostname);
    if (operationIndex === -1) return;
    
    const debugLog = document.getElementById(`debug-log-${operationIndex}`);
    if (!debugLog) return;
    
    // Clear the initial placeholder message if this is the first debug entry
    if (debugLog.querySelector('.text-muted')) {
        debugLog.innerHTML = '';
    }
    
    // Create timestamp
    const timestamp = new Date().toLocaleTimeString();
    
    // Determine styling based on level
    let iconClass, textClass, bgClass;
    switch (level) {
        case 'success':
            iconClass = 'fas fa-check-circle text-success';
            textClass = 'text-success';
            bgClass = 'bg-light-success';
            break;
        case 'error':
            iconClass = 'fas fa-exclamation-circle text-danger';
            textClass = 'text-danger';
            bgClass = 'bg-light-danger';
            break;
        case 'warning':
            iconClass = 'fas fa-exclamation-triangle text-warning';
            textClass = 'text-warning';
            bgClass = 'bg-light-warning';
            break;
        case 'info':
        default:
            iconClass = 'fas fa-info-circle text-info';
            textClass = 'text-info';
            bgClass = 'bg-light-info';
            break;
    }
    
    // Create debug entry
    const debugEntry = document.createElement('div');
    debugEntry.className = `debug-entry p-2 mb-2 rounded ${bgClass}`;
    debugEntry.innerHTML = `
        <div class="d-flex align-items-start">
            <i class="${iconClass} me-2 mt-1"></i>
            <div class="flex-grow-1">
                <div class="debug-message">
                    <strong class="${textClass}">${type}:</strong>
                    <span class="ms-1">${message}</span>
                </div>
                <small class="text-muted">
                    <i class="fas fa-clock me-1"></i>${timestamp}
                </small>
            </div>
        </div>
    `;
    
    // Add to debug log (newest first)
    debugLog.insertBefore(debugEntry, debugLog.firstChild);
    
    // Auto-expand debug section if it's collapsed and this is an error
    if (level === 'error' || level === 'warning') {
        const debugContent = document.getElementById(`debug-content-${operationIndex}`);
        if (debugContent && !debugContent.classList.contains('show')) {
            toggleOperationDebug(operationIndex);
        }
    }
    
    // Update the debug toggle button to show there's new content
    const toggleBtn = document.getElementById(`debug-toggle-${operationIndex}`);
    if (toggleBtn && !toggleBtn.classList.contains('btn-outline-warning')) {
        toggleBtn.classList.remove('btn-outline-info');
        toggleBtn.classList.add('btn-outline-warning');
        const toggleIcon = toggleBtn.querySelector('i');
        if (!debugContent.classList.contains('show') && toggleIcon) {
            toggleIcon.className = 'fas fa-chevron-down text-warning';
        }
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
        
        // If targetVariant is provided, use it directly
        if (options.targetVariant) {
            targetAggregate = options.targetVariant;
        } else if (aggregateData.ondemand.variants && aggregateData.spot) {
            if (targetType === 'spot') {
                targetAggregate = aggregateData.spot.name;
            } else if (targetType === 'runpod') {
                if (aggregateData.runpod) {
                    targetAggregate = aggregateData.runpod.name;
                } else {
                    showNotification(`No runpod aggregate available for ${aggregateData.gpu_type || 'this GPU type'}`, 'warning');
                    return;
                }
            } else {
                const sourceVariant = aggregateData.ondemand.variants.find(variant => 
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


// Command-level operations execution
function commitSelectedCommands() {
    const selectedCommands = document.querySelectorAll('.command-operation-checkbox:checked');
    
    if (selectedCommands.length === 0) {
        showNotification('No commands selected for execution', 'warning');
        return;
    }
    
    // Group selected commands by operation for execution
    const commandsByOperation = {};
    
    selectedCommands.forEach(checkbox => {
        const card = checkbox.closest('.pending-operation-card');
        const operationIndex = card.dataset.index;
        const operation = pendingOperations[operationIndex];
        
        if (operation) {
            if (!commandsByOperation[operationIndex]) {
                commandsByOperation[operationIndex] = {
                    operation: operation,
                    commands: []
                };
            }
            
            // Extract command info from the checkbox
            const commandId = checkbox.id;
            const commandDiv = checkbox.closest('.command-operation');
            const commandTitle = commandDiv.querySelector('.command-title strong').textContent;
            
            commandsByOperation[operationIndex].commands.push({
                id: commandId,
                checkbox: checkbox,
                title: commandTitle,
                element: commandDiv
            });
        }
    });
    
    const totalCommands = selectedCommands.length;
    const totalOperations = Object.keys(commandsByOperation).length;
    
    const confirmMessage = `This will execute ${totalCommands} commands across ${totalOperations} operations. Continue?`;
    
    if (!confirm(confirmMessage)) return;
    
    const commitBtn = document.getElementById('commitBtn');
    commitBtn.disabled = true;
    commitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Executing Commands...';
    
    executeCommandsSequentially(commandsByOperation);
}

function executeCommandsSequentially(commandsByOperation) {
    const operationIndices = Object.keys(commandsByOperation);
    let currentOperationIndex = 0;
    const errors = [];
    let completedCommands = 0;
    
    const executeNextOperation = () => {
        if (currentOperationIndex >= operationIndices.length) {
            // All operations completed
            const commitBtn = document.getElementById('commitBtn');
            commitBtn.disabled = false;
            commitBtn.innerHTML = '<i class="fas fa-check"></i> Commit Selected Commands';
            
            if (errors.length > 0) {
                showNotification(`Completed with ${errors.length} errors: ${errors.join(', ')}`, 'warning');
            } else {
                showNotification(`Successfully executed ${completedCommands} commands`, 'success');
            }
            
            // Remove completed commands and update display
            removeCompletedCommands();
            updatePendingOperationsDisplay();
            
            // Only refresh command log and results, don't refresh all host data
            loadCommandLog();
            loadResultsSummary();
            return;
        }
        
        const operationIndex = operationIndices[currentOperationIndex];
        const operationData = commandsByOperation[operationIndex];
        const operation = operationData.operation;
        const commands = operationData.commands;
        
        console.log(`🔧 Executing operation ${currentOperationIndex + 1}/${operationIndices.length}: ${operation.hostname} (${commands.length} commands)`);
        
        // Add operation-specific debug output
        addOperationDebug(operation.hostname, 'Command Execution Started', 
            `Starting ${commands.length} commands for ${operation.hostname}`, 'info');
        
        // Execute all commands for this operation
        executeCommandsForOperation(operation, commands, (success) => {
            if (success) {
                completedCommands += commands.length;
                addOperationDebug(operation.hostname, 'Commands Completed', 
                    `All ${commands.length} commands completed successfully`, 'success');
            } else {
                errors.push(`${operation.hostname} commands failed`);
                addOperationDebug(operation.hostname, 'Commands Failed', 
                    `Some commands failed for ${operation.hostname}`, 'error');
            }
            
            currentOperationIndex++;
            executeNextOperation();
        });
    };
    
    executeNextOperation();
}

function executeCommandsForOperation(operation, commands, callback) {
    // This function will execute the actual commands for an operation
    // For now, we'll simulate execution and mark commands as completed
    
    let commandIndex = 0;
    
    const executeNextCommand = () => {
        if (commandIndex >= commands.length) {
            callback(true);
            return;
        }
        
        const command = commands[commandIndex];
        
        // Mark command as in progress
        markCommandAsInProgress(command.element);
        
        // Add to debug log
        addToDebugLog('Command Started', `Executing: ${command.title}`, 'info', operation.hostname);
        addOperationDebug(operation.hostname, 'Command Started', 
            `Executing: ${command.title}`, 'info');
        
        // Simulate command execution with delay (simulate actual execution time)
        const executionTime = Math.floor(Math.random() * 3000) + 1000; // 1-4 seconds
        
        setTimeout(() => {
            // Simulate command output
            const simulatedOutput = generateSimulatedOutput(command.title, operation.hostname);
            
            // Mark command as completed with output
            markCommandAsCompleted(command.element, simulatedOutput);
            
            // Update debug stats
            debugStats.commandsExecuted++;
            updateDebugStats();
            
            // Add to debug log
            addToDebugLog('Command Completed', `✓ ${command.title}`, 'success', operation.hostname);
            addOperationDebug(operation.hostname, 'Command Completed', 
                `✓ ${command.title}`, 'success');
            
            commandIndex++;
            executeNextCommand();
        }, executionTime);
    };
    
    executeNextCommand();
}

function generateSimulatedOutput(commandTitle, hostname) {
    const timestamp = new Date().toLocaleString();
    
    if (commandTitle.includes('Wait for aggregate')) {
        return `[${timestamp}] Wait completed - 60 seconds elapsed\nAggregate membership propagated successfully`;
    } else if (commandTitle.includes('Deploy VM')) {
        return `[${timestamp}] VM created successfully\nID: vm-${Math.random().toString(36).substr(2, 9)}\nFloating IP: 10.1.110.${Math.floor(Math.random() * 200) + 50}\nStatus: ACTIVE`;
    } else if (commandTitle.includes('storage network')) {
        return `[${timestamp}] Storage network operation completed\nNetwork ID: ${Math.random().toString(36).substr(2, 9)}\nPort attached successfully`;
    } else if (commandTitle.includes('firewall')) {
        return `[${timestamp}] Firewall operation completed\nVM added to firewall rules\nCurrent attachments: 3 VMs`;
    } else if (commandTitle.includes('Remove host')) {
        return `[${timestamp}] Host ${hostname} removed from aggregate\nOperation completed successfully`;
    } else if (commandTitle.includes('Add host')) {
        return `[${timestamp}] Host ${hostname} added to aggregate\nOperation completed successfully`;
    } else {
        return `[${timestamp}] Command executed successfully\nOperation completed for ${hostname}`;
    }
}

function markCommandAsInProgress(commandElement) {
    commandElement.classList.add('in-progress-step');
    commandElement.classList.remove('completed-step');
    
    const badge = commandElement.querySelector('.badge');
    if (badge) {
        badge.className = 'badge bg-warning ms-2';
        badge.textContent = 'In Progress';
    }
    
    const checkbox = commandElement.querySelector('.command-operation-checkbox');
    if (checkbox) {
        checkbox.disabled = true;
    }
    
    // Show output section
    const outputSection = commandElement.querySelector('.command-output');
    if (outputSection) {
        outputSection.style.display = 'block';
        const outputContent = outputSection.querySelector('.command-output-content');
        outputContent.innerHTML = `
            <div class="output-placeholder text-warning">
                <i class="fas fa-spinner fa-spin me-1"></i>
                Command executing...
            </div>
        `;
    }
}

function markCommandAsCompleted(commandElement, output = null) {
    commandElement.classList.remove('in-progress-step');
    commandElement.classList.add('completed-step');
    
    const badge = commandElement.querySelector('.badge');
    if (badge) {
        badge.className = 'badge bg-success ms-2';
        badge.textContent = 'Completed';
    }
    
    const titleElement = commandElement.querySelector('.command-title');
    if (titleElement && !titleElement.querySelector('.fa-check-circle')) {
        titleElement.insertAdjacentHTML('afterbegin', '<i class="fas fa-check-circle text-success me-1"></i>');
    }
    
    const checkbox = commandElement.querySelector('.command-operation-checkbox');
    if (checkbox) {
        checkbox.checked = true;
        checkbox.disabled = true;
    }
    
    // Update output section with actual output
    const outputSection = commandElement.querySelector('.command-output');
    if (outputSection) {
        const outputContent = outputSection.querySelector('.command-output-content');
        const timestamp = new Date().toLocaleTimeString();
        
        if (output) {
            outputContent.innerHTML = `
                <div class="command-success-output">
                    <div class="text-success small mb-1">
                        <i class="fas fa-check-circle me-1"></i>
                        Command completed at ${timestamp}
                    </div>
                    <pre class="mb-0">${output}</pre>
                </div>
            `;
        } else {
            outputContent.innerHTML = `
                <div class="command-success-output">
                    <div class="text-success small">
                        <i class="fas fa-check-circle me-1"></i>
                        Command completed successfully at ${timestamp}
                    </div>
                </div>
            `;
        }
    }
}

function removeCompletedCommands() {
    // Remove completed commands from pending operations
    pendingOperations.forEach((operation, index) => {
        if (!operation.completedCommands) {
            operation.completedCommands = [];
        }
        
        // Check for completed commands in the DOM
        const card = document.querySelector(`.pending-operation-card[data-index="${index}"]`);
        if (card) {
            const completedCommands = card.querySelectorAll('.command-operation.completed-step');
            completedCommands.forEach(commandDiv => {
                const commandTitle = commandDiv.querySelector('.command-title strong').textContent;
                if (!operation.completedCommands.includes(commandTitle)) {
                    operation.completedCommands.push(commandTitle);
                }
            });
        }
    });
    
    // Remove operations that have all commands completed
    pendingOperations = pendingOperations.filter(operation => {
        const commands = generateIndividualCommandOperations(operation);
        const completedCount = operation.completedCommands ? operation.completedCommands.length : 0;
        return completedCount < commands.length;
    });
}

// Enhanced commitAllOperations to handle runpod launches and checkboxes  
function commitAllOperations() {
    if (pendingOperations.length === 0) {
        showNotification('No pending operations to commit', 'warning');
        return;
    }
    
    // Check which steps are selected
    const selectedSteps = document.querySelectorAll('.operation-step-checkbox:checked');
    if (selectedSteps.length === 0) {
        showNotification('No operation steps selected. Please select at least one step to execute.', 'warning');
        return;
    }
    
    // Count selected operations by type
    const selectedOperations = new Set();
    selectedSteps.forEach(checkbox => {
        const operationCard = checkbox.closest('.pending-operation-card');
        if (operationCard) {
            selectedOperations.add(operationCard.dataset.index);
        }
    });
    
    const selectedCount = selectedOperations.size;
    
    // Check for warnings and show them in confirmation
    const warnings = checkCriticalStepDependencies();
    let confirmMessage = `Execute ${selectedSteps.length} selected step(s) across ${selectedCount} operation(s)?`;
    
    if (warnings.length > 0) {
        confirmMessage += `\n\n⚠️  ${warnings.length} Warning(s):\n` + warnings.map(w => `• ${w}`).join('\n');
        confirmMessage += `\n\nDo you want to continue anyway?`;
    }
    
    if (!confirm(confirmMessage)) return;
    
    const commitBtn = document.getElementById('commitBtn');
    commitBtn.disabled = true;
    commitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Executing...';
    
    // Filter operations and execute only those with selected steps
    const operationsToExecute = pendingOperations.filter((op, index) => 
        selectedOperations.has(index.toString())
    );
    
    // Separate migration and launch operations
    const migrations = operationsToExecute.filter(op => op.type !== 'runpod-launch');
    const launches = operationsToExecute.filter(op => op.type === 'runpod-launch');
    
    // Add queued commands to command log
    logQueuedCommands([...migrations, ...launches]);
    
    // Execute migrations first, then launches with 2-minute delays
    executeOperationsSequentially([...migrations, ...launches], 0, [], 0);
}

// Global variable to track actually executed steps
let executedStepsGlobal = new Set();

function logQueuedCommands(operations) {
    // Add queued commands to command log to show what's scheduled
    operations.forEach(operation => {
        const steps = generateDetailedOperationSteps(operation);
        const selectedSteps = steps.filter(step => {
            const checkbox = document.getElementById(step.id);
            return checkbox && checkbox.checked;
        });
        
        selectedSteps.forEach(step => {
            const queuedCommand = {
                command: step.command,
                timestamp: new Date().toISOString(),
                status: 'queued',
                hostname: operation.hostname,
                step_title: step.title,
                timing: step.timing
            };
            
            // Add to frontend command log display with queued status
            addQueuedCommandToDisplay(queuedCommand.command, `Queued: ${step.title} (${step.timing})`);
        });
    });
}

function addQueuedCommandToDisplay(command, message) {
    const container = document.getElementById('commandLogContainer');
    const timestamp = new Date().toLocaleString();
    
    const commandHtml = `
        <div class="command-log-entry queued">
            <div class="command-header">
                <span class="command-status queued">Queued</span>
                <span class="command-timestamp">${timestamp}</span>
            </div>
            <div class="command-text">${command}</div>
            <div class="command-output">${message}</div>
        </div>
    `;
    
    // Add to the top of the command log
    container.insertAdjacentHTML('afterbegin', commandHtml);
    
    // Update command count
    const commandCountElement = document.getElementById('commandCount');
    const currentCount = parseInt(commandCountElement.textContent) || 0;
    commandCountElement.textContent = currentCount + 1;
    commandCountElement.classList.add('updated');
    setTimeout(() => commandCountElement.classList.remove('updated'), 500);
}

function removeCompletedOperations() {
    // Use the global tracking of actually executed steps
    const operationsToKeep = [];
    
    pendingOperations.forEach((operation, opIndex) => {
        const steps = generateDetailedOperationSteps(operation);
        const remainingSteps = [];
        
        // Check which steps of this operation were NOT actually executed
        steps.forEach(step => {
            if (!executedStepsGlobal.has(step.id)) {
                remainingSteps.push(step);
            }
        });
        
        // If any steps remain, keep the operation but mark completed steps
        if (remainingSteps.length > 0) {
            // Add executed steps info to the operation for display
            const executedStepsForOp = steps.filter(step => executedStepsGlobal.has(step.id));
            if (executedStepsForOp.length > 0) {
                operation.completedSteps = executedStepsForOp.map(s => s.title);
            }
            operationsToKeep.push(operation);
        }
        // If no steps remain, the entire operation was completed - don't keep it
    });
    
    pendingOperations = operationsToKeep;
}

function updateHostAfterVMLaunch(hostname) {
    // Find the host card in the DOM
    const hostCard = document.querySelector(`[data-host="${hostname}"]`);
    if (!hostCard) {
        console.warn(`Host card not found for ${hostname}`);
        return;
    }
    
    const hostType = hostCard.dataset.type;
    const hostAggregate = hostCard.dataset.aggregate;
    
    // Update the host card styling to show it has VMs
    hostCard.classList.add('has-vms');
    hostCard.dataset.hasVms = 'true';
    
    // Update the VM count display in the card
    const vmInfo = hostCard.querySelector('.vm-info');
    if (vmInfo) {
        vmInfo.innerHTML = `
            <span class="status-dot active">●</span>
            <span class="vm-badge active">8</span>
            <span class="vm-label">VMs</span>
        `;
    }
    
    // Remove the "Launch into Runpod" button if it exists
    const launchBtn = hostCard.querySelector('.launch-runpod-btn');
    if (launchBtn) {
        launchBtn.remove();
    }
    
    // Update the host name styling to show it's in use
    const hostName = hostCard.querySelector('.machine-name, .host-name');
    if (hostName) {
        hostName.classList.add('has-vms');
    }
    
    // Move the card to the "In Use" section if it's currently in "Available"
    moveHostCardToInUseSection(hostCard, hostType, hostAggregate);
    
    // Update the aggregate counters and GPU usage
    updateAggregateCounters();
    
    console.log(`✅ Updated host ${hostname} status to show VM in use`);
}

function moveHostCardToInUseSection(hostCard, hostType, hostAggregate) {
    const hostname = hostCard.dataset.host;
    
    // Remove from current location
    hostCard.remove();
    
    // Find or create the "In Use" section for this aggregate/type
    let inUseSection;
    
    if (hostType === 'runpod') {
        // For runpod, find the main container
        const container = document.getElementById('runpodHosts');
        
        // Look for existing In Use section
        inUseSection = findSectionByTitle(container, 'In Use');
        
        if (!inUseSection) {
            // Create In Use section if it doesn't exist
            const availableSection = container.querySelector('.host-group');
            if (availableSection) {
                const inUseSectionHtml = `
                    <div class="host-group">
                        <div class="host-group-header clickable" onclick="toggleGroup('inuse-runpod')">
                            <i class="fas fa-exclamation-triangle text-warning"></i>
                            <h6>In Use (1)</h6>
                            <small class="text-muted">Have running VMs</small>
                            <i class="fas fa-chevron-down toggle-icon" id="inuse-runpod-icon"></i>
                        </div>
                        <div class="host-group-content" id="inuse-runpod">
                        </div>
                    </div>
                `;
                availableSection.insertAdjacentHTML('afterend', inUseSectionHtml);
                inUseSection = document.getElementById('inuse-runpod').parentNode;
            }
        }
        
        if (inUseSection) {
            const content = inUseSection.querySelector('.host-group-content');
            if (content) {
                content.appendChild(hostCard);
                
                // Update section header count
                const header = inUseSection.querySelector('h6');
                const currentCount = content.children.length;
                if (header) {
                    header.innerHTML = `In Use (${currentCount})`;
                }
            }
        }
    }
    
    // Update available section count (reduce by 1)
    updateSectionCounts(hostType);
}

function updateSectionCounts(hostType) {
    // This will be called after moving a host to update section counters
    // The refreshData() call in executeOperationsSequentially will handle the full refresh
    // but this provides immediate visual feedback
}

function findSectionByTitle(container, title) {
    const sections = container.querySelectorAll('.host-group');
    for (let section of sections) {
        const header = section.querySelector('h6');
        if (header && header.textContent.includes(title)) {
            return section;
        }
    }
    return null;
}

function updateAggregateCounters() {
    // Update the overall GPU usage counters
    // This will be fully refreshed by refreshData() but provides immediate feedback
    const allHostCards = document.querySelectorAll('.host-card, .machine-card');
    let totalInUse = 0;
    let totalAvailable = 0;
    
    allHostCards.forEach(card => {
        if (card.dataset.hasVms === 'true') {
            totalInUse++;
        } else {
            totalAvailable++;
        }
    });
    
    // Update the summary counters
    const inUseCount = document.getElementById('inUseHostsCount');
    const availableCount = document.getElementById('availableHostsCount');
    
    if (inUseCount) inUseCount.textContent = totalInUse;
    if (availableCount) availableCount.textContent = totalAvailable;
}

function markStepAsInProgress(stepId) {
    const checkbox = document.getElementById(stepId);
    if (checkbox) {
        const stepElement = checkbox.closest('.operation-step');
        if (stepElement) {
            stepElement.classList.add('in-progress-step');
            
            // Update the badge to show "In Progress"
            const badge = stepElement.querySelector('.badge');
            if (badge) {
                badge.textContent = 'In Progress';
                badge.classList.remove('bg-secondary');
                badge.classList.add('bg-warning');
            }
            
            // Add spinner icon
            const title = stepElement.querySelector('.step-title');
            if (title && !title.querySelector('.fa-spinner')) {
                title.insertAdjacentHTML('afterbegin', '<i class="fas fa-spinner fa-spin text-warning me-1"></i>');
            }
        }
    }
}

function markStepAsExecuted(stepId) {
    const checkbox = document.getElementById(stepId);
    if (checkbox) {
        // Update the step visual state to show it's completed
        const stepElement = checkbox.closest('.operation-step');
        if (stepElement) {
            stepElement.classList.remove('in-progress-step');
            stepElement.classList.add('completed-step');
            
            // Update the badge to show "Completed"
            const badge = stepElement.querySelector('.badge');
            if (badge) {
                badge.textContent = 'Completed';
                badge.classList.remove('bg-secondary', 'bg-warning');
                badge.classList.add('bg-success');
            }
            
            // Replace spinner with checkmark icon
            const title = stepElement.querySelector('.step-title');
            if (title) {
                // Remove any existing icons
                const existingIcons = title.querySelectorAll('.fa-spinner, .fa-check-circle');
                existingIcons.forEach(icon => icon.remove());
                
                // Add checkmark icon
                title.insertAdjacentHTML('afterbegin', '<i class="fas fa-check-circle text-success me-1"></i>');
            }
            
            // Disable the checkbox
            checkbox.disabled = true;
        }
    }
}

function updateStepWithExecutionResult(stepId, executedCommand, result) {
    const stepElement = document.getElementById(stepId)?.closest('.operation-step');
    if (!stepElement) return;
    
    // Find or create the command display section
    let commandSection = stepElement.querySelector('.step-execution-result');
    if (!commandSection) {
        commandSection = document.createElement('div');
        commandSection.className = 'step-execution-result mt-2';
        stepElement.appendChild(commandSection);
    }
    
    // Update the command section with actual execution details
    commandSection.innerHTML = `
        <div class="execution-details p-2 bg-light border-start border-success border-3">
            <div class="execution-command mb-2">
                <strong class="text-success">Executed Command:</strong>
                <code class="d-block mt-1 p-2 bg-white border rounded small">${executedCommand}</code>
            </div>
            <div class="execution-result">
                <strong class="text-success">Result:</strong>
                <div class="mt-1 p-2 bg-white border rounded small text-success">
                    <i class="fas fa-check-circle me-1"></i>${result}
                </div>
            </div>
        </div>
    `;
}

function executeOperationsSequentially(operations, index, errors, completed) {
    if (index >= operations.length) {
        const commitBtn = document.getElementById('commitBtn');
        commitBtn.disabled = false;
        commitBtn.innerHTML = '<i class="fas fa-check"></i> Commit Selected Operations';
        
        if (errors.length > 0) {
            showNotification(`Completed with ${errors.length} errors: ${errors.join(', ')}`, 'warning');
        } else {
            showNotification(`Successfully executed ${completed} operations`, 'success');
        }
        
        // Remove only the operations that were executed (and steps that were completed)
        removeCompletedOperations();
        updatePendingOperationsDisplay();
        
        // Only refresh command log and results, don't refresh all host data
        loadCommandLog();
        loadResultsSummary();
        return;
    }
    
    const operation = operations[index];
    
    // Mark the current operation's selected steps as being executed
    const steps = generateDetailedOperationSteps(operation);
    const selectedSteps = steps.filter(step => {
        const checkbox = document.getElementById(step.id);
        return checkbox && checkbox.checked;
    });
    
    // Add debug output for this operation
    console.log(`🔧 Executing operation ${index + 1}/${operations.length}: ${operation.hostname} (${operation.type})`);
    console.log(`📋 Selected steps for ${operation.hostname}:`, selectedSteps.map(s => s.title));
    
    // Add operation-specific debug output
    addOperationDebug(operation.hostname, 'Execution Started', 
        `Starting operation ${index + 1}/${operations.length} (${operation.type})`, 'info');
    addOperationDebug(operation.hostname, 'Selected Steps', 
        `${selectedSteps.length} steps selected: ${selectedSteps.map(s => s.title).join(', ')}`, 'info');
    
    // Mark these steps as in progress in the global tracker
    selectedSteps.forEach(step => {
        executedStepsGlobal.add(step.id);
        // Update the step display to show it's in progress
        markStepAsInProgress(step.id);
        
        // Add debug output for each step
        console.log(`🔄 Marked step as in progress: ${step.title} (${step.id})`);
        addOperationDebug(operation.hostname, 'Step Started', 
            `Step started: ${step.title}`, 'info');
    });
    
    if (operation.type === 'runpod-launch') {
        // Check if this is a subsequent runpod launch (not the first one)
        const previousRunpodLaunches = operations.slice(0, index).filter(op => op.type === 'runpod-launch');
        const isSubsequentLaunch = previousRunpodLaunches.length > 0;
        
        if (isSubsequentLaunch) {
            // Add 2-minute delay between runpod launches
            showNotification(`Waiting 2 minutes before launching next VM (${operation.hostname}) to prevent naming conflicts...`, 'info');
            const commitBtn = document.getElementById('commitBtn');
            commitBtn.innerHTML = '<i class="fas fa-clock"></i> Waiting 2 minutes for next launch...';
            
            // Add debug output for delay
            addOperationDebug(operation.hostname, 'Delay Started', 
                'Waiting 2 minutes before launch to prevent VM naming conflicts', 'warning');
            
            setTimeout(() => {
                commitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Executing...';
                console.log(`🚀 Starting delayed Runpod launch for ${operation.hostname} after 2-minute wait`);
                
                addOperationDebug(operation.hostname, 'Delay Complete', 
                    'Delay period finished, starting Runpod launch', 'info');
                
                executeRunpodLaunch(operation.hostname)
                    .then(success => {
                        console.log(`📊 Runpod launch result for ${operation.hostname}: ${success ? 'Success' : 'Failed'}`);
                        
                        if (success) {
                            completed++;
                            console.log(`✅ Runpod launch succeeded for ${operation.hostname} (total completed: ${completed + 1})`);
                            addOperationDebug(operation.hostname, 'Launch Success', 
                                `Runpod launch completed successfully (total completed: ${completed + 1})`, 'success');
                            
                            // Mark the launch step as completed
                            markStepAsExecuted(`step-${operation.hostname}-launch`);
                        } else {
                            errors.push(`Launch ${operation.hostname}`);
                            console.error(`❌ Runpod launch failed for ${operation.hostname}`);
                            addOperationDebug(operation.hostname, 'Launch Failed', 
                                'Runpod launch completed with errors', 'error');
                        }
                        executeOperationsSequentially(operations, index + 1, errors, completed);
                    })
                    .catch(error => {
                        console.error(`💥 Exception during Runpod launch for ${operation.hostname}:`, error);
                        errors.push(`Launch ${operation.hostname}`);
                        addOperationDebug(operation.hostname, 'Launch Exception', 
                            `Exception during launch: ${error.message}`, 'error');
                        executeOperationsSequentially(operations, index + 1, errors, completed);
                    });
            }, 120000); // 2 minutes delay
        } else {
            // Execute first runpod launch immediately
            console.log(`🚀 Starting immediate Runpod launch for ${operation.hostname} (first launch)`);
            addOperationDebug(operation.hostname, 'Launch Started', 
                'Starting immediate Runpod launch (first launch)', 'info');
            
            executeRunpodLaunch(operation.hostname)
                .then(success => {
                    console.log(`📊 First Runpod launch result for ${operation.hostname}: ${success ? 'Success' : 'Failed'}`);
                    
                    if (success) {
                        completed++;
                        console.log(`✅ First Runpod launch succeeded for ${operation.hostname} (total completed: ${completed + 1})`);
                        addOperationDebug(operation.hostname, 'Launch Success', 
                            `First Runpod launch completed successfully (total completed: ${completed + 1})`, 'success');
                        
                        // Mark the launch step as completed
                        markStepAsExecuted(`step-${operation.hostname}-launch`);
                    } else {
                        errors.push(`Launch ${operation.hostname}`);
                        console.error(`❌ First Runpod launch failed for ${operation.hostname}`);
                        addOperationDebug(operation.hostname, 'Launch Failed', 
                            'First Runpod launch completed with errors', 'error');
                    }
                    executeOperationsSequentially(operations, index + 1, errors, completed);
                })
                .catch(error => {
                    console.error(`💥 Exception during first Runpod launch for ${operation.hostname}:`, error);
                    errors.push(`Launch ${operation.hostname}`);
                    addOperationDebug(operation.hostname, 'Launch Exception', 
                        `Exception during first launch: ${error.message}`, 'error');
                    executeOperationsSequentially(operations, index + 1, errors, completed);
                });
        }
    } else {
        // Execute migration (existing logic)
        addOperationDebug(operation.hostname, 'Migration Started', 
            `Starting migration from ${operation.sourceAggregate} to ${operation.targetAggregate}`, 'info');
        
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
            // Add detailed debug output for migration result
            console.log(`📊 Migration result for ${operation.hostname}:`, data);
            
            if (data.success) {
                completed++;
                console.log(`✅ Migration succeeded for ${operation.hostname}`);
                addOperationDebug(operation.hostname, 'Migration Success', 
                    `Migration completed successfully (total completed: ${completed + 1})`, 'success');
                
                // Mark migration steps as completed
                markStepAsExecuted(`step-${operation.hostname}-remove`);
                markStepAsExecuted(`step-${operation.hostname}-add`);
                
                // Log detailed success information
                if (data.commands && data.commands.length > 0) {
                    console.log(`📝 Commands executed for ${operation.hostname}:`, data.commands);
                    addOperationDebug(operation.hostname, 'Commands Executed', 
                        `${data.commands.length} commands executed successfully`, 'info');
                }
            } else {
                errors.push(`Migration ${operation.hostname}`);
                console.error(`❌ Migration failed for ${operation.hostname}:`, data.error);
                addOperationDebug(operation.hostname, 'Migration Failed', 
                    `Migration failed: ${data.error}`, 'error');
                
                // Log detailed error information
                if (data.stderr) {
                    console.error(`📄 Error details for ${operation.hostname}:`, data.stderr);
                    addOperationDebug(operation.hostname, 'Error Details', 
                        `${data.stderr}`, 'error');
                }
            }
            executeOperationsSequentially(operations, index + 1, errors, completed);
        })
        .catch(error => {
            errors.push(`Migration ${operation.hostname}`);
            console.error(`💥 Exception migrating ${operation.hostname}:`, error);
            addOperationDebug(operation.hostname, 'Migration Exception', 
                `Exception during migration: ${error.message}`, 'error');
            executeOperationsSequentially(operations, index + 1, errors, completed);
        });
    }
}

function executeRunpodLaunch(hostname) {
    return new Promise((resolve) => {
        console.log(`🔍 Starting Runpod launch process for ${hostname}`);
        addOperationDebug(hostname, 'Launch Process', 'Starting Runpod launch process', 'info');
        
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
            console.log(`📋 Preview data for ${hostname}:`, previewData);
            
            if (previewData.error) {
                console.error(`❌ Preview failed for ${hostname}:`, previewData.error);
                addOperationDebug(hostname, 'Preview Failed', 
                    `Preview failed: ${previewData.error}`, 'error');
                showNotification(`Preview failed for ${hostname}: ${previewData.error}`, 'danger');
                resolve(false);
                return;
            }
            
            console.log(`✅ Preview successful for ${hostname} - VM: ${previewData.vm_name}, Flavor: ${previewData.flavor_name}`);
            addOperationDebug(hostname, 'Preview Success', 
                `VM: ${previewData.vm_name}, Flavor: ${previewData.flavor_name}, GPU: ${previewData.gpu_type}`, 'success');
            
            // Show confirmation with preview
            const confirmLaunch = confirm(
                `Launch VM on ${hostname}?\n\n` +
                `VM Name: ${previewData.vm_name}\n` +
                `Flavor: ${previewData.flavor_name}\n` +
                `GPU Type: ${previewData.gpu_type}\n\n` +
                `This will execute the Hyperstack API call.`
            );
            
            if (!confirmLaunch) {
                console.log(`❌ User cancelled launch for ${hostname}`);
                addOperationDebug(hostname, 'User Cancelled', 
                    'User cancelled the launch operation', 'warning');
                resolve(false);
                return;
            }
            
            console.log(`✅ User confirmed launch for ${hostname} - proceeding with execution`);
            addOperationDebug(hostname, 'User Confirmed', 
                'User confirmed launch, proceeding with execution', 'info');
            
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
                console.log(`📊 Launch execution result for ${hostname}:`, data);
                
                if (data.success) {
                    console.log(`✅ Launch successful for ${hostname} - VM ID: ${data.vm_id || 'N/A'}`);
                    addOperationDebug(hostname, 'Execution Success', 
                        `VM launched successfully - ID: ${data.vm_id || 'N/A'}`, 'success');
                    
                    // Update the step display with the actual executed command and result
                    updateStepWithExecutionResult(`step-${hostname}-launch`, 
                        data.executed_command || 'Hyperstack API call executed',
                        `Successfully launched VM ${data.vm_name} with flavor ${data.flavor_name} (ID: ${data.vm_id})`
                    );
                    
                    let message = `Successfully launched VM ${data.vm_name} on ${hostname}`;
                    if (data.vm_id) {
                        message += ` (ID: ${data.vm_id})`;
                    }
                    
                    // Add post-launch task notifications
                    let tasks = [];
                    if (data.storage_network_scheduled && hostname.startsWith('CA1-')) {
                        tasks.push('storage network (120s)');
                        console.log(`🔌 Storage network attachment scheduled for ${hostname} in 120s`);
                        addOperationDebug(hostname, 'Storage Network', 
                            'Storage network attachment scheduled for 120s after launch', 'info');
                    }
                    if (data.firewall_scheduled) {
                        tasks.push('firewall (180s)');
                        console.log(`🔥 Firewall attachment scheduled for ${hostname} in 180s`);
                        addOperationDebug(hostname, 'Firewall Scheduled', 
                            'Firewall attachment scheduled for 180s after launch', 'info');
                    }
                    
                    if (tasks.length > 0) {
                        message += `. Scheduled: ${tasks.join(', ')}.`;
                    }
                    
                    showNotification(message, 'success');
                    
                    // Refresh host status to show it's now in use
                    updateHostAfterVMLaunch(hostname);
                    console.log(`🔄 Updated host status for ${hostname} to show VM is running`);
                    addOperationDebug(hostname, 'Status Updated', 
                        'Host status updated to show VM is running', 'success');
                    
                    resolve(true);
                } else {
                    console.error(`❌ Launch failed for ${hostname}:`, data.error);
                    addOperationDebug(hostname, 'Execution Failed', 
                        `Launch execution failed: ${data.error}`, 'error');
                    showNotification(`Launch failed for ${hostname}: ${data.error}`, 'danger');
                    resolve(false);
                }
            })
            .catch(error => {
                console.error(`💥 Exception during launch execution for ${hostname}:`, error);
                addOperationDebug(hostname, 'Network Exception', 
                    `Network error during launch execution: ${error.message}`, 'error');
                showNotification(`Network error launching VM on ${hostname}`, 'danger');
                resolve(false);
            });
        })
        .catch(error => {
            console.error(`💥 Exception during preview for ${hostname}:`, error);
            addOperationDebug(hostname, 'Preview Exception', 
                `Network error during preview: ${error.message}`, 'error');
            showNotification(`Preview error for ${hostname}`, 'danger');
            resolve(false);
        });
    });
}

// Enhanced Pending Operations Functions
function selectAllPendingOperations() {
    const checkboxes = document.querySelectorAll('.operation-step-checkbox');
    checkboxes.forEach(checkbox => {
        checkbox.checked = true;
    });
    updateCommitButtonState();
}

function deselectAllPendingOperations() {
    const checkboxes = document.querySelectorAll('.operation-step-checkbox');
    checkboxes.forEach(checkbox => {
        checkbox.checked = false;
    });
    updateCommitButtonState();
}

function updateCommitButtonState() {
    const commitBtn = document.getElementById('commitBtn');
    const selectedCommands = document.querySelectorAll('.command-operation-checkbox:checked');
    
    if (selectedCommands.length === 0) {
        commitBtn.disabled = true;
        commitBtn.innerHTML = '<i class="fas fa-check"></i> Commit Selected Operations';
        return;
    }
    
    // Check for critical command dependencies/warnings
    const warnings = checkCriticalCommandDependencies();
    
    if (warnings.length > 0) {
        commitBtn.disabled = false;
        commitBtn.innerHTML = `<i class="fas fa-exclamation-triangle text-warning"></i> Commit Selected Commands (${selectedCommands.length} commands) - ${warnings.length} warnings`;
        commitBtn.title = warnings.join('\n');
    } else {
        commitBtn.disabled = false;
        commitBtn.innerHTML = `<i class="fas fa-check"></i> Commit Selected Commands (${selectedCommands.length} commands)`;
        commitBtn.title = '';
    }
}

function checkCriticalCommandDependencies() {
    const warnings = [];
    
    // Check each operation for critical command dependencies
    document.querySelectorAll('.pending-operation-card').forEach(card => {
        const operationIndex = card.dataset.index;
        const operation = pendingOperations[operationIndex];
        
        if (operation && operation.type === 'runpod-launch') {
            const launchCheckbox = card.querySelector(`input[id*="hyperstack-launch"]`);
            const storageCheckboxes = card.querySelectorAll(`input[id*="storage"]`);
            const firewallGetCheckbox = card.querySelector(`input[id*="firewall-get"]`);
            const firewallUpdateCheckbox = card.querySelector(`input[id*="firewall-update"]`);
            
            // Warning if VM launch is selected but networking commands are not
            if (launchCheckbox && launchCheckbox.checked) {
                storageCheckboxes.forEach(storageCheckbox => {
                    if (!storageCheckbox.checked) {
                        warnings.push(`${operation.hostname}: VM launch selected but storage network command disabled - VM may have limited storage performance`);
                    }
                });
                if (firewallGetCheckbox && !firewallGetCheckbox.checked) {
                    warnings.push(`${operation.hostname}: VM launch selected but firewall retrieval disabled - VM will be unprotected`);
                }
                if (firewallUpdateCheckbox && !firewallUpdateCheckbox.checked) {
                    warnings.push(`${operation.hostname}: VM launch selected but firewall update disabled - VM will be unprotected`);
                }
            }
            
            // Warning if storage/firewall selected but launch is not
            if (!launchCheckbox || !launchCheckbox.checked) {
                storageCheckboxes.forEach(storageCheckbox => {
                    if (storageCheckbox.checked) {
                        warnings.push(`${operation.hostname}: Storage network attachment selected but VM launch disabled - storage attachment will fail`);
                    }
                });
                if (firewallGetCheckbox && firewallGetCheckbox.checked) {
                    warnings.push(`${operation.hostname}: Firewall retrieval selected but VM launch disabled - firewall operation will fail`);
                }
                if (firewallUpdateCheckbox && firewallUpdateCheckbox.checked) {
                    warnings.push(`${operation.hostname}: Firewall update selected but VM launch disabled - firewall operation will fail`);
                }
            }
            
            // Warning if firewall update is selected but get is not
            if (firewallUpdateCheckbox && firewallUpdateCheckbox.checked && firewallGetCheckbox && !firewallGetCheckbox.checked) {
                warnings.push(`${operation.hostname}: Firewall update selected but firewall retrieval disabled - update will fail without existing VM IDs`);
            }
        } else if (operation && operation.type !== 'runpod-launch') {
            // Check host migration dependencies
            const removeCheckbox = card.querySelector(`input[id*="aggregate-remove"]`);
            const addCheckbox = card.querySelector(`input[id*="aggregate-add"]`);
            
            if (removeCheckbox && removeCheckbox.checked && addCheckbox && !addCheckbox.checked) {
                warnings.push(`${operation.hostname}: Host will be removed from ${operation.sourceAggregate} but not added to ${operation.targetAggregate} - host will be unassigned`);
            }
            if (addCheckbox && addCheckbox.checked && removeCheckbox && !removeCheckbox.checked) {
                warnings.push(`${operation.hostname}: Host will be added to ${operation.targetAggregate} but not removed from ${operation.sourceAggregate} - host will be in multiple aggregates`);
            }
        }
    });
    
    return warnings;
}

function generateIndividualCommandOperations(operation) {
    const commands = [];
    
    if (operation.type === 'runpod-launch') {
        // Each command as a separate pending operation
        
        // 1. Wait command
        commands.push({
            type: 'wait-command',
            hostname: operation.hostname,
            parent_operation: 'runpod-launch',
            title: 'Wait for aggregate migration to complete',
            description: 'Ensure host is properly moved to Runpod aggregate before VM deployment - prevents deployment failures',
            command: `sleep 60  # Wait for OpenStack aggregate membership to propagate across all services`,
            verification_commands: [
                `openstack aggregate show <runpod-aggregate-name>`,
                `openstack hypervisor show ${operation.hostname}`
            ],
            timing: '60s delay',
            command_type: 'timing',
            purpose: 'Prevent deployment failures by ensuring aggregate membership is fully propagated',
            expected_output: 'Wait completed - aggregate membership propagated',
            dependencies: [],
            timestamp: new Date().toISOString()
        });
        
        // 2. VM Launch command
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
    "image_name": "Ubuntu Server 24.04 LTS R570 CUDA 12.8",
    "flavor_name": "<gpu-flavor>",
    "assign_floating_ip": true,
    "user_data": "#!/bin/bash\\necho \\"api_key=<RUNPOD_API_KEY>\\" > /tmp/runpod-config"
  }'`,
            verification_commands: [
                `openstack server show ${operation.vm_name || operation.hostname} --all-projects`,
                `openstack server list --host ${operation.hostname} --all-projects`
            ],
            timing: 'Immediate',
            command_type: 'api',
            purpose: 'Create the virtual machine on the specified compute host with proper configuration for RunPod integration',
            expected_output: 'VM created successfully with assigned ID and floating IP',
            dependencies: ['wait-command'],
            timestamp: new Date().toISOString()
        });
        
        if (operation.hostname.startsWith('CA1-')) {
            // 3. Storage Network - Find Network ID
            commands.push({
                type: 'storage-find-network',
                hostname: operation.hostname,
                parent_operation: 'runpod-launch',
                title: 'Find RunPod storage network ID',
                description: 'Retrieves the network ID for RunPod-Storage-Canada-1 network to use for port creation',
                command: `openstack network show "RunPod-Storage-Canada-1" -c id -f value`,
                timing: '120s after VM launch',
                command_type: 'network',
                purpose: 'Get the network UUID required for creating storage network port',
                expected_output: 'Network UUID (e.g., 12345678-1234-1234-1234-123456789012)',
                dependencies: ['hyperstack-launch'],
                timestamp: new Date().toISOString()
            });
            
            // 4. Storage Network - Create Port
            commands.push({
                type: 'storage-create-port',
                hostname: operation.hostname,
                parent_operation: 'runpod-launch',
                title: 'Create storage network port',
                description: 'Creates a dedicated port on the storage network for the VM',
                command: `openstack port create --network "RunPod-Storage-Canada-1" --name "${operation.hostname}-storage-port" -c id -f value`,
                timing: 'After network ID found',
                command_type: 'network',
                purpose: 'Create a dedicated network port for high-performance storage access',
                expected_output: 'Port UUID for the storage network interface',
                dependencies: ['storage-find-network'],
                timestamp: new Date().toISOString()
            });
            
            // 5. Storage Network - Attach Port
            commands.push({
                type: 'storage-attach-port',
                hostname: operation.hostname,
                parent_operation: 'runpod-launch',
                title: 'Attach storage port to VM',
                description: 'Attaches the storage network port to the VM for high-performance storage access',
                command: `openstack server add port ${operation.hostname} <PORT_ID>`,
                timing: 'After port created',
                command_type: 'network',
                purpose: 'Connect VM to high-performance storage network for data access',
                expected_output: 'Port successfully attached to VM',
                dependencies: ['storage-create-port'],
                timestamp: new Date().toISOString()
            });
            
            // 6. Firewall - Get Current Attachments
            commands.push({
                type: 'firewall-get-attachments',
                hostname: operation.hostname,
                parent_operation: 'runpod-launch',
                title: 'Get current firewall VM attachments',
                description: 'Retrieves list of VMs currently attached to firewall to preserve them during update',
                command: `curl -H 'api_key: <HYPERSTACK_API_KEY>' \\
  https://infrahub-api.nexgencloud.com/v1/core/firewalls/971`,
                timing: '180s after VM launch',
                command_type: 'security',
                purpose: 'Preserve existing VM attachments when updating firewall rules',
                expected_output: 'JSON list of currently attached VM IDs',
                dependencies: ['hyperstack-launch'],
                timestamp: new Date().toISOString()
            });
            
            // 7. Firewall - Update with All VMs
            commands.push({
                type: 'firewall-update-attachments',
                hostname: operation.hostname,
                parent_operation: 'runpod-launch',
                title: 'Update firewall with all VMs (existing + new)',
                description: 'Updates firewall to include all existing VMs plus the newly created VM',
                command: `curl -X POST -H 'api_key: <HYPERSTACK_API_KEY>' \\
  -H 'Content-Type: application/json' \\
  -d '{"vms": [<EXISTING_VM_IDS>, <NEW_VM_ID>]}' \\
  https://infrahub-api.nexgencloud.com/v1/core/firewalls/971/update-attachments`,
                timing: 'After getting existing attachments',
                command_type: 'security',
                purpose: 'Apply security rules to new VM while preserving existing VM protections',
                expected_output: 'Firewall updated successfully with all VM attachments',
                dependencies: ['firewall-get-attachments'],
                timestamp: new Date().toISOString()
            });
        }
        
    } else {
        // Migration commands as separate operations
        
        // 1. Remove from source aggregate
        commands.push({
            type: 'aggregate-remove',
            hostname: operation.hostname,
            parent_operation: 'host-migration',
            title: `Remove host from ${operation.sourceAggregate}`,
            description: `Removes compute host from current aggregate to prepare for relocation`,
            command: `openstack aggregate remove host ${operation.sourceAggregate} ${operation.hostname}`,
            verification_commands: [
                `openstack aggregate show ${operation.sourceAggregate}`,
                `openstack hypervisor show ${operation.hostname}`
            ],
            timing: 'Immediate',
            command_type: 'migration',
            purpose: 'Remove host from current resource pool to enable relocation',
            expected_output: `Host ${operation.hostname} removed from aggregate ${operation.sourceAggregate}`,
            dependencies: [],
            timestamp: new Date().toISOString()
        });
        
        // 2. Add to target aggregate
        commands.push({
            type: 'aggregate-add',
            hostname: operation.hostname,
            parent_operation: 'host-migration',
            title: `Add host to ${operation.targetAggregate}`,
            description: `Adds compute host to target aggregate for new resource pool assignment`,
            command: `openstack aggregate add host ${operation.targetAggregate} ${operation.hostname}`,
            verification_commands: [
                `openstack aggregate show ${operation.targetAggregate}`,
                `openstack hypervisor show ${operation.hostname}`
            ],
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

function getCommandIcon(type) {
    switch(type) {
        case 'timing': return 'fas fa-clock text-warning';
        case 'api': return 'fas fa-rocket text-primary';
        case 'network': return 'fas fa-network-wired text-info';
        case 'security': return 'fas fa-shield-alt text-success';
        case 'migration': return 'fas fa-exchange-alt text-secondary';
        default: return 'fas fa-cog text-muted';
    }
}

// Debug System Functions
function initializeDebugTab() {
    document.getElementById('sessionStartTime').textContent = debugStats.sessionStart.toLocaleString();
    updateDebugStats();
    debugTabInitialized = true;
}

function addToDebugLog(type, message, level = 'info', hostname = null) {
    const timestamp = new Date();
    const debugEntry = {
        timestamp: timestamp,
        type: type,
        message: message,
        level: level,
        hostname: hostname
    };
    
    debugLog.push(debugEntry);
    
    // Update debug tab if initialized
    if (debugTabInitialized) {
        updateDebugLogDisplay();
        updateDebugTabBadge();
    }
    
    // Also log to console for development
    const consoleMethod = level === 'error' ? 'error' : level === 'warning' ? 'warn' : 'log';
    console[consoleMethod](`[${type}] ${message}`, hostname ? `(${hostname})` : '');
}

function updateDebugLogDisplay() {
    const debugContainer = document.getElementById('debugLogContainer');
    if (!debugContainer) return;
    
    if (debugLog.length === 0) {
        debugContainer.innerHTML = `
            <div class="text-center text-muted">
                <i class="fas fa-bug fa-3x mb-3"></i>
                <p>Debug information will appear here during operations.</p>
            </div>
        `;
        return;
    }
    
    const logHtml = debugLog.slice(-100).reverse().map(entry => {
        let iconClass, textClass, bgClass;
        switch (entry.level) {
            case 'success':
                iconClass = 'fas fa-check-circle text-success';
                textClass = 'text-success';
                bgClass = 'bg-light-success';
                break;
            case 'error':
                iconClass = 'fas fa-exclamation-circle text-danger';
                textClass = 'text-danger';
                bgClass = 'bg-light-danger';
                break;
            case 'warning':
                iconClass = 'fas fa-exclamation-triangle text-warning';
                textClass = 'text-warning';
                bgClass = 'bg-light-warning';
                break;
            case 'info':
            default:
                iconClass = 'fas fa-info-circle text-info';
                textClass = 'text-info';
                bgClass = 'bg-light-info';
                break;
        }
        
        return `
            <div class="debug-entry p-2 mb-2 rounded ${bgClass}">
                <div class="d-flex align-items-start">
                    <i class="${iconClass} me-2 mt-1"></i>
                    <div class="flex-grow-1">
                        <div class="debug-message">
                            <strong class="${textClass}">${entry.type}:</strong>
                            <span class="ms-1">${entry.message}</span>
                            ${entry.hostname ? `<span class="badge bg-secondary ms-2">${entry.hostname}</span>` : ''}
                        </div>
                        <small class="text-muted">
                            <i class="fas fa-clock me-1"></i>${entry.timestamp.toLocaleTimeString()}
                        </small>
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    debugContainer.innerHTML = logHtml;
}

function updateDebugStats() {
    if (!debugTabInitialized) return;
    
    document.getElementById('operationsCount').textContent = debugStats.operationsCount;
    document.getElementById('commandsExecuted').textContent = debugStats.commandsExecuted;
    document.getElementById('errorsCount').textContent = debugStats.errorsCount;
}

function updateDebugTabBadge() {
    const badge = document.getElementById('debugTabCount');
    if (badge) {
        badge.textContent = debugLog.length;
        if (debugLog.length > 0) {
            badge.className = 'badge bg-warning ms-1';
        }
    }
}

function clearDebugLog() {
    if (confirm('Clear all debug information?')) {
        debugLog = [];
        debugStats.commandsExecuted = 0;
        debugStats.errorsCount = 0;
        updateDebugLogDisplay();
        updateDebugStats();
        updateDebugTabBadge();
        addToDebugLog('System', 'Debug log cleared', 'info');
    }
}

function exportDebugLog() {
    const debugData = {
        sessionStart: debugStats.sessionStart,
        exportTime: new Date(),
        stats: debugStats,
        log: debugLog
    };
    
    const dataStr = JSON.stringify(debugData, null, 2);
    const dataBlob = new Blob([dataStr], {type: 'application/json'});
    const url = URL.createObjectURL(dataBlob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `debug-log-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
    link.click();
    
    URL.revokeObjectURL(url);
    addToDebugLog('System', 'Debug log exported', 'info');
}

