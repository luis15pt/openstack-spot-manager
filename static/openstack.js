// OpenStack operations for OpenStack Spot Manager
// Handles host migrations, aggregate operations, and VM management

// Execute host migration between aggregates
function executeHostMigration(hostname, sourceAggregate, targetAggregate, operation) {
    return new Promise((resolve, reject) => {
        console.log(`🔄 Starting host migration: ${hostname} from ${sourceAggregate} to ${targetAggregate} (${operation})`);
        window.Logs.addToDebugLog('OpenStack', `Starting ${operation} operation for ${hostname}`, 'info', hostname);
        
        const endpoint = operation === 'remove' ? '/api/execute-migration' : '/api/execute-migration';
        
        window.Utils.fetchWithTimeout(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                hostname: hostname,
                source_aggregate: sourceAggregate,
                target_aggregate: targetAggregate,
                operation: operation
            })
        }, 45000) // 45 second timeout for migration operations
        .then(window.Utils.checkResponse)
        .then(response => response.json())
        .then(data => {
            console.log(`📊 Migration ${operation} result for ${hostname}:`, data);
            
            if (data.success) {
                console.log(`✅ Migration ${operation} successful for ${hostname}`);
                window.Logs.addToDebugLog('OpenStack', `${operation} operation completed successfully`, 'success', hostname);
                resolve(data);
            } else {
                console.error(`❌ Migration ${operation} failed for ${hostname}:`, data.error);
                window.Logs.addToDebugLog('OpenStack', `${operation} operation failed: ${data.error}`, 'error', hostname);
                reject(new Error(data.error || `Migration ${operation} failed`));
            }
        })
        .catch(error => {
            console.error(`💥 Exception during migration ${operation} for ${hostname}:`, error);
            window.Logs.addToDebugLog('OpenStack', `Network error during ${operation}: ${error.message}`, 'error', hostname);
            reject(error);
        });
    });
}

// Load aggregate data for a specific GPU type
function loadAggregateData(gpuType, isBackgroundLoad = false) {
    console.log(`📊 Loading aggregate data for ${gpuType} (background: ${isBackgroundLoad})`);
    window.Logs.addToDebugLog('OpenStack', `Loading aggregate data for ${gpuType}`, 'info');
    
    if (!isBackgroundLoad) {
        window.Frontend.showLoading(true, `Loading ${gpuType} aggregate data...`, 'Discovering aggregates...', 10);
    }
    
    return window.Utils.fetchWithTimeout(`/api/aggregates/${gpuType}`, {}, 30000)
        .then(window.Utils.checkResponse)
        .then(response => {
            if (!isBackgroundLoad) {
                window.Frontend.updateLoadingProgress('Fetching host information...', 30);
            }
            return response.json();
        })
        .then(data => {
            if (data.error) {
                if (!isBackgroundLoad) {
                    window.Frontend.showNotification(data.error, 'danger');
                    window.Frontend.showLoading(false);
                }
                window.Logs.addToDebugLog('OpenStack', `Error loading aggregate data: ${data.error}`, 'error');
                throw new Error(data.error);
            }
            
            if (!isBackgroundLoad) {
                window.Frontend.updateLoadingProgress('Processing host data...', 60);
            }
            
            console.log(`✅ Loaded ${gpuType} aggregate data:`, data);
            window.Logs.addToDebugLog('OpenStack', `Successfully loaded aggregate data for ${gpuType}`, 'success');
            
            // Cache the data
            window.Frontend.aggregateData = data;
            
            if (!isBackgroundLoad) {
                window.Frontend.updateLoadingProgress('Rendering interface...', 90);
                window.Frontend.renderAggregateData(data);
                window.Frontend.updateLoadingProgress('Complete!', 100);
                
                setTimeout(() => {
                    window.Frontend.showLoading(false);
                    window.Frontend.showMainContent();
                }, 500);
            }
            
            return data;
        })
        .catch(error => {
            console.error(`❌ Error loading aggregate data for ${gpuType}:`, error);
            window.Logs.addToDebugLog('OpenStack', `Failed to load aggregate data: ${error.message}`, 'error');
            
            if (!isBackgroundLoad) {
                window.Frontend.showNotification(`Failed to load ${gpuType} data: ${error.message}`, 'danger');
                window.Frontend.showLoading(false);
            }
            
            throw error;
        });
}

// Get GPU types from the backend
function loadGpuTypes() {
    console.log('📊 Loading available GPU types');
    window.Logs.addToDebugLog('OpenStack', 'Loading available GPU types', 'info');
    
    window.Utils.fetchWithTimeout('/api/gpu-types', {}, 10000)
        .then(window.Utils.checkResponse)
        .then(response => response.json())
        .then(data => {
            console.log('✅ Available GPU types:', data.gpu_types);
            window.Logs.addToDebugLog('OpenStack', `Found ${data.gpu_types.length} GPU types`, 'success');
            
            const select = document.getElementById('gpuTypeSelect');
            // Clear existing options except the default
            select.innerHTML = '<option value="">Select GPU Type...</option>';
            
            // Store available GPU types for background loading
            window.Frontend.availableGpuTypes = data.gpu_types;
            
            // Add discovered GPU types
            data.gpu_types.forEach(gpuType => {
                const option = document.createElement('option');
                option.value = gpuType;
                option.textContent = gpuType;
                select.appendChild(option);
            });
            
            // Show preload button if there are types to preload
            if (data.gpu_types.length > 1) {
                document.getElementById('preloadAllBtn').style.display = 'inline-block';
            }
            
            window.Frontend.updateGpuTypeSelector();
        })
        .catch(error => {
            console.error('❌ Error loading GPU types:', error);
            window.Logs.addToDebugLog('OpenStack', `Error loading GPU types: ${error.message}`, 'error');
            window.Frontend.showNotification('Failed to load GPU types', 'error');
        });
}

