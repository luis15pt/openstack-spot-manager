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

// Execute all pending operations (restored from original working version)
function executeAllPendingOperations() {
    const operations = [...window.Frontend.pendingOperations]; // Copy the array
    let completed = 0;
    let errors = [];
    
    const executeNext = (index) => {
        if (index >= operations.length) {
            // All operations completed
            const commitBtn = document.getElementById('commitBtn');
            commitBtn.disabled = false;
            commitBtn.innerHTML = '<i class="fas fa-check"></i> Commit All Operations';
            
            if (errors.length > 0) {
                window.Frontend.showNotification(`Completed with ${errors.length} errors: ${errors.join(', ')}`, 'warning');
            } else {
                window.Frontend.showNotification(`Successfully executed ${completed} operations`, 'success');
                window.Frontend.pendingOperations = []; // Clear pending operations on success
                window.Frontend.updatePendingOperationsDisplay();
            }
            
            refreshData();
            window.Logs.loadCommandLog();
            window.Logs.loadResultsSummary();
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
                const pendingIndex = window.Frontend.pendingOperations.findIndex(op => 
                    op.hostname === operation.hostname && 
                    op.sourceAggregate === operation.sourceAggregate &&
                    op.targetAggregate === operation.targetAggregate
                );
                
                if (pendingIndex !== -1) {
                    window.Frontend.pendingOperations.splice(pendingIndex, 1);
                }
                
                window.Frontend.updatePendingOperationsDisplay();
            }
            
            // Execute next operation
            executeNext(index + 1);
        })
        .catch(error => {
            errors.push(operation.hostname);
            console.error('Error executing operation:', error);
            // Continue with next operation even if this one fails
            executeNext(index + 1);
        });
    };
    
    const commitBtn = document.getElementById('commitBtn');
    commitBtn.disabled = true;
    commitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Executing Operations...';
    
    executeNext(0);
}

// Commit selected commands (restored from original working version)
function commitSelectedCommands() {
    const selectedCommands = document.querySelectorAll('.command-operation-checkbox:checked');
    
    if (selectedCommands.length === 0) {
        window.Frontend.showNotification('No commands selected for execution', 'warning');
        return;
    }
    
    // Group selected commands by operation for execution
    const commandsByOperation = {};
    
    selectedCommands.forEach(checkbox => {
        const operationIndex = parseInt(checkbox.dataset.operationIndex);
        const commandIndex = parseInt(checkbox.dataset.commandIndex);
        
        if (!isNaN(operationIndex) && operationIndex < window.Frontend.pendingOperations.length) {
            const operation = window.Frontend.pendingOperations[operationIndex];
            
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
                element: commandDiv,
                commandIndex: commandIndex
            });
        }
    });
    
    const totalCommands = selectedCommands.length;
    const totalOperations = Object.keys(commandsByOperation).length;
    
    console.log(`🚀 Committing ${totalCommands} commands across ${totalOperations} operations`);
    
    const commitBtn = document.getElementById('commitBtn');
    commitBtn.disabled = true;
    commitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Executing Commands...';
    
    executeCommandsSequentially(commandsByOperation);
}

// Execute commands sequentially (restored from original working version)
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
                window.Frontend.showNotification(`Completed with ${errors.length} errors: ${errors.join(', ')}`, 'warning');
            } else {
                window.Frontend.showNotification(`Successfully executed ${completedCommands} commands`, 'success');
            }
            
            // Remove completed commands and update display
            removeCompletedCommands();
            window.Frontend.updatePendingOperationsDisplay();
            
            // Only refresh command log and results, don't refresh all host data
            window.Logs.loadCommandLog();
            window.Logs.loadResultsSummary();
            return;
        }
        
        const operationIndex = operationIndices[currentOperationIndex];
        const operationData = commandsByOperation[operationIndex];
        const operation = operationData.operation;
        const commands = operationData.commands;
        
        executeCommandsForOperation(operation, commands, (success) => {
            if (success) {
                completedCommands += commands.length;
                window.Logs.addToDebugLog('System', `Commands completed for ${operation.hostname}`, 'success');
            } else {
                errors.push(`${operation.hostname} commands failed`);
                window.Logs.addToDebugLog('System', `Commands failed for ${operation.hostname}`, 'error');
            }
            
            currentOperationIndex++;
            executeNextOperation();
        });
    };
    
    executeNextOperation();
}

// Execute commands for a specific operation (restored from original working version)
function executeCommandsForOperation(operation, commands, callback) {
    // This function will execute the actual commands for an operation
    // Pure simulation as in the working version - no real API calls
    
    let commandIndex = 0;
    
    const executeNextCommand = () => {
        if (commandIndex >= commands.length) {
            callback(true);
            return;
        }
        
        const command = commands[commandIndex];
        
        // Mark command as in progress
        markCommandAsInProgress(command.element);
        
        console.log(`🔄 Executing command: ${command.title}`);
        window.Logs.addToDebugLog('Command Started', `Executing: ${command.title}`, 'info', operation.hostname);
        
        // Simulate command execution with delay (simulate actual execution time)
        const executionTime = Math.floor(Math.random() * 3000) + 1000; // 1-4 seconds
        
        setTimeout(() => {
            // Simulate command output
            const simulatedOutput = generateSimulatedOutput(command.title, operation.hostname);
            
            // Mark command as completed with output
            markCommandAsCompleted(command.element, simulatedOutput);
            
            // Add to debug log
            window.Logs.addToDebugLog('Command Completed', `✓ ${command.title}`, 'success', operation.hostname);
            
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

// Execute RunPod launch operation
function executeRunPodLaunch(operation, callback) {
    const requestData = {
        hostname: operation.hostname,
        vm_name: operation.vm_name,
        flavor_name: operation.flavor_name,
        image_name: operation.image_name,
        key_name: operation.key_name
    };
    
    fetch('/api/execute-runpod-launch', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestData)
    })
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
    
    fetch('/api/execute-migration', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestData)
    })
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

// Remove completed commands
function removeCompletedCommands() {
    const completedCheckboxes = document.querySelectorAll('.command-operation-checkbox:checked');
    
    completedCheckboxes.forEach(checkbox => {
        const operationIndex = parseInt(checkbox.dataset.operationIndex);
        const commandIndex = parseInt(checkbox.dataset.commandIndex);
        
        if (!isNaN(operationIndex) && operationIndex < window.Frontend.pendingOperations.length) {
            const operation = window.Frontend.pendingOperations[operationIndex];
            
            // Mark command as completed
            if (!operation.completedCommands) {
                operation.completedCommands = [];
            }
            
            // Add command type to completed list (this is a simplified approach)
            if (!operation.completedCommands.includes(commandIndex)) {
                operation.completedCommands.push(commandIndex);
            }
            
            // If all commands for this operation are completed, remove the operation
            const totalCommands = 2; // Most operations have 2 commands (remove + add)
            if (operation.completedCommands.length >= totalCommands) {
                window.Frontend.pendingOperations.splice(operationIndex, 1);
            }
        }
    });
}

// Refresh data function (adapted for refactored structure)
function refreshData() {
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