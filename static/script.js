// Main application logic for OpenStack Spot Manager
// Coordinates between modules and handles application initialization

// Application state - store directly on window for proper module access
window.backgroundLoadingStarted = false;
window.currentGpuType = '';
window.gpuDataCache = new Map(); // Cache for loaded GPU data
window.backgroundLoadingInProgress = false;

// Function declarations need to be available before DOM ready
function startBackgroundLoading(currentGpuType) {
    if (window.backgroundLoadingStarted || window.backgroundLoadingInProgress) {
        return;
    }
    
    if (!window.Frontend?.availableGpuTypes || window.Frontend.availableGpuTypes.length <= 1) {
        return;
    }
    
    // Get GPU types to load in background (excluding current one and already cached)
    const typesToLoad = window.Frontend.availableGpuTypes.filter(type => 
        type !== currentGpuType && !window.gpuDataCache.has(type)
    );
    
    if (typesToLoad.length === 0) {
        return;
    }
    
    window.backgroundLoadingStarted = true;
    window.backgroundLoadingInProgress = true;
    
    console.log(`📋 Loading ${typesToLoad.length} GPU types in background: ${typesToLoad.join(', ')}`);
    window.Logs?.addToDebugLog('System', `Background loading ${typesToLoad.length} GPU types`, 'info');
    
    // Show background loading status
    const statusElement = document.getElementById('backgroundLoadingStatus');
    if (statusElement) {
        statusElement.style.display = 'inline';
    }
    
    // Load all types concurrently using Promise.allSettled for better error handling
    Promise.allSettled(typesToLoad.map(type => window.OpenStack.loadAggregateData(type, true)))
        .then(results => {
            // Get successfully cached types
            const cachedTypes = typesToLoad.filter((type, index) => results[index].status === 'fulfilled');
            const successful = cachedTypes.length;
            const failed = results.length - successful;
            
            console.log(`📊 Background loading completed: ${successful} successful, ${failed} failed`);
            console.log(`✅ Successfully cached types: ${cachedTypes.join(', ')}`);
            window.Logs?.addToDebugLog('System', `Background loading completed: ${successful} successful, ${failed} failed`, 'info');
            
            // Hide background loading status
            if (statusElement) {
                statusElement.style.display = 'none';
            }
            
            // Update GPU type selector to show cached types with ⚡ indicators
            window.Frontend?.updateGpuTypeSelector(cachedTypes);
            
            // Reset background loading progress
            window.backgroundLoadingInProgress = false;
        })
        .catch(error => {
            console.error('Background loading error:', error);
            window.Logs?.addToDebugLog('System', `Background loading error: ${error.message}`, 'error');
            
            if (statusElement) {
                statusElement.style.display = 'none';
            }
            
            // Reset background loading progress
            window.backgroundLoadingInProgress = false;
        });
}

// Make function globally available
window.startBackgroundLoading = startBackgroundLoading;

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Initializing OpenStack Spot Manager');
    
    // Debug: Check if modules are loaded
    console.log('📋 Checking module availability:');
    console.log('  - window.Utils:', typeof window.Utils);
    console.log('  - window.Logs:', typeof window.Logs);
    console.log('  - window.OpenStack:', typeof window.OpenStack);
    console.log('  - window.Frontend:', typeof window.Frontend);
    console.log('  - window.Hyperstack:', typeof window.Hyperstack);
    
    if (!window.Logs) {
        console.error('❌ Logs module not loaded!');
        return;
    }
    
    window.Logs.addToDebugLog('System', 'Application starting up', 'info');
    
    if (!window.OpenStack) {
        console.error('❌ OpenStack module not loaded!');
        window.Logs.addToDebugLog('System', 'OpenStack module not loaded', 'error');
        return;
    }
    
    console.log('🔧 Initializing event listeners...');
    initializeEventListeners();
    
    console.log('📊 Loading GPU types...');
    window.OpenStack.loadGpuTypes();
    
    console.log('🐛 Initializing debug tab...');
    window.Logs.initializeDebugTab();
    
    console.log('✅ Application initialization complete');
});

