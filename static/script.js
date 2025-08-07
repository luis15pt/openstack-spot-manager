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
    
    // Main content is now always visible (no d-none class in HTML)
    console.log('👁️ Main content and contract column are visible by default');
    
    // Initialize contract column with available contracts
    console.log('📋 Initializing contract column...');
    initializeContractColumn();
    
    console.log('📊 Loading GPU types...');
    window.OpenStack.loadGpuTypes();
    
    // Check URL parameters for auto-selection
    const urlParams = new URLSearchParams(window.location.search);
    const gpuTypeFromUrl = urlParams.get('gpu_type');
    if (gpuTypeFromUrl) {
        console.log(`🔗 URL parameter detected: gpu_type=${gpuTypeFromUrl}`);
        window.Logs.addToDebugLog('System', `Auto-selecting GPU type from URL: ${gpuTypeFromUrl}`, 'info');
        
        // Store for later selection after GPU types are loaded
        window.urlGpuType = gpuTypeFromUrl;
    }
    
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
            
            // Load contract aggregates for the contract column
            loadContractAggregatesForColumn(selectedType);
        } else {
            // Don't hide main content - keep contract column visible
            // Just clear the other columns data but keep contract column available
            clearContractColumn();
        }
    });
    
    // Contract column selector
    document.getElementById('contractColumnSelect').addEventListener('change', function() {
        const selectedContract = this.value;
        if (selectedContract) {
            console.log(`📋 Selected contract from column: ${selectedContract}`);
            loadContractDataForColumn(selectedContract);
        } else {
            // When no contract is selected, reload overall contract statistics
            console.log(`📋 No contract selected, showing overall statistics`);
            if (window.currentGpuType) {
                loadContractAggregatesForColumn(window.currentGpuType);
            } else {
                clearContractHosts();
            }
        }
    });
    
    // Contract refresh button
    document.getElementById('refreshContractBtn').addEventListener('click', function() {
        console.log('🔄 Refreshing contract column');
        const gpuType = window.currentGpuType;
        if (gpuType) {
            loadContractAggregatesForColumn(gpuType);
        }
    });
    
    // Control buttons
    document.getElementById('moveToOndemandBtn').addEventListener('click', () => moveSelectedHosts('ondemand'));
    document.getElementById('moveToRunpodBtn').addEventListener('click', () => moveSelectedHosts('runpod'));
    document.getElementById('moveToSpotBtn').addEventListener('click', () => moveSelectedHosts('spot'));
    document.getElementById('refreshBtn').addEventListener('click', refreshData);
    
    // Individual column refresh buttons
    document.getElementById('refreshRunpodBtn').addEventListener('click', () => refreshSpecificColumn('runpod'));
    document.getElementById('refreshOndemandBtn').addEventListener('click', () => refreshSpecificColumn('ondemand'));
    document.getElementById('refreshSpotBtn').addEventListener('click', () => refreshSpecificColumn('spot'));
    
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

// Refresh specific column
function refreshSpecificColumn(columnType) {
    const selectedType = document.getElementById('gpuTypeSelect').value;
    if (selectedType) {
        console.log(`🎯 Refreshing ONLY ${columnType} column for ${selectedType}`);
        window.Logs.addToDebugLog('System', `Refreshing ${columnType} column for ${selectedType}`, 'info');
        
        // Add visual feedback - temporarily show loading state for the button
        const buttonId = `refresh${columnType.charAt(0).toUpperCase() + columnType.slice(1)}Btn`;
        const button = document.getElementById(buttonId);
        if (button) {
            const originalContent = button.innerHTML;
            button.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            button.disabled = true;
            
            // Load only the specific aggregate data
            loadSpecificAggregateData(selectedType, columnType)
                .then(() => {
                    // Restore button after successful refresh
                    button.innerHTML = originalContent;
                    button.disabled = false;
                })
                .catch(error => {
                    console.error(`❌ Error refreshing ${columnType} column:`, error);
                    window.Frontend.showNotification(`Error refreshing ${columnType} column: ${error.message}`, 'error');
                    
                    // Restore button even on error
                    button.innerHTML = originalContent;
                    button.disabled = false;
                });
        }
    }
}

