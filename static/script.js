// OpenStack Spot Manager JavaScript

let currentGpuType = '';
let selectedHosts = new Set();
let aggregateData = {};
let pendingOperations = [];

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    initializeEventListeners();
});

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
    document.getElementById('refreshBtn').addEventListener('click', refreshData);
    
    // Migration confirmation
    document.getElementById('confirmMigrationBtn').addEventListener('click', executeMigration);
    
    // Command log buttons
    document.getElementById('refreshLogBtn').addEventListener('click', loadCommandLog);
    document.getElementById('clearLogBtn').addEventListener('click', clearCommandLog);
    
    // Pending operations buttons
    document.getElementById('commitBtn').addEventListener('click', commitAllOperations);
    document.getElementById('clearPendingBtn').addEventListener('click', clearPendingOperations);
    
    // Tab switching - refresh data when switching to command log or results
    document.getElementById('commands-tab').addEventListener('click', loadCommandLog);
    document.getElementById('results-tab').addEventListener('click', loadResultsSummary);
    
    // Load initial command log
    loadCommandLog();
}

function loadAggregateData(gpuType) {
    showLoading(true);
    
    fetch(`/api/aggregates/${gpuType}`)
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                showNotification(data.error, 'danger');
                return;
            }
            
            aggregateData = data;
            renderAggregateData(data);
            showLoading(false);
            showMainContent();
        })
        .catch(error => {
            showNotification('Error loading aggregate data: ' + error.message, 'danger');
            showLoading(false);
        });
}

function renderAggregateData(data) {
    // Update headers
    document.getElementById('ondemandName').textContent = data.ondemand.name;
    document.getElementById('spotName').textContent = data.spot.name;
    document.getElementById('ondemandCount').textContent = data.ondemand.hosts.length;
    document.getElementById('spotCount').textContent = data.spot.hosts.length;
    
    // Render hosts
    renderHosts('ondemandHosts', data.ondemand.hosts, 'ondemand');
    renderHosts('spotHosts', data.spot.hosts, 'spot');
    
    // Setup drag and drop
    setupDragAndDrop();
}

function renderHosts(containerId, hosts, type) {
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
    
    // Create individual machine cards for each host
    const hostCards = hosts.map(host => createHostCard(host, type)).join('');
    container.innerHTML = `
        <div class="drop-zone machine-grid" data-type="${type}">
            ${hostCards}
        </div>
    `;
}

function createHostCard(host, type) {
    const hasVms = host.has_vms;
    const vmBadgeClass = hasVms ? 'vm-badge active' : 'vm-badge zero';
    const warningIcon = hasVms ? '<i class="fas fa-exclamation-triangle warning-icon"></i>' : '';
    const cardClass = hasVms ? 'machine-card has-vms' : 'machine-card';
    
    return `
        <div class="${cardClass}" 
             draggable="true" 
             data-host="${host.name}" 
             data-type="${type}"
             data-has-vms="${hasVms}">
            <div class="machine-card-header">
                <i class="fas fa-grip-vertical drag-handle"></i>
                <div class="machine-name">${host.name}</div>
                ${warningIcon}
            </div>
            <div class="machine-status">
                <div class="vm-info ${host.vm_count > 0 ? 'clickable-vm-count' : ''}" 
                     ${host.vm_count > 0 ? `onclick="showVmDetails('${host.name}')"` : ''}>
                    <i class="fas fa-circle status-dot ${hasVms ? 'active' : 'inactive'}"></i>
                    <span class="${vmBadgeClass}">${host.vm_count}</span>
                    <span class="vm-label">${host.vm_count > 0 ? 'VMs' : 'No VMs'}</span>
                </div>
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
    
    const selectedOndemandHosts = Array.from(selectedHosts).filter(host => {
        const card = document.querySelector(`[data-host="${host}"]`);
        return card && card.dataset.type === 'ondemand';
    });
    
    const selectedSpotHosts = Array.from(selectedHosts).filter(host => {
        const card = document.querySelector(`[data-host="${host}"]`);
        return card && card.dataset.type === 'spot';
    });
    
    moveToSpotBtn.disabled = selectedOndemandHosts.length === 0;
    moveToOndemandBtn.disabled = selectedSpotHosts.length === 0;
}

function moveSelectedHosts(targetType) {
    const sourceType = targetType === 'spot' ? 'ondemand' : 'spot';
    const hostsToMove = Array.from(selectedHosts).filter(host => {
        const card = document.querySelector(`[data-host="${host}"]`);
        return card && card.dataset.type === sourceType;
    });
    
    if (hostsToMove.length === 0) return;
    
    // Add all selected hosts to pending operations
    hostsToMove.forEach(hostname => {
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
    const sourceAggregate = sourceType === 'ondemand' ? aggregateData.ondemand.name : aggregateData.spot.name;
    const targetAggregate = targetType === 'ondemand' ? aggregateData.ondemand.name : aggregateData.spot.name;
    
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
    const sourceAggregate = sourceType === 'ondemand' ? aggregateData.ondemand.name : aggregateData.spot.name;
    const targetAggregate = targetType === 'ondemand' ? aggregateData.ondemand.name : aggregateData.spot.name;
    
    const commands = [];
    hostnames.forEach(hostname => {
        commands.push(`openstack aggregate remove host ${sourceAggregate} ${hostname}`);
        commands.push(`openstack aggregate add host ${targetAggregate} ${hostname}`);
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
            
            if (data.vms && data.vms.length > 0) {
                const vmList = data.vms.map(vm => `
                    <div class="card mb-2">
                        <div class="card-body">
                            <h6 class="card-title">${vm.Name}</h6>
                            <p class="card-text">
                                <span class="badge bg-${vm.Status === 'ACTIVE' ? 'success' : 'secondary'}">${vm.Status}</span>
                                <small class="text-muted">ID: ${vm.ID}</small>
                            </p>
                        </div>
                    </div>
                `).join('');
                
                modalBody.innerHTML = `
                    <h6>Host: ${hostname}</h6>
                    <p>Running VMs (${data.count}):</p>
                    ${vmList}
                `;
            } else {
                modalBody.innerHTML = `
                    <h6>Host: ${hostname}</h6>
                    <p>No VMs running on this host.</p>
                `;
            }
            
            modal.show();
        })
        .catch(error => {
            showNotification('Error loading VM details: ' + error.message, 'danger');
        });
}

function refreshData() {
    if (currentGpuType) {
        selectedHosts.clear();
        loadAggregateData(currentGpuType);
    }
}

function showLoading(show) {
    const loadingIndicator = document.getElementById('loadingIndicator');
    if (show) {
        loadingIndicator.classList.remove('d-none');
    } else {
        loadingIndicator.classList.add('d-none');
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
    const sourceAggregate = sourceType === 'ondemand' ? aggregateData.ondemand.name : aggregateData.spot.name;
    const targetAggregate = targetType === 'ondemand' ? aggregateData.ondemand.name : aggregateData.spot.name;
    
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