// Initialize event listeners
function initializeEventListeners() {
    console.log('🔧 Setting up event listeners');
    
    // GPU type selector
    document.getElementById('gpuTypeSelect').addEventListener('change', function() {
        const selectedType = this.value;
        if (selectedType) {
            window.currentGpuType = selectedType;
            console.log(`📊 Loading data for GPU type: ${selectedType}`);
            window.OpenStack.loadAggregateData(selectedType);
        } else {
            window.Frontend.hideMainContent();
        }
    });
    
    // Control buttons
    document.getElementById('moveToOndemandBtn').addEventListener('click', () => moveSelectedHosts('ondemand'));
    document.getElementById('moveToRunpodBtn').addEventListener('click', () => moveSelectedHosts('runpod'));
    document.getElementById('moveToSpotBtn').addEventListener('click', () => moveSelectedHosts('spot'));
    document.getElementById('refreshBtn').addEventListener('click', refreshData);
    
    // Pending operations buttons
    document.getElementById('commitBtn').addEventListener('click', commitSelectedCommands);
    document.getElementById('clearPendingBtn').addEventListener('click', clearPendingOperations);
    document.getElementById('selectAllPendingBtn').addEventListener('click', selectAllPendingOperations);
    document.getElementById('deselectAllPendingBtn').addEventListener('click', deselectAllPendingOperations);
    
    // Command log buttons
    document.getElementById('refreshLogBtn').addEventListener('click', window.Logs.loadCommandLog);
    document.getElementById('clearLogBtn').addEventListener('click', window.Logs.clearCommandLog);
    
    // Debug buttons
    document.getElementById('clearDebugBtn').addEventListener('click', window.Logs.clearDebugLog);
    document.getElementById('exportDebugBtn').addEventListener('click', window.Logs.exportDebugLog);
    
    // Preload button
    document.getElementById('preloadAllBtn').addEventListener('click', preloadAllGpuTypes);
    
    // Tab switching
    document.getElementById('commands-tab').addEventListener('click', () => {
        setTimeout(() => window.Logs.loadCommandLog(), 100);
    });
    
    document.getElementById('results-tab').addEventListener('click', () => {
        setTimeout(() => window.Logs.loadResultsSummary(), 100);
    });
}

// Preload all GPU types
function preloadAllGpuTypes() {
    const currentType = document.getElementById('gpuTypeSelect').value;
    if (!currentType) {
        window.Frontend.showNotification('Please select a GPU type first', 'warning');
        return;
    }
    
    if (!window.backgroundLoadingStarted) {
        startBackgroundLoading(currentType);
    }
}

// Move selected hosts to target type
function moveSelectedHosts(targetType) {
    const selectedCards = document.querySelectorAll('.machine-card.selected');
    if (selectedCards.length === 0) {
        window.Frontend.showNotification('Please select hosts to move', 'warning');
        return;
    }
    
    console.log(`🔄 Moving ${selectedCards.length} hosts to ${targetType}`);
    window.Logs.addToDebugLog('System', `Moving ${selectedCards.length} hosts to ${targetType}`, 'info');
    
    selectedCards.forEach(card => {
        const hostname = card.dataset.host;
        const sourceType = card.dataset.type;
        
        if (sourceType === targetType) {
            console.log(`⚠️ ${hostname} is already in ${targetType}`);
            return;
        }
        
        // Add to pending operations
        window.Frontend.addToPendingOperations(hostname, sourceType, targetType);
    });
    
    // Clear selection
    selectedCards.forEach(card => card.classList.remove('selected'));
    window.Frontend.selectedHosts.clear();
    updateControlButtons();
}

// Handle host card clicks
function handleHostClick(e) {
    if (e.target.closest('button')) {
        return; // Don't handle clicks on buttons
    }
    
    const card = e.currentTarget;
    const hostname = card.dataset.host;
    
    if (card.classList.contains('selected')) {
        card.classList.remove('selected');
        window.Frontend.selectedHosts.delete(hostname);
    } else {
        card.classList.add('selected');
        window.Frontend.selectedHosts.add(hostname);
    }
    
    updateControlButtons();
}

// Update control buttons based on selection
function updateControlButtons() {
    const selectedCount = window.Frontend.selectedHosts.size;
    const buttons = ['moveToOndemandBtn', 'moveToRunpodBtn', 'moveToSpotBtn'];
    
    buttons.forEach(buttonId => {
        const button = document.getElementById(buttonId);
        if (button) {
            button.disabled = selectedCount === 0;
        }
    });
}