// Preview migration before execution
function previewMigration(hostname, sourceType, targetType) {
    console.log(`📋 Previewing migration: ${hostname} from ${sourceType} to ${targetType}`);
    window.Logs.addToDebugLog('OpenStack', `Previewing migration for ${hostname}`, 'info', hostname);
    
    // Get source aggregate from card
    const sourceCard = document.querySelector(`[data-host="${hostname}"]`);
    let sourceAggregate = '';
    if (sourceCard) {
        const aggregateHeader = sourceCard.closest('.card').querySelector('.card-header');
        if (aggregateHeader) {
            const aggregateSpan = aggregateHeader.querySelector('span');
            if (aggregateSpan) {
                sourceAggregate = aggregateSpan.textContent.trim();
            }
        }
    }
    
    // Get target aggregate name from the new three-column structure
    let targetAggregate = '';
    if (targetType === 'ondemand' && window.Frontend.aggregateData.ondemand.name) {
        targetAggregate = window.Frontend.aggregateData.ondemand.name;
    } else if (targetType === 'runpod' && window.Frontend.aggregateData.runpod.name) {
        targetAggregate = window.Frontend.aggregateData.runpod.name;
    } else if (targetType === 'spot' && window.Frontend.aggregateData.spot.name) {
        targetAggregate = window.Frontend.aggregateData.spot.name;
    }
    
    window.Utils.fetchWithTimeout('/api/preview-migration', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            host: hostname,
            source_aggregate: sourceAggregate,
            target_aggregate: targetAggregate
        })
    }, 15000)
    .then(window.Utils.checkResponse)
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            window.Frontend.showNotification(data.error, 'danger');
            window.Logs.addToDebugLog('OpenStack', `Migration preview failed: ${data.error}`, 'error', hostname);
            return;
        }
        
        console.log(`✅ Migration preview successful for ${hostname}:`, data);
        window.Logs.addToDebugLog('OpenStack', `Migration preview successful`, 'success', hostname);
        
        window.Frontend.showMigrationModal(data, sourceType === 'spot');
    })
    .catch(error => {
        console.error(`❌ Error previewing migration for ${hostname}:`, error);
        window.Logs.addToDebugLog('OpenStack', `Migration preview error: ${error.message}`, 'error', hostname);
        window.Frontend.showNotification(`Error previewing migration: ${error.message}`, 'danger');
    });
}

// Get VM details for a specific host
function getHostVmDetails(hostname) {
    console.log(`📋 Getting VM details for ${hostname}`);
    window.Logs.addToDebugLog('OpenStack', `Getting VM details for ${hostname}`, 'info', hostname);
    
    return window.Utils.fetchWithTimeout(`/api/host-vms/${hostname}`, {}, 15000)
        .then(window.Utils.checkResponse)
        .then(response => response.json())
        .then(data => {
            console.log(`✅ VM details retrieved for ${hostname}:`, data);
            window.Logs.addToDebugLog('OpenStack', `Retrieved VM details for ${hostname}`, 'success', hostname);
            return data;
        })
        .catch(error => {
            console.error(`❌ Error getting VM details for ${hostname}:`, error);
            window.Logs.addToDebugLog('OpenStack', `Error getting VM details: ${error.message}`, 'error', hostname);
            throw error;
        });
}

// Generate commands for host migration operations
function generateMigrationCommands(operation) {
    const commands = [];
    
    // 1. Remove from source aggregate
    commands.push({
        type: 'aggregate-remove',
        hostname: operation.hostname,
        parent_operation: 'migration',
        title: `Remove ${operation.hostname} from ${operation.sourceAggregate}`,
        description: `Removes the compute host from the source aggregate to prepare for migration`,
        command: `nova aggregate-remove-host ${operation.sourceAggregate} ${operation.hostname}`,
        verification_commands: [
            `nova aggregate-show ${operation.sourceAggregate}`,
            `nova hypervisor-show ${operation.hostname}`
        ],
        estimated_duration: '30s',
        dependencies: [],
        timestamp: new Date().toISOString()
    });
    
    // 2. Wait for propagation
    commands.push({
        type: 'wait-command',
        hostname: operation.hostname,
        parent_operation: 'migration',
        title: 'Wait for aggregate membership propagation',
        description: 'Allows OpenStack services to recognize the host removal before adding to new aggregate',
        command: `sleep 60  # Wait for OpenStack aggregate membership to propagate`,
        verification_commands: [
            'nova service-list',
            'nova aggregate-list'
        ],
        estimated_duration: '60s',
        dependencies: ['aggregate-remove'],
        timestamp: new Date().toISOString()
    });
    
    // 3. Add to target aggregate
    commands.push({
        type: 'aggregate-add',
        hostname: operation.hostname,
        parent_operation: 'migration',
        title: `Add ${operation.hostname} to ${operation.targetAggregate}`,
        description: `Adds the compute host to the target aggregate to complete the migration`,
        command: `nova aggregate-add-host ${operation.targetAggregate} ${operation.hostname}`,
        verification_commands: [
            `nova aggregate-show ${operation.targetAggregate}`,
            `nova hypervisor-show ${operation.hostname}`
        ],
        estimated_duration: '30s',
        dependencies: ['wait-command'],
        timestamp: new Date().toISOString()
    });
    
    return commands;
}

// Export OpenStack functions
window.OpenStack = {
    executeHostMigration,
    loadAggregateData,
    loadGpuTypes,
    previewMigration,
    getHostVmDetails,
    generateMigrationCommands
};