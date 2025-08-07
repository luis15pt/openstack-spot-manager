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
    
    // Check cache first
    if (window.gpuDataCache && window.gpuDataCache.has(gpuType)) {
        console.log(`✅ Loading ${gpuType} from cache`);
        if (!isBackgroundLoad) {
            const cachedData = window.gpuDataCache.get(gpuType);
            console.log(`🔍 DEBUG: Cached data for ${gpuType}:`, {
                gpu_type: cachedData.gpu_type,
                spot: cachedData.spot?.name,
                ondemand: cachedData.ondemand?.name,
                runpod: cachedData.runpod?.name
            });
            window.Frontend.aggregateData = cachedData;
            window.Frontend.renderAggregateData(cachedData);
            window.Frontend.showMainContent();
            
            // Start background loading after first successful load
            if (!window.backgroundLoadingStarted) {
                window.startBackgroundLoading(gpuType);
            }
        }
        return Promise.resolve(window.gpuDataCache.get(gpuType));
    }
    
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
            console.log(`🔍 DEBUG: Fresh API data for ${gpuType}:`, {
                gpu_type: data.gpu_type,
                spot: data.spot?.name,
                ondemand: data.ondemand?.name,
                runpod: data.runpod?.name
            });
            window.Logs.addToDebugLog('OpenStack', `Successfully loaded aggregate data for ${gpuType}`, 'success');
            
            // Cache the data
            if (window.gpuDataCache) {
                window.gpuDataCache.set(gpuType, data);
                console.log(`📦 Cached data for ${gpuType}`);
            }
            window.Frontend.aggregateData = data;
            
            if (!isBackgroundLoad) {
                window.Frontend.updateLoadingProgress('Rendering interface...', 90);
                window.Frontend.renderAggregateData(data);
                window.Frontend.updateLoadingProgress('Complete!', 100);
                
                setTimeout(() => {
                    window.Frontend.showLoading(false);
                    window.Frontend.showMainContent();
                    
                    // Start background loading after first successful load
                    if (!window.backgroundLoadingStarted) {
                        window.startBackgroundLoading(gpuType);
                    }
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
    
    // Check if required dependencies are available
    if (!window.Utils) {
        console.error('❌ Utils module not available for loadGpuTypes');
        return;
    }
    if (!window.Logs) {
        console.error('❌ Logs module not available for loadGpuTypes');
        return;
    }
    
    window.Logs.addToDebugLog('OpenStack', 'Loading available GPU types', 'info');
    
    console.log('🌐 Making API call to /api/gpu-types...');
    window.Utils.fetchWithTimeout('/api/gpu-types', {}, 20000)
        .then(window.Utils.checkResponse)
        .then(response => response.json())
        .then(data => {
            console.log('✅ GPU types API response:', data);
            
            if (!data || !data.gpu_types) {
                console.error('❌ Invalid response from /api/gpu-types:', data);
                window.Logs.addToDebugLog('OpenStack', 'Invalid response from gpu-types API', 'error');
                return;
            }
            
            console.log('✅ Available GPU types:', data.gpu_types);
            window.Logs.addToDebugLog('OpenStack', `Found ${data.gpu_types.length} GPU types`, 'success');
            
            const select = document.getElementById('gpuTypeSelect');
            if (!select) {
                console.error('❌ GPU type select element not found!');
                window.Logs.addToDebugLog('OpenStack', 'GPU type select element not found', 'error');
                return;
            }
            
            console.log('🧹 Clearing existing options...');
            // Clear existing options except the default
            select.innerHTML = '<option value="">Select GPU Type...</option>';
            
            console.log('💾 Storing GPU types for background loading...');
            // Store available GPU types for background loading
            if (!window.Frontend) {
                console.warn('⚠️ Frontend module not yet available, deferring GPU types storage...');
                // Try again after a short delay to allow frontend.js to fully load
                setTimeout(() => {
                    if (window.Frontend) {
                        window.Frontend.availableGpuTypes = data.gpu_types;
                        console.log('✅ GPU types stored after frontend module loaded');
                    }
                }, 100);
            } else {
                window.Frontend.availableGpuTypes = data.gpu_types;
            }
            
            // Add discovered GPU types
            console.log(`🎯 Adding ${data.gpu_types.length} GPU types to selector...`);
            data.gpu_types.forEach((gpuType, index) => {
                console.log(`  Adding option ${index + 1}: ${gpuType}`);
                const option = document.createElement('option');
                option.value = gpuType;
                option.textContent = gpuType;
                select.appendChild(option);
            });
            
            console.log(`📊 Total options in select: ${select.options.length}`);
            
            // Show preload button if there are types to preload
            if (data.gpu_types.length > 1) {
                console.log('👀 Showing preload button...');
                const preloadBtn = document.getElementById('preloadAllBtn');
                if (preloadBtn) {
                    preloadBtn.style.display = 'inline-block';
                } else {
                    console.warn('⚠️ Preload button not found');
                }
            }
            
            // Auto-select GPU type from URL if specified
            if (window.urlGpuType && data.gpu_types.includes(window.urlGpuType)) {
                console.log(`🎯 Auto-selecting GPU type from URL: ${window.urlGpuType}`);
                select.value = window.urlGpuType;
                window.currentGpuType = window.urlGpuType;
                
                // Trigger the change event to load the data
                const event = new Event('change');
                select.dispatchEvent(event);
                
                window.Logs.addToDebugLog('OpenStack', `Auto-selected and loaded: ${window.urlGpuType}`, 'success');
                delete window.urlGpuType; // Clean up
            }
            
            console.log('✅ GPU types loaded successfully');
            
            // Update System Info tab
            updateSystemInfo({
                gpuTypes: data.gpu_types,
                aggregates: data.aggregates
            });
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

// Execute OpenStack network commands using SDK
function executeNetworkCommand(command) {
    return new Promise((resolve, reject) => {
        console.log(`🌐 Executing OpenStack network command: ${command}`);
        window.Logs.addToDebugLog('OpenStack', `Executing network command: ${command}`, 'info');
        
        // Parse command to determine operation
        if (command.includes('server list --all-projects --name')) {
            // Extract server name from command: openstack server list --all-projects --name "server_name"
            const nameMatch = command.match(/--name\s+[\"']?([^\"'\s]+)[\"']?/);
            const serverName = nameMatch ? nameMatch[1] : null;
            
            if (!serverName) {
                reject(new Error('Could not parse server name from command'));
                return;
            }
            
            // Call backend to get server UUID via SDK
            window.Utils.fetchWithTimeout('/api/openstack/server/get-uuid', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ server_name: serverName })
            }, 30000)
            .then(window.Utils.checkResponse)
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    resolve(data.server_uuid);
                } else {
                    reject(new Error(data.error || 'Server UUID lookup failed'));
                }
            })
            .catch(error => reject(error));
            
        } else if (command.includes('network show')) {
            // Extract network name from command
            const networkMatch = command.match(/network show ["\']?([^"'\s]+)["\']?/);
            const networkName = networkMatch ? networkMatch[1] : null;
            
            if (!networkName) {
                reject(new Error('Could not parse network name from command'));
                return;
            }
            
            // Call backend to find network via SDK
            window.Utils.fetchWithTimeout('/api/openstack/network/show', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ network_name: networkName })
            }, 30000)
            .then(window.Utils.checkResponse)
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    resolve(data.network_id);
                } else {
                    reject(new Error(data.error || 'Network lookup failed'));
                }
            })
            .catch(error => reject(error));
            
        } else if (command.includes('port create')) {
            // Extract port details from command
            const networkMatch = command.match(/--network ["\']?([^"'\s]+)["\']?/);
            const nameMatch = command.match(/--name ["\']?([^"'\s]+)["\']?/);
            
            const networkName = networkMatch ? networkMatch[1] : null;
            const portName = nameMatch ? nameMatch[1] : null;
            
            if (!networkName || !portName) {
                reject(new Error('Could not parse network name or port name from command'));
                return;
            }
            
            // Call backend to create port via SDK
            window.Utils.fetchWithTimeout('/api/openstack/port/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    network_name: networkName,
                    port_name: portName
                })
            }, 30000)
            .then(window.Utils.checkResponse)
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    resolve(data.port_id);
                } else {
                    reject(new Error(data.error || 'Port creation failed'));
                }
            })
            .catch(error => reject(error));
            
        } else if (command.includes('server add network')) {
            // Extract server and network from command: openstack server add network <server_name> <network_name>
            const parts = command.split(' ');
            const addIndex = parts.indexOf('add');
            const networkKeywordIndex = parts.indexOf('network');
            
            if (addIndex === -1 || networkKeywordIndex === -1 || networkKeywordIndex + 2 >= parts.length) {
                reject(new Error('Could not parse server or network from command'));
                return;
            }
            
            const serverName = parts[networkKeywordIndex + 1];  // First argument after 'network'
            const networkName = parts[networkKeywordIndex + 2]; // Second argument after 'network'
            
            // Call backend to attach network via SDK
            window.Utils.fetchWithTimeout('/api/openstack/server/add-network', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    server_name: serverName,
                    network_name: networkName
                })
            }, 30000)
            .then(window.Utils.checkResponse)
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    resolve('Network attached successfully');
                } else {
                    reject(new Error(data.error || 'Network attachment failed'));
                }
            })
            .catch(error => reject(error));
            
        } else {
            reject(new Error(`Unsupported OpenStack command: ${command}`));
        }
    });
}

