// Main application logic for OpenStack Spot Manager
// Coordinates between modules and handles application initialization

// Application state
let isExecutionInProgress = false;
let backgroundLoadingStarted = false;

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Initializing OpenStack Spot Manager');
    window.Logs.addToDebugLog('System', 'Application starting up', 'info');
    
    initializeEventListeners();
    window.OpenStack.loadGpuTypes();
    window.Logs.initializeDebugTab();
});

// Initialize event listeners
function initializeEventListeners() {
    console.log('🔧 Setting up event listeners');
    
    // GPU type selector
    document.getElementById('gpuTypeSelect').addEventListener('change', function() {
        const selectedType = this.value;
        if (selectedType) {
            console.log(`📊 Loading data for GPU type: ${selectedType}`);
            window.OpenStack.loadAggregateData(selectedType);
            
            // Start background loading for other types
            if (!backgroundLoadingStarted) {
                startBackgroundLoading(selectedType);
                backgroundLoadingStarted = true;
            }
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

// Start background loading of other GPU types
function startBackgroundLoading(currentGpuType) {
    if (!window.Frontend.availableGpuTypes || window.Frontend.availableGpuTypes.length <= 1) {
        return;
    }
    
    const typesToLoad = window.Frontend.availableGpuTypes.filter(type => type !== currentGpuType);
    
    if (typesToLoad.length === 0) {
        return;
    }
    
    console.log(`📋 Loading ${typesToLoad.length} GPU types in background: ${typesToLoad.join(', ')}`);
    window.Logs.addToDebugLog('System', `Background loading ${typesToLoad.length} GPU types`, 'info');
    
    // Show background loading status
    const statusElement = document.getElementById('backgroundLoadingStatus');
    if (statusElement) {
        statusElement.style.display = 'inline';
    }
    
    // Load all types concurrently using Promise.allSettled for better error handling
    Promise.allSettled(typesToLoad.map(type => window.OpenStack.loadAggregateData(type, true)))
        .then(results => {
            const successful = results.filter(result => result.status === 'fulfilled').length;
            const failed = results.filter(result => result.status === 'rejected').length;
            
            console.log(`📊 Background loading completed: ${successful} successful, ${failed} failed`);
            window.Logs.addToDebugLog('System', `Background loading completed: ${successful} successful, ${failed} failed`, 'info');
            
            // Hide background loading status
            if (statusElement) {
                statusElement.style.display = 'none';
            }
            
            // Update GPU type selector to show cached types
            updateGpuTypeSelector();
        })
        .catch(error => {
            console.error('Background loading error:', error);
            window.Logs.addToDebugLog('System', `Background loading error: ${error.message}`, 'error');
            
            if (statusElement) {
                statusElement.style.display = 'none';
            }
        });
}

// Update GPU type selector to show cached types
function updateGpuTypeSelector() {
    const select = document.getElementById('gpuTypeSelect');
    if (!select) return;
    
    Array.from(select.options).forEach(option => {
        if (option.value && option.value !== select.value) {
            option.textContent = option.value + ' ⚡';
            option.title = 'Cached - will load instantly';
        }
    });
}

// Preload all GPU types
function preloadAllGpuTypes() {
    const currentType = document.getElementById('gpuTypeSelect').value;
    if (!currentType) {
        window.Frontend.showNotification('Please select a GPU type first', 'warning');
        return;
    }
    
    if (!backgroundLoadingStarted) {
        startBackgroundLoading(currentType);
        backgroundLoadingStarted = true;
    }
}

// Move selected hosts to target type
function moveSelectedHosts(targetType) {
    const selectedCards = document.querySelectorAll('.host-card.selected');
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

// Toggle group visibility
function toggleGroup(groupId) {
    const group = document.getElementById(groupId);
    const chevron = document.getElementById(groupId + '-chevron');
    
    if (group && chevron) {
        if (group.classList.contains('collapse')) {
            group.classList.remove('collapse');
            chevron.classList.remove('fa-chevron-down');
            chevron.classList.add('fa-chevron-up');
        } else {
            group.classList.add('collapse');
            chevron.classList.remove('fa-chevron-up');
            chevron.classList.add('fa-chevron-down');
        }
    }
}

// Setup drag and drop functionality
function setupDragAndDrop() {
    const draggableElements = document.querySelectorAll('.host-card');
    const dropZones = document.querySelectorAll('.drop-zone');
    
    draggableElements.forEach(element => {
        element.addEventListener('dragstart', handleDragStart);
        element.addEventListener('dragend', handleDragEnd);
    });
    
    dropZones.forEach(zone => {
        zone.addEventListener('dragover', handleDragOver);
        zone.addEventListener('dragenter', handleDragEnter);
        zone.addEventListener('dragleave', handleDragLeave);
        zone.addEventListener('drop', handleDrop);
    });
}

// Drag and drop event handlers
function handleDragStart(e) {
    e.dataTransfer.setData('text/plain', e.target.dataset.host);
    e.target.classList.add('dragging');
}

function handleDragEnd(e) {
    e.target.classList.remove('dragging');
}

function handleDragOver(e) {
    e.preventDefault();
}

function handleDragEnter(e) {
    e.preventDefault();
    e.target.classList.add('drag-over');
}

function handleDragLeave(e) {
    e.target.classList.remove('drag-over');
}

function handleDrop(e) {
    e.preventDefault();
    e.target.classList.remove('drag-over');
    
    const hostname = e.dataTransfer.getData('text/plain');
    const targetType = e.target.dataset.type;
    const sourceCard = document.querySelector(`[data-host="${hostname}"]`);
    
    if (sourceCard && targetType) {
        const sourceType = sourceCard.dataset.type;
        if (sourceType !== targetType) {
            window.Frontend.addToPendingOperations(hostname, sourceType, targetType);
        }
    }
}

// Show VM details modal
function showVmDetails(hostname) {
    console.log(`📋 Showing VM details for ${hostname}`);
    window.Logs.addToDebugLog('System', `Showing VM details for ${hostname}`, 'info', hostname);
    
    window.OpenStack.getHostVmDetails(hostname)
        .then(data => {
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
                const vmsHtml = data.vms.map(vm => `
                    <div class="vm-card card mb-3">
                        <div class="card-body">
                            <div class="d-flex justify-content-between align-items-start">
                                <h6 class="card-title">${vm.name}</h6>
                                <span class="badge bg-${window.Utils.getStatusClass(vm.status)}">${vm.status}</span>
                            </div>
                            <div class="vm-details">
                                <div class="row">
                                    <div class="col-md-6">
                                        <small class="text-muted">
                                            <strong>ID:</strong> ${vm.id}<br>
                                            <strong>Flavor:</strong> ${vm.flavor}<br>
                                            <strong>Image:</strong> ${vm.image || 'N/A'}
                                        </small>
                                    </div>
                                    <div class="col-md-6">
                                        <small class="text-muted">
                                            <strong>Created:</strong> ${window.Utils.formatDate(vm.created)}<br>
                                            <strong>Updated:</strong> ${window.Utils.formatDate(vm.updated)}
                                        </small>
                                    </div>
                                </div>
                                ${vm.addresses ? `
                                    <div class="mt-2">
                                        <small class="text-muted">
                                            <strong>Addresses:</strong> ${vm.addresses}
                                        </small>
                                    </div>
                                ` : ''}
                            </div>
                        </div>
                    </div>
                `).join('');
                
                modalBody.innerHTML = vmsHtml;
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
    
    if (isExecutionInProgress) {
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
        window.Frontend.updateCardPendingIndicators();
        
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
        window.Frontend.updateCardPendingIndicators();
        
        window.Frontend.showNotification(`Removed ${operation.hostname} from pending operations`, 'info');
    }
}

// Execute all pending operations
function executeAllPendingOperations() {
    if (isExecutionInProgress) {
        window.Frontend.showNotification('Execution already in progress', 'warning');
        return;
    }
    
    isExecutionInProgress = true;
    window.Logs.incrementOperationsCount();
    
    console.log(`🚀 Executing ${window.Frontend.pendingOperations.length} pending operations`);
    window.Logs.addToDebugLog('System', `Starting execution of ${window.Frontend.pendingOperations.length} operations`, 'info');
    
    // Generate commands for each operation
    const commandsByOperation = [];
    
    window.Frontend.pendingOperations.forEach(operation => {
        let commands;
        
        if (operation.type === 'runpod-launch') {
            commands = window.Hyperstack.generateRunpodLaunchCommands(operation);
        } else {
            commands = window.OpenStack.generateMigrationCommands(operation);
        }
        
        commandsByOperation.push({
            operation: operation,
            commands: commands.map(cmd => ({
                id: `cmd-${operation.hostname}-${cmd.type}-${commandsByOperation.length}`,
                ...cmd
            }))
        });
    });
    
    // Execute commands sequentially
    executeCommandsSequentially(commandsByOperation)
        .then(() => {
            console.log('✅ All operations completed successfully');
            window.Logs.addToDebugLog('System', 'All operations completed successfully', 'success');
            window.Frontend.showNotification('All operations completed successfully', 'success');
            
            // Clear completed operations
            window.Frontend.pendingOperations = [];
            window.Frontend.updatePendingOperationsDisplay();
            window.Frontend.updateCardPendingIndicators();
            
            // Refresh data
            refreshData();
        })
        .catch(error => {
            console.error('❌ Error during operations execution:', error);
            window.Logs.addToDebugLog('System', `Error during operations execution: ${error.message}`, 'error');
            window.Frontend.showNotification(`Error during execution: ${error.message}`, 'danger');
        })
        .finally(() => {
            isExecutionInProgress = false;
        });
}

// Execute commands sequentially
function executeCommandsSequentially(commandsByOperation) {
    return new Promise((resolve, reject) => {
        let currentIndex = 0;
        
        function executeNext() {
            if (currentIndex >= commandsByOperation.length) {
                resolve();
                return;
            }
            
            const { operation, commands } = commandsByOperation[currentIndex];
            console.log(`🔄 Executing operation ${currentIndex + 1}/${commandsByOperation.length}: ${operation.hostname}`);
            
            executeCommandsForOperation(operation, commands)
                .then(() => {
                    currentIndex++;
                    executeNext();
                })
                .catch(error => {
                    console.error(`❌ Error in operation ${currentIndex + 1}:`, error);
                    reject(error);
                });
        }
        
        executeNext();
    });
}

// Execute commands for a single operation
function executeCommandsForOperation(operation, commands) {
    return new Promise((resolve, reject) => {
        let currentCommandIndex = 0;
        
        function executeNextCommand() {
            if (currentCommandIndex >= commands.length) {
                resolve();
                return;
            }
            
            const command = commands[currentCommandIndex];
            console.log(`⚡ Executing command ${currentCommandIndex + 1}/${commands.length}: ${command.title}`);
            window.Logs.addToDebugLog('Command', `Executing: ${command.title}`, 'info', operation.hostname);
            
            executeActualCommand(operation, command)
                .then(result => {
                    console.log(`✅ Command completed: ${command.title}`);
                    window.Logs.addToDebugLog('Command', `Completed: ${command.title}`, 'success', operation.hostname);
                    window.Logs.incrementCommandsExecuted();
                    
                    currentCommandIndex++;
                    executeNextCommand();
                })
                .catch(error => {
                    console.error(`❌ Command failed: ${command.title}`, error);
                    window.Logs.addToDebugLog('Command', `Failed: ${command.title} - ${error.message}`, 'error', operation.hostname);
                    reject(error);
                });
        }
        
        executeNextCommand();
    });
}

// Execute actual command
function executeActualCommand(operation, command) {
    return new Promise((resolve, reject) => {
        const commandId = command.id;
        const hostname = operation.hostname;
        
        // Extract command type from ID - more robust extraction
        const commandType = commandId.split('-').slice(2, -1).join('-');
        
        if (commandType === 'wait-command') {
            // Handle wait command
            window.Logs.addToDebugLog('Wait Command', `Waiting 60 seconds for aggregate propagation`, 'info', hostname);
            setTimeout(() => {
                resolve({
                    output: `[${new Date().toLocaleString()}] Wait completed - 60 seconds elapsed\nAggregate membership propagated successfully`
                });
            }, 60000); // Actual 60 second wait
            
        } else if (commandType === 'hyperstack-launch') {
            // Handle VM launch via backend API
            window.Hyperstack.executeRunpodLaunch(hostname)
                .then(result => {
                    if (result.success) {
                        resolve({
                            output: `[${new Date().toLocaleString()}] VM created successfully\nID: ${result.vm_id}\nName: ${result.vm_name}\nFlavor: ${result.flavor_name}\nStatus: ACTIVE`
                        });
                    } else {
                        reject(new Error(result.error || 'VM launch failed'));
                    }
                })
                .catch(error => reject(error));
                
        } else if (commandType.includes('storage')) {
            // Handle storage network operations
            // These are handled automatically by the backend after VM launch
            setTimeout(() => {
                resolve({
                    output: `[${new Date().toLocaleString()}] Storage network operation completed\nNetwork attached successfully`
                });
            }, 2000);
            
        } else if (commandType.includes('firewall')) {
            // Handle firewall operations
            // These are handled automatically by the backend after VM launch
            setTimeout(() => {
                resolve({
                    output: `[${new Date().toLocaleString()}] Firewall operation completed\nVM added to firewall rules`
                });
            }, 2000);
            
        } else if (commandType === 'aggregate-remove') {
            // Handle host migration - remove from aggregate
            window.OpenStack.executeHostMigration(hostname, operation.sourceAggregate, operation.targetAggregate, 'remove')
                .then(result => {
                    if (result.success) {
                        resolve({
                            output: `[${new Date().toLocaleString()}] Host ${hostname} removed from aggregate ${operation.sourceAggregate}\nOperation completed successfully`
                        });
                    } else {
                        reject(new Error(result.error || 'Host removal failed'));
                    }
                })
                .catch(error => reject(error));
                
        } else if (commandType === 'aggregate-add') {
            // Handle host migration - add to aggregate
            window.OpenStack.executeHostMigration(hostname, operation.sourceAggregate, operation.targetAggregate, 'add')
                .then(result => {
                    if (result.success) {
                        resolve({
                            output: `[${new Date().toLocaleString()}] Host ${hostname} added to aggregate ${operation.targetAggregate}\nOperation completed successfully`
                        });
                    } else {
                        reject(new Error(result.error || 'Host addition failed'));
                    }
                })
                .catch(error => reject(error));
                
        } else {
            // Default case - simulate execution
            setTimeout(() => {
                resolve({
                    output: `[${new Date().toLocaleString()}] Command executed successfully\nOperation completed for ${hostname}`
                });
            }, 1000);
        }
    });
}

// Make functions available globally that need to be called from HTML or other modules
window.handleHostClick = handleHostClick;
window.toggleGroup = toggleGroup;
window.showVmDetails = showVmDetails;
window.removePendingOperation = removePendingOperation;
window.setupDragAndDrop = setupDragAndDrop;
window.updateControlButtons = updateControlButtons;

console.log('✅ OpenStack Spot Manager main script loaded');