// Refresh data
function refreshData() {
    const selectedType = document.getElementById('gpuTypeSelect').value;
    if (selectedType) {
        console.log(`🔄 Refreshing data for ${selectedType}`);
        window.Logs.addToDebugLog('System', `Refreshing data for ${selectedType}`, 'info');
        window.OpenStack.loadAggregateData(selectedType);
    }
}

// Toggle group visibility - removed duplicate function
// Using the correct toggleGroup function from frontend.js instead

// Show VM details modal
function showVmDetails(hostname) {
    console.log(`📋 Showing VM details for ${hostname}`);
    window.Logs.addToDebugLog('System', `Showing VM details for ${hostname}`, 'info', hostname);
    
    window.OpenStack.getHostVmDetails(hostname)
        .then(data => {
            console.log('🔍 VM Details API Response:', data);
            console.log('🔍 VM Details VMs Array:', data.vms);
            if (data.vms && data.vms.length > 0) {
                console.log('🔍 First VM Object:', data.vms[0]);
                console.log('🔍 VM Properties:', Object.keys(data.vms[0]));
            }
            
            const modal = new bootstrap.Modal(document.getElementById('vmDetailsModal'));
            const modalBody = document.getElementById('vmDetailsBody');
            const modalTitle = document.querySelector('#vmDetailsModal .modal-title');
            
            // Update modal title
            modalTitle.textContent = `VMs on Host: ${hostname}`;
            
            if (data.error) {
                modalBody.innerHTML = `
                    <div class="alert alert-danger">
                        <i class="fas fa-exclamation-triangle"></i>
                        Error loading VM details: ${data.error}
                    </div>`;
            } else if (!data.vms || data.vms.length === 0) {
                modalBody.innerHTML = `
                    <div class="alert alert-info">
                        <i class="fas fa-info-circle"></i>
                        No VMs found on this host.
                    </div>`;
            } else {
                const vmTableRows = data.vms.map(vm => {
                    const statusClass = window.Utils.getStatusClass(vm.Status);
                    const statusIcon = window.Utils.getStatusIcon(vm.Status);
                    const created = window.Utils.formatDate(vm.Created);
                    
                    return `
                        <tr>
                            <td>
                                <div class="d-flex align-items-center">
                                    <i class="fas ${statusIcon} me-2" style="color: ${window.Utils.getStatusColor(vm.Status)}"></i>
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
                            <td><small>${vm.Image || 'N/A'}</small></td>
                            <td><small>${created}</small></td>
                        </tr>
                    `;
                }).join('');
                
                modalBody.innerHTML = `
                    <div class="mb-3">
                        <h6 class="text-muted mb-0">Host: ${hostname}</h6>
                        <small class="text-muted">Found ${data.vms.length} VM(s)</small>
                    </div>
                    <div class="table-responsive">
                        <table class="table table-hover">
                            <thead class="table-light">
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
            }
            
            modal.show();
        })
        .catch(error => {
            console.error('Error loading VM details:', error);
            window.Logs.addToDebugLog('System', `Error loading VM details: ${error.message}`, 'error', hostname);
            window.Frontend.showNotification(`Error loading VM details: ${error.message}`, 'danger');
        });
}

// Pending operations management
function commitSelectedCommands() {
    if (window.Frontend.pendingOperations.length === 0) {
        window.Frontend.showNotification('No pending operations to commit', 'warning');
        return;
    }
    
    if (window.Frontend.isExecutionInProgress) {
        window.Frontend.showNotification('Execution already in progress', 'warning');
        return;
    }
    
    console.log(`🚀 Committing ${window.Frontend.pendingOperations.length} pending operations`);
    window.Logs.addToDebugLog('System', `Committing ${window.Frontend.pendingOperations.length} pending operations`, 'info');
    
    executeAllPendingOperations();
}

function selectAllPendingOperations() {
    const checkboxes = document.querySelectorAll('#pendingOperationsList input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
        checkbox.checked = true;
    });
    updateCommitButtonState();
}

function deselectAllPendingOperations() {
    const checkboxes = document.querySelectorAll('#pendingOperationsList input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
        checkbox.checked = false;
    });
    updateCommitButtonState();
}

function updateCommitButtonState() {
    const commitBtn = document.getElementById('commitBtn');
    const checkedBoxes = document.querySelectorAll('#pendingOperationsList input[type="checkbox"]:checked');
    
    if (commitBtn) {
        commitBtn.disabled = checkedBoxes.length === 0;
    }
}

function clearPendingOperations() {
    if (window.Frontend.pendingOperations.length === 0) {
        window.Frontend.showNotification('No pending operations to clear', 'info');
        return;
    }
    
    if (confirm('Are you sure you want to clear all pending operations?')) {
        console.log('🗑️ Clearing all pending operations');
        window.Logs.addToDebugLog('System', 'Clearing all pending operations', 'info');
        
        window.Frontend.pendingOperations = [];
        window.Frontend.updatePendingOperationsDisplay();
        
        window.Frontend.showNotification('All pending operations cleared', 'success');
    }
}

function removePendingOperation(index) {
    if (index >= 0 && index < window.Frontend.pendingOperations.length) {
        const operation = window.Frontend.pendingOperations[index];
        console.log(`🗑️ Removing pending operation: ${operation.hostname}`);
        window.Logs.addToDebugLog('System', `Removing pending operation: ${operation.hostname}`, 'info');
        
        window.Frontend.pendingOperations.splice(index, 1);
        window.Frontend.updatePendingOperationsDisplay();
        
        window.Frontend.showNotification(`Removed ${operation.hostname} from pending operations`, 'info');
    }
}

// Execute all pending operations
function executeAllPendingOperations() {
    if (window.Frontend.isExecutionInProgress) {
        window.Frontend.showNotification('Execution already in progress', 'warning');
        return;
    }
    
    // Get selected operations
    const selectedOperations = getSelectedOperations();
    if (selectedOperations.length === 0) {
        window.Frontend.showNotification('No operations selected for execution', 'warning');
        return;
    }
    
    window.Frontend.isExecutionInProgress = true;
    window.Logs.incrementOperationsCount();
    
    console.log(`🚀 Executing ${selectedOperations.length} pending operations`);
    window.Logs.addToDebugLog('System', `Starting execution of ${selectedOperations.length} operations`, 'info');
    
    // Execute operations sequentially
    executeOperationsSequentially(selectedOperations);
}

// Get selected operations from the UI
function getSelectedOperations() {
    const selectedOps = [];
    const checkboxes = document.querySelectorAll('#pendingOperationsList input[type="checkbox"]:checked');
    
    console.log('🔍 getSelectedOperations debug:', {
        totalCheckboxes: document.querySelectorAll('#pendingOperationsList input[type="checkbox"]').length,
        checkedCheckboxes: checkboxes.length,
        pendingOperationsCount: window.Frontend.pendingOperations.length
    });
    
    checkboxes.forEach((checkbox, idx) => {
        const operationIndex = parseInt(checkbox.dataset.operationIndex);
        const commandIndex = parseInt(checkbox.dataset.commandIndex);
        
        console.log(`🔍 Checkbox ${idx}:`, {
            id: checkbox.id,
            operationIndex,
            commandIndex,
            hasOperationIndex: !isNaN(operationIndex),
            hasCommandIndex: !isNaN(commandIndex)
        });
        
        if (!isNaN(operationIndex) && operationIndex < window.Frontend.pendingOperations.length) {
            const operation = window.Frontend.pendingOperations[operationIndex];
            if (!isNaN(commandIndex)) {
                // This is a specific command within an operation
                const commands = window.Frontend.generateIndividualCommandOperations(operation);
                if (commandIndex < commands.length) {
                    selectedOps.push({
                        ...operation,
                        specificCommand: commands[commandIndex],
                        operationIndex,
                        commandIndex
                    });
                }
            } else {
                // This is an entire operation
                selectedOps.push({
                    ...operation,
                    operationIndex
                });
            }
        }
    });
    
    console.log('🔍 Selected operations:', selectedOps);
    return selectedOps;
}

// Execute operations sequentially
function executeOperationsSequentially(operations) {
    let currentIndex = 0;
    const errors = [];
    let completedCount = 0;
    
    console.log('🔍 executeOperationsSequentially called with:', {
        operationsCount: operations.length,
        operations: operations.map(op => ({
            hostname: op.hostname,
            type: op.type,
            sourceAggregate: op.sourceAggregate,
            targetAggregate: op.targetAggregate
        }))
    });
    
    const executeNext = () => {
        if (currentIndex >= operations.length) {
            // All operations completed
            window.Frontend.isExecutionInProgress = false;
            
            if (errors.length > 0) {
                window.Frontend.showNotification(`Completed with ${errors.length} errors. Check command log for details.`, 'warning');
            } else {
                window.Frontend.showNotification(`Successfully executed ${completedCount} operations`, 'success');
            }
            
            // Remove completed operations and update display
            removeCompletedOperations();
            
            // Refresh data and logs
            refreshAfterExecution();
            return;
        }
        
        const operation = operations[currentIndex];
        console.log(`🔄 Executing operation ${currentIndex + 1}/${operations.length}: ${operation.hostname}`);
        window.Logs.addToDebugLog('System', `Executing operation for ${operation.hostname}`, 'info');
        
        // Execute the operation
        executeOperation(operation, (success, error) => {
            if (success) {
                completedCount++;
                console.log(`✅ Operation completed for ${operation.hostname}`);
                window.Logs.addToDebugLog('System', `Operation completed for ${operation.hostname}`, 'success');
            } else {
                errors.push(`${operation.hostname}: ${error}`);
                console.error(`❌ Operation failed for ${operation.hostname}: ${error}`);
                window.Logs.addToDebugLog('System', `Operation failed for ${operation.hostname}: ${error}`, 'error');
            }
            
            currentIndex++;
            executeNext();
        });
    };
    
    executeNext();
}

// Execute a single operation
function executeOperation(operation, callback) {
    if (operation.type === 'runpod-launch') {
        // Execute RunPod launch
        executeRunPodLaunch(operation, callback);
    } else {
        // Execute OpenStack migration
        executeOpenStackMigration(operation, callback);
    }
}

// Execute RunPod launch operation
function executeRunPodLaunch(operation, callback) {
    const requestData = {
        hostname: operation.hostname,
        vm_name: operation.vm_name,
        flavor_name: operation.flavor_name,
        image_name: operation.image_name,
        key_name: operation.key_name
    };
    
    window.Utils.fetchWithTimeout('/api/execute-runpod-launch', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestData)
    }, 30000)
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            callback(false, data.error);
        } else {
            callback(true);
        }
    })
    .catch(error => {
        callback(false, error.message);
    });
}

// Execute OpenStack migration operation
function executeOpenStackMigration(operation, callback) {
    const requestData = {
        host: operation.hostname,
        source_aggregate: operation.sourceAggregate,
        target_aggregate: operation.targetAggregate
    };
    
    console.log('🔍 executeOpenStackMigration called:', {
        operation: operation.hostname,
        requestData
    });
    
    window.Utils.fetchWithTimeout('/api/execute-migration', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestData)
    }, 30000)
    .then(response => {
        console.log('🔍 Migration API response:', response.status, response.statusText);
        return response.json();
    })
    .then(data => {
        console.log('🔍 Migration API data:', data);
        if (data.error) {
            callback(false, data.error);
        } else {
            callback(true);
        }
    })
    .catch(error => {
        console.error('🔍 Migration API error:', error);
        callback(false, error.message);
    });
}

// Remove completed operations
function removeCompletedOperations() {
    const selectedOps = getSelectedOperations();
    
    // Remove operations in reverse order to maintain indices
    const operationIndices = [...new Set(selectedOps.map(op => op.operationIndex))].sort((a, b) => b - a);
    
    operationIndices.forEach(index => {
        if (index >= 0 && index < window.Frontend.pendingOperations.length) {
            window.Frontend.pendingOperations.splice(index, 1);
        }
    });
    
    window.Frontend.updatePendingOperationsDisplay();
}

// Refresh data after execution
function refreshAfterExecution() {
    // Refresh command log
    window.Logs.loadCommandLog();
    
    // Refresh results summary
    window.Logs.loadResultsSummary();
    
    // Refresh current GPU data
    const selectedType = document.getElementById('gpuTypeSelect').value;
    if (selectedType) {
        window.OpenStack.loadAggregateData(selectedType);
    }
}

// Make functions available globally that need to be called from HTML or other modules
window.showVmDetails = showVmDetails;
window.removePendingOperation = removePendingOperation;
window.updateControlButtons = updateControlButtons;

console.log('✅ OpenStack Spot Manager main script loaded');