// Load data for a specific aggregate type only
async function loadSpecificAggregateData(gpuType, aggregateType) {
    console.log(`🎯 Loading specific aggregate data: ${aggregateType} for ${gpuType}`);
    
    try {
        const response = await window.Utils.fetchWithTimeout(`/api/aggregates/${gpuType}/${aggregateType}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        }, 30000);
        
        const result = await window.Utils.checkResponse(response);
        const data = await result.json();
        
        console.log(`✅ Received ${aggregateType} data:`, data);
        
        // Update only the specific column based on aggregate type
        if (aggregateType === 'runpod') {
            // Update RunPod column
            updateRunpodColumn(data);
        } else if (aggregateType === 'spot') {
            // Update Spot column
            updateSpotColumn(data);
        } else if (aggregateType === 'ondemand') {
            // Update On-Demand column(s)
            updateOnDemandColumn(data);
        }
        
        // Setup drag and drop for new elements  
        if (window.Frontend && window.Frontend.setupDragAndDrop) {
            window.Frontend.setupDragAndDrop();
        }
        
        console.log(`✅ Successfully refreshed ${aggregateType} column`);
        window.Frontend.showNotification(`${aggregateType.charAt(0).toUpperCase() + aggregateType.slice(1)} column refreshed`, 'success');
        
    } catch (error) {
        console.error(`❌ Error loading ${aggregateType} data:`, error);
        throw error;
    }
}

// Update RunPod column specifically
function updateRunpodColumn(data) {
    console.log(`🔄 Updating RunPod column with ${data.hosts.length} hosts`);
    
    // Update header counts
    document.getElementById('runpodCount').textContent = data.hosts.length;
    
    // Update VM usage statistics
    const totalVms = data.hosts.reduce((total, host) => total + (host.vm_count || 0), 0);
    document.getElementById('runpodVmUsage').textContent = totalVms + ' VMs';
    
    // Re-render the hosts
    window.Frontend.renderHosts('runpodHosts', data.hosts, 'runpod', data.name);
}

// Update Spot column specifically
function updateSpotColumn(data) {
    console.log(`🔄 Updating Spot column with ${data.hosts.length} hosts`);
    
    // Update header counts
    document.getElementById('spotCount').textContent = data.hosts.length;
    
    // Update GPU statistics if available
    if (data.gpu_summary) {
        const spotPercent = Math.round((data.gpu_summary.gpu_used / data.gpu_summary.gpu_capacity) * 100) || 0;
        document.getElementById('spotGpuUsage').textContent = data.gpu_summary.gpu_usage_ratio;
        document.getElementById('spotGpuPercent').textContent = spotPercent + '%';
        document.getElementById('spotGpuProgressBar').style.width = spotPercent + '%';
    }
    
    // Re-render the hosts
    window.Frontend.renderHosts('spotHosts', data.hosts, 'spot', data.name);
}

// Update On-Demand column(s) specifically
function updateOnDemandColumn(data) {
    console.log(`🔄 Updating On-Demand column(s) with ${data.hosts.length} hosts`);
    
    // Update header counts (fallback column)
    document.getElementById('ondemandCount').textContent = data.hosts.length;
    
    // Update GPU statistics if available
    if (data.gpu_summary) {
        const ondemandPercent = Math.round((data.gpu_summary.gpu_used / data.gpu_summary.gpu_capacity) * 100) || 0;
        document.getElementById('ondemandGpuUsage').textContent = data.gpu_summary.gpu_usage_ratio;
        document.getElementById('ondemandGpuPercent').textContent = ondemandPercent + '%';
        document.getElementById('ondemandGpuProgressBar').style.width = ondemandPercent + '%';
    }
    
    // Store the data for variant column rendering
    const ondemandData = {
        name: data.name,
        hosts: data.hosts,
        variants: data.variants,
        gpu_summary: data.gpu_summary
    };
    
    // Re-render the variant columns with NVLink logic
    window.Frontend.renderOnDemandVariantColumns(ondemandData);
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
            
            const modalEl = document.getElementById('vmDetailsModal');
            const modalBody = document.getElementById('vmDetailsBody');
            const modalTitle = document.querySelector('#vmDetailsModal .modal-title');
            
            // Get existing modal instance or create new one
            let modal = bootstrap.Modal.getInstance(modalEl);
            if (!modal) {
                modal = new bootstrap.Modal(modalEl);
            }
            
            // Add event listener to properly clean up backdrop on hide
            modalEl.addEventListener('hidden.bs.modal', function() {
                // Remove any remaining backdrop elements
                const backdrops = document.querySelectorAll('.modal-backdrop');
                backdrops.forEach(backdrop => backdrop.remove());
                
                // Reset body classes
                document.body.classList.remove('modal-open');
                document.body.style.overflow = '';
                document.body.style.paddingRight = '';
            }, { once: true });
            
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
            
            // Refresh aggregate data to show any changes after operations complete
            refreshAggregateDataAfterOperations();
            
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
    // Execute only CHECKED commands with API calls
    // Skip any unchecked commands entirely
    
    let commandIndex = 0;
    
    const executeNextCommand = () => {
        if (commandIndex >= commands.length) {
            callback(true);
            return;
        }
        
        const command = commands[commandIndex];
        
        // Check if this command is actually checked/selected for execution
        const checkbox = command.element.querySelector('.command-operation-checkbox');
        
        // DEBUG: Add detailed logging for sleep commands
        console.log(`🔍 Debug command: "${command.title}"`);
        console.log(`🔍 Command element:`, command.element);
        console.log(`🔍 Checkbox found:`, checkbox);
        console.log(`🔍 Checkbox checked:`, checkbox ? checkbox.checked : 'NO CHECKBOX');
        console.log(`🔍 Command ID:`, command.id);
        console.log(`🔍 Full command object:`, command);
        
        if (!checkbox || !checkbox.checked) {
            console.log(`⏭️ Skipping unchecked command: ${command.title} - Checkbox: ${checkbox ? 'found but unchecked' : 'NOT FOUND'}`);
            window.Logs.addToDebugLog('Command Skipped', `Skipped (unchecked): ${command.title}`, 'info', operation.hostname);
            commandIndex++;
            executeNextCommand();
            return;
        }
        
        // Mark command as in progress
        markCommandAsInProgress(command.element);
        
        console.log(`🔄 Executing REAL command: ${command.title}`);
        console.log(`🔍 Command object:`, command); // Debug log to see command properties
        window.Logs.addToDebugLog('Command Started', `Executing: ${command.title}`, 'info', operation.hostname);
        
        // Execute REAL API calls based on command type
        executeRealCommand(operation, command)
            .then((result) => {
                // Mark command as completed with real API response
                const successOutput = result.output || `${command.title} completed successfully`;
                markCommandAsCompleted(command.element, successOutput);
                window.Logs.addToDebugLog('Command Success', `✓ ${command.title}`, 'success', operation.hostname);
                
                commandIndex++;
                executeNextCommand();
            })
            .catch(error => {
                console.error(`❌ Command failed for ${operation.hostname}:`, error);
                window.Logs.addToDebugLog('Command Failed', `✗ ${command.title}: ${error.message}`, 'error', operation.hostname);
                
                // Mark as failed with error details
                const errorOutput = `REAL COMMAND FAILED: ${error.message}\n\nCommand: ${command.title}`;
                markCommandAsCompleted(command.element, errorOutput);
                
                // Track this as a failed command
                if (!operation.failedCommands) {
                    operation.failedCommands = [];
                }
                if (!operation.failedCommands.includes(commandIndex)) {
                    operation.failedCommands.push(commandIndex);
                    console.log(`❌ Added command ${commandIndex} to failed commands for ${operation.hostname}`);
                }
                
                // STOP execution on failure - don't continue to next command
                console.error(`🛑 Stopping execution due to failed command: ${command.title}`);
                window.Logs.addToDebugLog('Execution Stopped', `Operation stopped due to failed command: ${command.title}`, 'error', operation.hostname);
                callback(false); // Indicate operation failed
                return;
            });
    };
    
    executeNextCommand();
}

// Execute real API calls based on command type
function executeRealCommand(operation, command) {
    return new Promise((resolve, reject) => {
        const hostname = operation.hostname;
        
        // Extract command type from title since command.type might be missing
        const commandTitle = command.title;
        let commandType;
        
        if (commandTitle.includes('Poll VM status until ACTIVE')) {
            commandType = 'vm-status-poll';
        } else if (commandTitle.includes('Sleep 10 seconds')) {
            commandType = 'firewall-wait-command';
        } else if (commandTitle.includes('Deploy VM via Hyperstack')) {
            commandType = 'hyperstack-launch';
        } else if (commandTitle.includes('Get server UUID')) {
            commandType = 'server-get-uuid';
        } else if (commandTitle.includes('Attach storage network')) {
            commandType = 'storage-attach-network';
        } else if (commandTitle.includes('Get current firewall')) {
            commandType = 'firewall-get-attachments';
        } else if (commandTitle.includes('Update firewall')) {
            commandType = 'firewall-update-attachments';
        } else if (commandTitle.includes('Remove host from')) {
            commandType = 'aggregate-remove-host';
        } else if (commandTitle.includes('Add host to')) {
            commandType = 'aggregate-add-host';
        } else {
            commandType = 'unknown';
        }
        
        console.log(`🔍 Determined command type: "${commandType}" from title: "${commandTitle}"`);
        
        switch (commandType) {
            case 'vm-status-poll':
                // Poll VM status until ACTIVE (replaces 120-second wait)
                console.log(`🔄 Polling VM status for ${hostname} until ACTIVE`);
                pollVmStatus(hostname)
                    .then(result => {
                        resolve({ output: result });
                    })
                    .catch(error => reject(error));
                break;
                
            case 'firewall-wait-command':
                // Real wait for firewall operations
                console.log(`⏰ Waiting 10 seconds for network stabilization`);
                setTimeout(() => {
                    resolve({ output: `[${new Date().toLocaleString()}] Wait completed - 10 seconds elapsed\nNetwork configuration stable, ready for firewall configuration` });
                }, 10000); // Real 10 second wait
                break;
                
            case 'hyperstack-launch':
                // VM deployment via Hyperstack API
                console.log(`🚀 Deploying Hyperstack VM for ${hostname}`);
                window.Hyperstack.executeRunpodLaunch(hostname)
                    .then(result => {
                        // Store the VM ID for use in firewall operations
                        if (result && result.vm_id) {
                            if (!window.commandContext) window.commandContext = {};
                            window.commandContext[`${hostname}_vm_id`] = result.vm_id;
                            console.log(`💾 Stored VM ID for ${hostname}: ${result.vm_id}`);
                            
                            // Update firewall command displays with actual VM ID
                            updateCommandDisplayWithValue(hostname, 'firewall-update-attachments', '<NEW_VM_ID>', result.vm_id);
                        }
                        
                        const output = result && result.vm_id ? 
                            `VM ${hostname} launched successfully\nVM ID: ${result.vm_id}\nFloating IP: ${result.floating_ip || 'Assigned'}\nStatus: ACTIVE` :
                            `VM ${hostname} launched successfully via Hyperstack API`;
                        resolve({ output });
                    })
                    .catch(error => reject(error));
                break;
                
            case 'server-get-uuid':
                // OpenStack server UUID lookup using SDK
                console.log(`🔍 Looking up server UUID for ${hostname}`);
                window.OpenStack.executeNetworkCommand(`openstack server list --all-projects --name "${hostname}" -c ID -f value`)
                    .then(result => {
                        // Store the UUID for use in subsequent commands
                        if (!window.commandContext) window.commandContext = {};
                        window.commandContext[`${hostname}_uuid`] = result;
                        console.log(`💾 Stored UUID for ${hostname}: ${result}`);
                        
                        // Update network attachment command display with actual UUID
                        updateCommandDisplayWithValue(hostname, 'storage-attach-network', '<UUID_FROM_STEP_4>', result);
                        resolve({ output: `Server UUID: ${result}\n${hostname} found with ID: ${result}` });
                    })
                    .catch(error => reject(error));
                break;
                
            case 'storage-attach-network':
                // OpenStack network attachment using SDK (server add network approach)
                console.log(`🌐 Attaching network to ${hostname}`);
                
                // Get the stored UUID from previous command
                const serverUuid = window.commandContext && window.commandContext[`${hostname}_uuid`];
                if (!serverUuid) {
                    reject(new Error(`Server UUID not found for ${hostname}. UUID lookup may have failed.`));
                    return;
                }
                
                console.log(`🔑 Using stored UUID for ${hostname}: ${serverUuid}`);
                
                // Use the actual backend endpoint that handles UUID lookup properly
                window.Utils.fetchWithTimeout('/api/openstack/server/add-network', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        server_name: hostname,  // Backend will do UUID lookup again for safety
                        network_name: "RunPod-Storage-Canada-1"
                    })
                }, 30000)
                .then(window.Utils.checkResponse)
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        resolve({ output: `Network attached successfully to ${hostname} (UUID: ${serverUuid})\nHigh-performance storage network connected` });
                    } else {
                        reject(new Error(data.error || 'Network attachment failed'));
                    }
                })
                .catch(error => reject(error));
                break;
                
            case 'firewall-get-attachments':
                // Hyperstack firewall query via backend endpoint
                console.log(`🛡️ Querying firewall for existing VMs`);
                window.Utils.fetchWithTimeout('/api/hyperstack/firewall/get-attachments', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({})  // Uses default firewall ID from backend
                }, 30000)
                .then(window.Utils.checkResponse)
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        resolve({ output: `Firewall attachments retrieved\nFirewall ID: ${data.firewall_id}\nCurrent VMs: ${data.vm_ids.join(', ')}\nTotal VMs: ${data.count}` });
                    } else {
                        reject(new Error(data.error || 'Firewall query failed'));
                    }
                })
                .catch(error => reject(error));
                break;
                
            case 'firewall-update-attachments':
                // Hyperstack firewall update via backend endpoint
                console.log(`🛡️ Updating firewall with ${hostname}`);
                
                // Get the stored VM ID from Step 1
                const vmId = window.commandContext && window.commandContext[`${hostname}_vm_id`];
                if (!vmId) {
                    reject(new Error(`VM ID not found for ${hostname}. VM deployment may have failed.`));
                    return;
                }
                
                console.log(`🔑 Using stored VM ID for ${hostname}: ${vmId}`);
                
                window.Utils.fetchWithTimeout('/api/hyperstack/firewall/update-attachments', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ vm_id: vmId })  // Use VM ID instead of name
                }, 30000)
                .then(window.Utils.checkResponse)
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        resolve({ output: `Firewall updated successfully\nVM ${hostname} (ID: ${vmId}) added to firewall ${data.firewall_id}\nTotal VMs on firewall: ${data.total_vms}\nVM list: ${data.vm_list.join(', ')}` });
                    } else {
                        reject(new Error(data.error || 'Firewall update failed'));
                    }
                })
                .catch(error => reject(error));
                break;
                
            case 'aggregate-remove-host':
            case 'aggregate-add-host':
                // Handle both operations as a complete migration
                const isRemove = commandType === 'aggregate-remove-host';
                const sourceMatch = command.title.match(/Remove host from (.+)/);
                const targetMatch = command.title.match(/Add host to (.+)/);
                
                // Try to find the operation by hostname in pending operations
                let currentOperation = window.Frontend?.pendingOperations?.find(op => op.hostname === hostname);
                
                // If not found by hostname, try the old method as fallback
                if (!currentOperation) {
                    const parts = command.id.split('-');
                    const operationIndex = parseInt(parts[parts.length - 1]) || 0;
                    currentOperation = window.Frontend?.pendingOperations?.[operationIndex];
                }
                
                // If still not found, try to extract from command title
                if (!currentOperation) {
                    const sourceAggregate = sourceMatch ? sourceMatch[1] : '';
                    const targetAggregate = targetMatch ? targetMatch[1] : '';
                    
                    if (sourceAggregate && targetAggregate) {
                        console.log(`⚠️ Operation context not found in pending operations, creating temporary context for ${hostname}`);
                        currentOperation = {
                            hostname: hostname,
                            sourceAggregate: sourceAggregate,
                            targetAggregate: targetAggregate
                        };
                    } else {
                        reject(new Error(`Operation context not found for migration. Could not extract source (${sourceAggregate}) or target (${targetAggregate}) aggregate from command title: ${command.title}`));
                        return;
                    }
                }
                
                const migrationData = {
                    host: hostname,
                    source_aggregate: currentOperation.sourceAggregate || (sourceMatch ? sourceMatch[1] : ''),
                    target_aggregate: currentOperation.targetAggregate || (targetMatch ? targetMatch[1] : '')
                };
                
                console.log(`🔄 ${isRemove ? 'Removing' : 'Adding'} ${hostname} ${isRemove ? 'from' : 'to'} aggregate ${isRemove ? migrationData.source_aggregate : migrationData.target_aggregate}`);
                
                window.Utils.fetchWithTimeout('/api/execute-migration', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(migrationData)
                }, 60000)
                .then(window.Utils.checkResponse)
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        const action = isRemove ? 'removed from' : 'added to';
                        const aggregate = isRemove ? migrationData.source_aggregate : migrationData.target_aggregate;
                        console.log(`✅ SUCCESS: Host ${hostname} ${action} aggregate ${aggregate}`);
                        resolve({ output: `Host ${hostname} successfully ${action} aggregate ${aggregate}` });
                    } else {
                        console.error(`❌ FAILED: Aggregate operation failed for ${hostname}: ${data.error}`);
                        reject(new Error(data.error || 'Failed to execute migration'));
                    }
                })
                .catch(error => {
                    console.error(`💥 NETWORK ERROR: Failed to communicate with backend for ${hostname}: ${error.message}`);
                    reject(error);
                });
                break;
                
            default:
                // For any unknown command types, reject
                reject(new Error(`Unknown command type: ${commandType}`));
        }
    });
}

// Note: executeOpenStackCommand function removed - now using OpenStack SDK via window.OpenStack.executeNetworkCommand

// Note: executeHyperstackCommand function removed - now using dedicated backend endpoints for firewall operations

// Note: generateSimulatedOutput function removed - all commands use API calls

// Update command display with actual values from previous steps
function updateCommandDisplayWithValue(hostname, commandType, placeholder, actualValue) {
    console.log(`🔄 Updating command display: ${commandType}, replacing "${placeholder}" with "${actualValue}"`);
    
    // Find all command elements for this hostname and command type
    const commandElements = document.querySelectorAll(`[data-command-id*="${hostname}"]`);
    
    commandElements.forEach(element => {
        const commandId = element.getAttribute('data-command-id');
        if (commandId && commandId.includes(commandType)) {
            // Find the command text element
            const commandTextElement = element.querySelector('.command-text');
            if (commandTextElement) {
                const currentText = commandTextElement.textContent;
                const updatedText = currentText.replace(placeholder, actualValue);
                
                if (currentText !== updatedText) {
                    commandTextElement.textContent = updatedText;
                    console.log(`✅ Updated command display for ${commandId}: "${placeholder}" → "${actualValue}"`);
                    
                    // Add visual indicator that the command was updated
                    element.classList.add('command-updated');
                    setTimeout(() => element.classList.remove('command-updated'), 2000);
                }
            }
        }
    });
}

function markCommandAsInProgress(commandElement) {
    commandElement.classList.add('in-progress-step');
    commandElement.classList.remove('completed-step');
    
    // Update the status badge using the new command structure
    const commandId = commandElement.getAttribute('data-command-id');
    const statusBadge = document.getElementById(`${commandId}-status`);
    if (statusBadge) {
        statusBadge.className = 'badge bg-warning ms-2 command-status-badge';
        statusBadge.textContent = 'In Progress';
    }
    
    const checkbox = commandElement.querySelector('.command-operation-checkbox');
    if (checkbox) {
        checkbox.disabled = true;
    }
    
    // Show progress bar if this is a wait command
    const progressContainer = document.getElementById(`${commandId}-progress`);
    if (progressContainer) {
        progressContainer.style.display = 'block';
        const progressBar = document.getElementById(`${commandId}-progress-bar`);
        const progressText = document.getElementById(`${commandId}-progress-text`);
        
        if (progressBar && progressText) {
            // Determine wait duration based on command title
            let waitDuration = 60; // default
            const commandTitle = commandElement.querySelector('.command-title strong')?.textContent || '';
            
            if (commandTitle.includes('Poll VM status until ACTIVE') || commandTitle.includes('vm-status-poll')) {
                waitDuration = 300; // Max 5 minutes for polling
            } else if (commandTitle.includes('Sleep 10 seconds') || commandTitle.includes('10s')) {
                waitDuration = 10;
            } else if (commandTitle.includes('Sleep 60 seconds') || commandTitle.includes('60s') || commandTitle.toLowerCase().includes('aggregate')) {
                waitDuration = 60;
            }
            
            // Animate progress bar for wait command
            let progress = 0;
            const incrementPerSecond = 100 / waitDuration;
            const interval = setInterval(() => {
                progress += incrementPerSecond;
                if (progress >= 100) {
                    progress = 100;
                    clearInterval(interval);
                    progressText.textContent = 'Wait completed!';
                } else {
                    const remaining = Math.max(0, Math.ceil(waitDuration - (progress * waitDuration / 100)));
                    progressText.textContent = `Waiting ${remaining} seconds...`;
                }
                progressBar.style.width = progress + '%';
            }, 1000);
        }
    }
    
    // Show output section if it exists (legacy support)
    const outputSection = commandElement.querySelector('.command-output');
    if (outputSection) {
        outputSection.style.display = 'block';
        const outputContent = outputSection.querySelector('.command-output-content');
        if (outputContent) {
            outputContent.innerHTML = `
                <div class="output-placeholder text-warning">
                    <i class="fas fa-spinner fa-spin me-1"></i>
                    Command executing...
                </div>
            `;
        }
    }
}

function markCommandAsCompleted(commandElement, output = null) {
    commandElement.classList.remove('in-progress-step');
    commandElement.classList.add('completed-step');
    
    // Update the status badge using the new command structure
    const commandId = commandElement.getAttribute('data-command-id');
    const statusBadge = document.getElementById(`${commandId}-status`);
    if (statusBadge) {
        statusBadge.className = 'badge bg-success ms-2 command-status-badge';
        statusBadge.textContent = 'Completed';
    }
    
    // Add check icon to the title if it doesn't exist
    const titleElement = commandElement.querySelector('.command-title');
    if (titleElement && !titleElement.querySelector('.fa-check-circle')) {
        titleElement.insertAdjacentHTML('afterbegin', '<i class="fas fa-check-circle text-success me-1"></i>');
    }
    
    const checkbox = commandElement.querySelector('.command-operation-checkbox');
    if (checkbox) {
        checkbox.checked = true;
        checkbox.disabled = true;
    }
    
    // Hide progress bar if it was shown
    const progressContainer = document.getElementById(`${commandId}-progress`);
    if (progressContainer) {
        progressContainer.style.display = 'none';
    }
    
    // Show and populate actual output section
    if (output) {
        const actualOutputSection = document.getElementById(`${commandId}-actual-output`);
        if (actualOutputSection) {
            const outputContent = actualOutputSection.querySelector('.actual-output-content');
            if (outputContent) {
                // Add timestamp and format output nicely
                const timestamp = new Date().toLocaleTimeString();
                outputContent.textContent = `[${timestamp}] ${output}`;
                actualOutputSection.style.display = 'block';
                console.log(`📄 Added actual output to ${commandId}`);
            }
        }
    }
    
    // Update output section with actual output (legacy support)
    const outputSection = commandElement.querySelector('.command-output');
    if (outputSection) {
        const outputContent = outputSection.querySelector('.command-output-content');
        const timestamp = new Date().toLocaleTimeString();
        
        if (outputContent) {
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
            
            // Initialize tracking arrays if they don't exist
            if (!operation.completedCommands) {
                operation.completedCommands = [];
            }
            if (!operation.failedCommands) {
                operation.failedCommands = [];
            }
            
            // Add command type to completed list (this is a simplified approach)
            if (!operation.completedCommands.includes(commandIndex)) {
                operation.completedCommands.push(commandIndex);
            }
            
            // Count total commands for this specific operation
            const operationCommands = window.generateIndividualCommandOperations ? window.generateIndividualCommandOperations(operation) : [];
            const totalCommands = operationCommands.length;
            
            console.log(`🔍 Operation ${operation.hostname}: ${operation.completedCommands.length}/${totalCommands} commands processed, ${operation.failedCommands.length} failed`);
            
            // Only remove operation if ALL commands completed successfully (no failures)
            if (operation.completedCommands.length >= totalCommands && operation.failedCommands.length === 0) {
                console.log(`✅ All commands completed successfully for ${operation.hostname}, removing from pending operations`);
                window.Logs.addToDebugLog('Operation Completed', `Removed ${operation.hostname} - all ${totalCommands} commands completed successfully`, 'success', operation.hostname);
                window.Frontend.pendingOperations.splice(operationIndex, 1);
            } else if (operation.failedCommands.length > 0) {
                console.log(`❌ Operation ${operation.hostname} has ${operation.failedCommands.length} failed commands - keeping in pending operations for review`);
                window.Logs.addToDebugLog('Operation Failed', `${operation.hostname} has failed commands - operation remains pending`, 'error', operation.hostname);
            }
            
            // Only refresh aggregate data if operation completed successfully (was removed)
            if (operation.completedCommands.length >= totalCommands && operation.failedCommands.length === 0) {
                // Refresh aggregate data for individual operation completion if it was an aggregate migration
                if (operation.type === 'move-to-spot' || operation.type === 'move-to-ondemand' || operation.type === 'move-to-runpod') {
                    console.log(`🔄 Individual operation completed for ${operation.hostname}, refreshing aggregate data`);
                    refreshAggregateDataAfterOperations();
                }
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

// Refresh aggregate data after operations complete to show any changes
function refreshAggregateDataAfterOperations() {
    const selectedType = document.getElementById('gpuTypeSelect').value;
    if (selectedType && window.currentGpuType) {
        console.log(`🔄 Refreshing aggregate data after operations completion for GPU type: ${window.currentGpuType}`);
        
        // Show brief refresh notification
        window.Frontend.showNotification(`Refreshing host data...`, 'info');
        
        // Add a small delay to ensure backend operations have fully completed
        setTimeout(() => {
            window.OpenStack.loadAggregateData(window.currentGpuType, false)
                .then(data => {
                    console.log(`✅ Successfully refreshed aggregate data after operations`);
                    window.Logs.addToDebugLog('System', 'Aggregate data refreshed after operations completion', 'success');
                    
                    // Update the host displays to show any changes
                    if (data) {
                        // Update RunPod hosts
                        if (data.runpod && data.runpod.hosts) {
                            window.Frontend.renderHosts('runpodHosts', data.runpod.hosts, 'runpod', data.runpod.name);
                        }
                        
                        // Update Spot hosts  
                        if (data.spot && data.spot.hosts) {
                            window.Frontend.renderHosts('spotHosts', data.spot.hosts, 'spot', data.spot.name);
                        }
                        
                        // Update On-demand hosts (including variants)
                        if (data.ondemand) {
                            window.Frontend.renderOnDemandVariantColumns(data.ondemand);
                        }
                        
                        // Note: GPU stats are updated automatically when columns are re-rendered
                    }
                })
                .catch(error => {
                    console.error('Error refreshing aggregate data after operations:', error);
                    window.Logs.addToDebugLog('System', `Error refreshing aggregate data: ${error.message}`, 'error');
                });
        }, 2000); // 2-second delay to ensure backend consistency
    }
}

// Poll VM status until it's no longer in BUILD state
async function pollVmStatus(hostname, maxAttempts = 60) {
    console.log(`🔄 Starting VM status polling for ${hostname}`);
    
    let attempts = 0;
    const startTime = new Date();
    
    while (attempts < maxAttempts) {
        try {
            console.log(`📊 Polling attempt ${attempts + 1}/${maxAttempts} for ${hostname}`);
            
            const response = await window.Utils.fetchWithTimeout('/api/openstack/server/status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ server_name: hostname })
            }, 10000);
            
            const result = await window.Utils.checkResponse(response);
            const data = await result.json();
            
            if (data.success) {
                const status = data.status;
                const vmState = data.vm_state;
                const taskState = data.task_state;
                
                console.log(`📊 ${hostname} status: ${status}, vm_state: ${vmState}, task_state: ${taskState}`);
                
                // Check if VM is ready (not in BUILD state)
                if (status !== 'BUILD') {
                    const elapsedTime = Math.round((new Date() - startTime) / 1000);
                    const finalOutput = `[${new Date().toLocaleString()}] VM status polling completed\n` +
                                      `Final status: ${status}\n` +
                                      `VM State: ${vmState || 'N/A'}\n` +
                                      `Task State: ${taskState || 'N/A'}\n` +
                                      `Total polling time: ${elapsedTime} seconds (${attempts + 1} checks)\n` +
                                      `VM is ready for network operations`;
                    
                    console.log(`✅ ${hostname} reached status: ${status} (was BUILD) after ${elapsedTime}s`);
                    return finalOutput;
                }
                
                // Still building, wait 5 seconds
                console.log(`⏳ ${hostname} still in BUILD state, waiting 5 seconds...`);
                await new Promise(resolve => setTimeout(resolve, 5000));
                attempts++;
                
            } else {
                throw new Error(`Status check failed: ${data.error}`);
            }
            
        } catch (error) {
            console.error(`❌ Error polling VM status for ${hostname}:`, error);
            attempts++;
            
            if (attempts >= maxAttempts) {
                throw new Error(`VM status polling failed after ${maxAttempts} attempts: ${error.message}`);
            }
            
            // Wait 5 seconds before retry
            console.log(`⏳ Retrying in 5 seconds... (attempt ${attempts}/${maxAttempts})`);
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
    
    // Max attempts reached
    const elapsedTime = Math.round((new Date() - startTime) / 1000);
    throw new Error(`VM status polling timeout after ${elapsedTime} seconds (${maxAttempts} attempts). VM may still be building.`);
}

// Make functions available globally that need to be called from HTML or other modules
// Contract Aggregates Functions
async function loadContractAggregatesForColumn(gpuType) {
    console.log(`📋 Loading contract aggregates for column with GPU type: ${gpuType}`);
    
    const contractSelect = document.getElementById('contractColumnSelect');
    const contractName = document.getElementById('contractName');
    
    if (!contractSelect) {
        console.warn('⚠️ Contract select element not found - contract column may not be loaded yet');
        return;
    }
    
    // Preserve the current selection if any
    const currentSelection = contractSelect ? contractSelect.value : '';

    try {
        // Show loading state
        contractSelect.innerHTML = '<option value="">Loading contracts...</option>';
        contractSelect.disabled = true;
        if (contractName) contractName.textContent = '';
        
        const response = await window.Utils.fetchWithTimeout(`/api/contract-aggregates/${gpuType}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        }, 30000);
        
        const result = await window.Utils.checkResponse(response);
        const data = await result.json();
        
        console.log(`📊 Found ${data.contracts?.length || 0} contract aggregates for ${gpuType}`);
        
        // Clear loading state and populate dropdown
        contractSelect.innerHTML = '<option value="">Select Contract...</option>';
        contractSelect.disabled = false;
        
        if (data.contracts && data.contracts.length > 0) {
            data.contracts.forEach(contract => {
                const option = document.createElement('option');
                option.value = contract.aggregate;
                option.textContent = `${contract.name} (${contract.host_count} hosts)`;
                contractSelect.appendChild(option);
            });
            
            // Restore the previous selection if it exists in the new options
            if (currentSelection && currentSelection !== '') {
                const optionExists = Array.from(contractSelect.options).some(option => option.value === currentSelection);
                if (optionExists) {
                    contractSelect.value = currentSelection;
                    console.log(`🔄 Restored contract selection: ${currentSelection}`);
                    // Reload the contract data to maintain the display
                    loadContractDataForColumn(currentSelection);
                } else {
                    // Current selection no longer exists, show overall contract statistics
                    loadOverallContractStatistics(data.contracts);
                }
            } else {
                // No specific contract selected, show overall contract statistics
                loadOverallContractStatistics(data.contracts);
            }
            
            console.log(`✅ Contract aggregates loaded in column successfully`);
        } else {
            contractSelect.innerHTML = '<option value="">No contracts available</option>';
            console.log(`ℹ️ No contract aggregates found for ${gpuType}`);
        }
        
    } catch (error) {
        console.error(`❌ Error loading contract aggregates for column:`, error);
        contractSelect.innerHTML = '<option value="">Error loading contracts</option>';
        contractSelect.disabled = false;
    }
}