// Update System Info tab with parallel data statistics
function updateSystemInfo(data) {
    const gpuTypesStatus = document.getElementById('gpuTypesStatus');
    const parallelDataStatus = document.getElementById('parallelDataStatus');
    const systemCacheStatus = document.getElementById('systemCacheStatus');
    const parallelStats = document.getElementById('parallelStats');
    const cacheStats = document.getElementById('cacheStats');
    const lastUpdateTime = document.getElementById('lastUpdateTime');
    
    if (data && data.gpuTypes) {
        // Update GPU Types status
        if (gpuTypesStatus) {
            gpuTypesStatus.innerHTML = `<i class="fas fa-check-circle text-success"></i> ${data.gpuTypes.length} types loaded`;
        }
        
        // Update parallel data status
        if (parallelDataStatus) {
            parallelDataStatus.innerHTML = `<i class="fas fa-check-circle text-success"></i> Collection complete`;
        }
        
        // Update cache status
        if (systemCacheStatus) {
            systemCacheStatus.innerHTML = `<i class="fas fa-database text-success"></i> Active`;
        }
        
        // Update parallel stats
        if (parallelStats && data.aggregates) {
            const aggCount = Object.keys(data.aggregates).length;
            parallelStats.textContent = `⚡ Parallel: 0 hosts, ${aggCount} aggs, ${data.gpuTypes.length} types`;
        }
        
        // Update last update time
        if (lastUpdateTime) {
            lastUpdateTime.textContent = new Date().toLocaleTimeString();
        }
    }
}

// Export OpenStack module
console.log('OpenStack module loaded');

// Export OpenStack functions
window.OpenStack = {
    executeHostMigration,
    loadAggregateData,
    loadGpuTypes,
    previewMigration,
    getHostVmDetails,
    generateMigrationCommands,
    executeNetworkCommand
};