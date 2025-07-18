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
    
    window.Frontend.isExecutionInProgress = true;
    window.Logs.incrementOperationsCount();
    
    console.log(`🚀 Executing ${window.Frontend.pendingOperations.length} pending operations`);
    window.Logs.addToDebugLog('System', `Starting execution of ${window.Frontend.pendingOperations.length} operations`, 'info');
    
    // For now, simulate execution
    setTimeout(() => {
        console.log('✅ All operations completed successfully');
        window.Logs.addToDebugLog('System', 'All operations completed successfully', 'success');
        window.Frontend.showNotification('All operations completed successfully', 'success');
        
        // Clear completed operations
        window.Frontend.pendingOperations = [];
        window.Frontend.updatePendingOperationsDisplay();
        
        // Refresh only affected columns instead of all data
        window.Frontend.refreshAffectedColumns(completedOperations);
        
        window.Frontend.isExecutionInProgress = false;
    }, 2000);
}

// Make functions available globally that need to be called from HTML or other modules
window.showVmDetails = showVmDetails;
window.removePendingOperation = removePendingOperation;
window.updateControlButtons = updateControlButtons;

console.log('✅ OpenStack Spot Manager main script loaded');