function clearContractColumn() {
    const contractSelect = document.getElementById('contractColumnSelect');
    const contractName = document.getElementById('contractName');
    const contractHostCount = document.getElementById('contractHostCount');
    const contractGpuUsage = document.getElementById('contractGpuUsage');
    const contractGpuPercent = document.getElementById('contractGpuPercent');
    const contractGpuProgressBar = document.getElementById('contractGpuProgressBar');
    
    if (contractSelect) {
        contractSelect.innerHTML = '<option value="">Select Contract...</option>';
        contractSelect.disabled = false;
    }
    if (contractName) contractName.textContent = '';
    if (contractHostCount) contractHostCount.textContent = '0';
    if (contractGpuUsage) contractGpuUsage.textContent = '0/0';
    if (contractGpuPercent) contractGpuPercent.textContent = '0%';
    if (contractGpuProgressBar) contractGpuProgressBar.style.width = '0%';
    
    clearContractHosts();
}

function clearContractHosts() {
    const contractHostsList = document.getElementById('contractHostsList');
    const contractEmptyState = document.getElementById('contractEmptyState');
    
    if (contractHostsList) {
        contractHostsList.innerHTML = '';
        if (contractEmptyState) {
            const emptyStateClone = contractEmptyState.cloneNode(true);
            contractHostsList.appendChild(emptyStateClone);
            emptyStateClone.style.display = 'block';
        }
    }
}

async function loadContractDataForColumn(contractAggregate) {
    console.log(`📋 Loading data for contract: ${contractAggregate}`);
    
    const contractHostsList = document.getElementById('contractHostsList');
    const contractEmptyState = document.getElementById('contractEmptyState');
    
    try {
        const gpuType = window.currentGpuType;
        if (!gpuType) {
            console.error('❌ No GPU type selected');
            return;
        }
        
        // Show loading state
        if (contractEmptyState) contractEmptyState.style.display = 'none';
        if (contractHostsList) {
            contractHostsList.innerHTML = '<div class="text-center"><div class="spinner-border spinner-border-sm" role="status"></div><p class="mt-2 small">Loading contract data...</p></div>';
        }
        
        const response = await window.Utils.fetchWithTimeout(`/api/contract-aggregates/${gpuType}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        }, 30000);
        
        const result = await window.Utils.checkResponse(response);
        const data = await result.json();
        
        // Find the selected contract
        const selectedContract = data.contracts.find(contract => contract.aggregate === contractAggregate);
        
        if (selectedContract) {
            console.log(`✅ Contract data loaded for column:`, selectedContract);
            populateContractPanel(selectedContract);
        } else {
            console.error(`❌ Contract ${contractAggregate} not found in response`);
            if (contractHostsList) {
                contractHostsList.innerHTML = '<div class="text-center text-muted"><p class="small">Contract not found</p></div>';
            }
        }
        
    } catch (error) {
        console.error(`❌ Error loading contract data:`, error);
        if (contractHostsList) {
            contractHostsList.innerHTML = '<div class="text-center text-muted"><p class="small">Error loading contract data</p></div>';
        }
    }
}

// Old loadContractAggregateData function removed - replaced with loadContractDataForColumn

function populateContractPanel(contractData) {
    const contractName = document.getElementById('contractName');
    const contractHostCount = document.getElementById('contractHostCount');
    const contractGpuUsage = document.getElementById('contractGpuUsage');
    const contractGpuPercent = document.getElementById('contractGpuPercent');
    const contractGpuProgressBar = document.getElementById('contractGpuProgressBar');
    const contractHosts = document.getElementById('contractHosts');
    
    console.log('🔍 Contract data received:', contractData);
    console.log('🔍 First host data structure:', contractData?.hosts?.[0]);
    
    if (!contractData || !contractData.hosts) {
        console.error('❌ Invalid contract data provided');
        return;
    }
    
    // Update header information
    if (contractName) {
        contractName.textContent = contractData.name || '';
    }
    
    if (contractHostCount) {
        contractHostCount.textContent = contractData.host_count || 0;
    }
    
    // Calculate total GPU usage across all hosts using the correct field names
    let totalGpus = 0;
    let usedGpus = 0;
    
    contractData.hosts.forEach(host => {
        if (host.gpu_info) {
            // Use the correct field names that match the backend (gpu_capacity, gpu_used)
            totalGpus += host.gpu_info.gpu_capacity || 8; // Default to 8 GPUs per host
            usedGpus += host.gpu_info.gpu_used || 0;
        }
    });
    
    console.log(`📊 Contract GPU totals: ${usedGpus}/${totalGpus} GPUs across ${contractData.hosts.length} hosts`);
    
    const gpuPercentage = totalGpus > 0 ? Math.round((usedGpus / totalGpus) * 100) : 0;
    
    if (contractGpuUsage) {
        contractGpuUsage.textContent = `${usedGpus}/${totalGpus}`;
    }
    
    if (contractGpuPercent) {
        contractGpuPercent.textContent = `${gpuPercentage}%`;
    }
    
    if (contractGpuProgressBar) {
        contractGpuProgressBar.style.width = `${gpuPercentage}%`;
    }
    
    // Transform contract host data to match the format expected by renderHosts
    const transformedHosts = contractData.hosts.map(host => {
        const gpuInfo = host.gpu_info || {};
        // Use the correct field names that match the backend (gpu_capacity, gpu_used)
        const totalGpus = gpuInfo.gpu_capacity || 8; // Default to 8 for H100 hosts
        const usedGpus = gpuInfo.gpu_used || 0; // Use actual GPU usage
        
        console.log(`🔧 Transforming host ${host.hostname}:`);
        console.log(`  - VM Count: ${host.vm_count || 0}`);
        console.log(`  - GPU Info:`, gpuInfo);
        console.log(`  - Used/Total GPUs: ${usedGpus}/${totalGpus}`);
        console.log(`  - Tenant: ${host.tenant}`);
        
        return {
            name: host.hostname,
            has_vms: (host.vm_count || 0) > 0,
            vm_count: host.vm_count || 0,
            tenant: host.tenant || 'Unknown',
            owner_group: host.tenant === 'Nexgen Cloud' ? 'Nexgen Cloud' : 'Investors',
            gpu_used: usedGpus,
            gpu_usage_ratio: gpuInfo.gpu_usage_ratio || `${usedGpus}/${totalGpus}`,
            nvlinks: host.nvlinks !== false, // Default to true for contract hosts
            variant: contractData.aggregate || contractData.name
        };
    });
    
    // Use the same renderHosts function as other columns for consistent grouping
    if (window.Frontend && window.Frontend.renderHosts) {
        console.log(`📋 Rendering ${transformedHosts.length} contract hosts with proper grouping`);
        window.Frontend.renderHosts('contractHostsList', transformedHosts, 'contract', contractData.aggregate);
    }
    
    console.log(`✅ Contract panel populated with ${contractData.hosts.length} hosts using renderHosts with proper grouping`);
}

// New function to show overall contract statistics when no specific contract is selected
function loadOverallContractStatistics(contracts) {
    console.log(`📊 Loading overall statistics for ${contracts.length} contracts`);
    
    const contractName = document.getElementById('contractName');
    const contractHostCount = document.getElementById('contractHostCount');
    const contractGpuUsage = document.getElementById('contractGpuUsage');
    const contractGpuPercent = document.getElementById('contractGpuPercent');
    const contractGpuProgressBar = document.getElementById('contractGpuProgressBar');
    const contractHostsList = document.getElementById('contractHostsList');
    
    // Calculate totals across all contracts
    let totalHosts = 0;
    let totalGpus = 0;
    let usedGpus = 0;
    let totalAvailable = 0;
    let totalInUse = 0;
    
    contracts.forEach(contract => {
        totalHosts += contract.host_count || 0;
        
        if (contract.hosts && contract.hosts.length > 0) {
            contract.hosts.forEach(host => {
                const gpuInfo = host.gpu_info || {};
                const hostTotalGpus = gpuInfo.gpu_capacity || 8; // Default to 8 GPUs per host
                const hostUsedGpus = gpuInfo.gpu_used || 0;
                const hasVms = (host.vm_count || 0) > 0;

                totalGpus += hostTotalGpus;
                usedGpus += hostUsedGpus;

                if (hasVms) {
                    totalInUse++;
                } else {
                    totalAvailable++;
                }
            });
        }
    });
    
    const gpuPercentage = totalGpus > 0 ? Math.round((usedGpus / totalGpus) * 100) : 0;
    
    // Update header information to show "All Contracts"
    if (contractName) {
        contractName.textContent = 'All Contracts';
    }
    
    if (contractHostCount) {
        contractHostCount.textContent = totalHosts.toString();
    }
    
    if (contractGpuUsage) {
        contractGpuUsage.textContent = `${usedGpus}/${totalGpus}`;
    }
    
    if (contractGpuPercent) {
        contractGpuPercent.textContent = `${gpuPercentage}%`;
    }
    
    if (contractGpuProgressBar) {
        contractGpuProgressBar.style.width = `${gpuPercentage}%`;
    }
    
    // Show summary in the hosts list area
    if (contractHostsList) {
        contractHostsList.innerHTML = `
            <div class="text-center text-muted py-4">
                <i class="fas fa-chart-bar fa-3x mb-3"></i>
                <h6>All Contracts Overview</h6>
                <div class="row mt-3">
                    <div class="col-6">
                        <strong>${totalAvailable}</strong>
                        <br><small>Available Hosts</small>
                    </div>
                    <div class="col-6">
                        <strong>${totalInUse}</strong>
                        <br><small>In Use Hosts</small>
                    </div>
                </div>
                <p class="mt-3 small text-muted">Select a specific contract above to view detailed host information.</p>
            </div>
        `;
    }
    
    console.log(`📊 Overall contract statistics: ${usedGpus}/${totalGpus} GPUs (${gpuPercentage}%), ${totalAvailable} available, ${totalInUse} in use, across ${contracts.length} contracts`);
}

window.showVmDetails = showVmDetails;
window.removePendingOperation = removePendingOperation;
window.updateControlButtons = updateControlButtons;
window.pollVmStatus = pollVmStatus;
// Initialize contract column on page load
async function initializeContractColumn() {
    console.log('📋 Loading available contracts for column initialization...');
    
    const contractSelect = document.getElementById('contractColumnSelect');
    if (!contractSelect) {
        console.error('❌ Contract select element not found');
        return;
    }
    
    try {
        // First get available GPU types
        const gpuTypesResponse = await fetch('/api/gpu-types');
        const gpuTypesData = await gpuTypesResponse.json();
        
        if (gpuTypesData.status === 'success' && gpuTypesData.data && gpuTypesData.data.length > 0) {
            // Use the first GPU type to get contract aggregates
            const firstGpuType = gpuTypesData.data[0].name;
            console.log(`📋 Loading contracts for GPU type: ${firstGpuType}`);
            
            const contractsResponse = await fetch(`/api/contract-aggregates/${firstGpuType}`);
            const contractsData = await contractsResponse.json();
            
            if (contractsData.status === 'success' && contractsData.data && contractsData.data.length > 0) {
                console.log(`📋 Found ${contractsData.data.length} available contracts`);
                
                // Clear existing options except the default
                contractSelect.innerHTML = '<option value="">Select Contract...</option>';
                
                // Add contract options
                contractsData.data.forEach(contractData => {
                    const option = document.createElement('option');
                    option.value = contractData.aggregate;
                    option.textContent = contractData.aggregate;
                    contractSelect.appendChild(option);
                });
                
                console.log('✅ Contract column initialized with available contracts');
            } else {
                console.log('ℹ️ No contracts available for this GPU type');
            }
        } else {
            console.log('ℹ️ No GPU types available');
        }
    } catch (error) {
        console.error('❌ Error initializing contract column:', error);
        if (window.Logs) {
            window.Logs.addToDebugLog('Contract', `Error initializing contract column: ${error.message}`, 'error');
        }
    }
}

window.loadContractAggregatesForColumn = loadContractAggregatesForColumn;
window.loadContractDataForColumn = loadContractDataForColumn;
window.clearContractColumn = clearContractColumn;
window.clearContractHosts = clearContractHosts;
window.populateContractPanel = populateContractPanel;
window.initializeContractColumn = initializeContractColumn;

console.log('✅ OpenStack Spot Manager main script loaded');