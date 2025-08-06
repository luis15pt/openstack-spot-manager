# Frontend Documentation - OpenStack Spot Manager

This document provides comprehensive documentation for the frontend JavaScript modules and user interface components of the OpenStack Spot Manager.

## Frontend Architecture Overview

The frontend follows a modular JavaScript architecture with clear separation of concerns, using a global namespace pattern for module communication and event-driven interactions.

```
Frontend Architecture
├── script.js          # Main coordinator and event handling
├── frontend.js        # UI rendering and visual feedback
├── openstack.js       # OpenStack API operations
├── hyperstack.js      # Hyperstack API operations  
├── logs.js           # Logging and analytics system
└── utils.js          # Common utilities and helpers
```

## Module Documentation

### 1. Main Application Controller (script.js)

The primary application coordinator responsible for initialization, event management, and orchestrating interactions between modules.

#### Key Responsibilities
- **Application initialization** and module loading
- **Event listener setup** for user interactions
- **Background data loading** with intelligent caching
- **GPU data management** with 5-minute cache expiration
- **Contract column functionality** for aggregate management

#### Core Functions

**Application Initialization:**
```javascript
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Initializing OpenStack Spot Manager');
    
    // Module availability check
    checkModuleAvailability();
    
    // Initialize event listeners
    initializeEventListeners();
    
    // Show main content (contract column always visible)
    showMainContent();
    
    // Initialize contract column
    initializeContractColumn();
    
    // Load GPU types
    window.OpenStack.loadGpuTypes();
});
```

**Event Listener Management:**
```javascript
function initializeEventListeners() {
    // GPU type selector
    document.getElementById('gpuTypeSelect').addEventListener('change', handleGpuTypeChange);
    
    // Contract column selector  
    document.getElementById('contractColumnSelect').addEventListener('change', handleContractSelection);
    
    // Migration control buttons
    document.getElementById('moveToOndemandBtn').addEventListener('click', () => moveSelectedHosts('ondemand'));
    document.getElementById('moveToRunpodBtn').addEventListener('click', () => moveSelectedHosts('runpod'));
    document.getElementById('moveToSpotBtn').addEventListener('click', () => moveSelectedHosts('spot'));
    
    // Refresh operations
    setupRefreshButtonListeners();
}
```

**Background Data Loading:**
```javascript
// Cache management with 5-minute expiration
window.gpuDataCache = new Map();
const CACHE_EXPIRY = 5 * 60 * 1000; // 5 minutes

function isDataCached(gpuType) {
    const cached = window.gpuDataCache.get(gpuType);
    if (!cached) return false;
    
    const age = Date.now() - cached.timestamp;
    return age < CACHE_EXPIRY;
}

async function startBackgroundLoading(currentGpuType) {
    if (window.backgroundLoadingStarted) return;
    window.backgroundLoadingStarted = true;
    
    const availableTypes = getAvailableGpuTypes();
    const otherTypes = availableTypes.filter(type => type !== currentGpuType);
    
    // Stagger background loading
    otherTypes.forEach((gpuType, index) => {
        setTimeout(() => {
            console.log(`🔄 Background loading: ${gpuType}`);
            window.OpenStack.loadAggregateData(gpuType, true);
        }, (index + 1) * 2000);
    });
}
```

**Contract Column Management:**
```javascript
async function initializeContractColumn() {
    const contractSelect = document.getElementById('contractColumnSelect');
    
    try {
        // Get available GPU types first
        const gpuTypesResponse = await fetch('/api/gpu-types');
        const gpuTypesData = await gpuTypesResponse.json();
        
        if (gpuTypesData.status === 'success' && gpuTypesData.data.length > 0) {
            const firstGpuType = gpuTypesData.data[0].name;
            
            // Load contracts for first GPU type
            const contractsResponse = await fetch(`/api/contract-aggregates/${firstGpuType}`);
            const contractsData = await contractsResponse.json();
            
            // Populate dropdown
            populateContractDropdown(contractsData.data);
        }
    } catch (error) {
        console.error('❌ Error initializing contract column:', error);
    }
}
```

### 2. UI Rendering Engine (frontend.js)

Handles all UI rendering, DOM manipulation, and visual feedback for the application.

#### Key Responsibilities
- **Dynamic column rendering** with adaptive layouts
- **Host card generation** with drag-and-drop support
- **Collapsible group organization** (Available/In-Use)
- **Real-time visual feedback** and loading states
- **Modal management** for detailed operations

#### Core Rendering Functions

**Dynamic Column System:**
```javascript
function renderAggregateData(data) {
    // Clean up existing variant columns
    cleanupVariantColumns();
    
    // Update column headers and counts
    updateColumnHeaders(data);
    
    // Render On-Demand variants as separate columns if NVLink exists
    if (data.ondemand.hosts) {
        renderOnDemandVariantColumns(data.ondemand);
    }
    
    // Render other column types
    if (data.runpod.hosts) {
        renderHosts('runpodHosts', data.runpod.hosts, 'runpod', data.runpod.name);
    }
    if (data.spot.hosts) {
        renderHosts('spotHosts', data.spot.hosts, 'spot', data.spot.name);
    }
    
    // Setup drag and drop
    setupDragAndDrop();
}
```

**Host Card Rendering:**
```javascript
function renderHosts(containerId, hosts, type, aggregateName = null, variants = null) {
    const container = document.getElementById(containerId);
    
    if (hosts.length === 0) {
        renderEmptyState(container, type);
        return;
    }
    
    // Group hosts by availability status
    const availableHosts = hosts.filter(host => !host.has_vms);
    const inUseHosts = hosts.filter(host => host.has_vms);
    
    // Render grouped hosts
    container.innerHTML = '';
    
    if (availableHosts.length > 0) {
        renderHostGroup(container, 'Available', availableHosts, type, true);
    }
    
    if (inUseHosts.length > 0) {
        renderHostGroup(container, 'In Use', inUseHosts, type, false);
    }
}
```

**Host Group Rendering:**
```javascript
function renderHostGroup(container, title, hosts, type, isCollapsed = true) {
    const groupDiv = document.createElement('div');
    groupDiv.className = 'host-group mb-3';
    
    // Group header with toggle
    const headerDiv = document.createElement('div');
    headerDiv.className = 'host-group-header';
    headerDiv.innerHTML = `
        <div class="d-flex justify-content-between align-items-center">
            <strong>${title} (${hosts.length})</strong>
            <i class="fas fa-chevron-${isCollapsed ? 'right' : 'down'} toggle-icon"></i>
        </div>
    `;
    
    // Host cards container
    const contentDiv = document.createElement('div');
    contentDiv.className = `host-group-content ${isCollapsed ? '' : 'show'}`;
    
    // Render individual host cards
    hosts.forEach(host => {
        const hostCard = createHostCard(host, type);
        contentDiv.appendChild(hostCard);
    });
    
    // Toggle functionality
    headerDiv.addEventListener('click', () => toggleHostGroup(contentDiv, headerDiv.querySelector('.toggle-icon')));
    
    groupDiv.appendChild(headerDiv);
    groupDiv.appendChild(contentDiv);
    container.appendChild(groupDiv);
}
```

**Host Card Creation:**
```javascript
function createHostCard(host, type) {
    const card = document.createElement('div');
    card.className = 'machine-card';
    card.setAttribute('data-hostname', host.hostname);
    card.setAttribute('data-type', type);
    card.draggable = true;
    
    // Determine card styling based on status
    const statusClass = host.has_vms ? 'in-use' : 'available';
    const gpuUtilization = host.gpu_capacity > 0 ? (host.gpu_used / host.gpu_capacity) * 100 : 0;
    
    card.innerHTML = `
        <div class="card-header ${statusClass}">
            <div class="d-flex justify-content-between align-items-center">
                <h6 class="mb-0">${host.hostname}</h6>
                <span class="status-badge ${statusClass}">${host.has_vms ? 'In Use' : 'Available'}</span>
            </div>
        </div>
        <div class="card-body">
            <div class="gpu-info mb-2">
                <small class="text-muted">GPU Usage:</small>
                <div class="progress" style="height: 6px;">
                    <div class="progress-bar ${getProgressBarClass(gpuUtilization)}" 
                         style="width: ${gpuUtilization}%"></div>
                </div>
                <small>${host.gpu_used}/${host.gpu_capacity} GPUs (${Math.round(gpuUtilization)}%)</small>
            </div>
            
            ${host.has_vms ? `
                <div class="vm-info">
                    <small class="text-muted">VMs: ${host.vm_count}</small>
                    <button class="btn btn-sm btn-outline-info ms-2" onclick="showVmDetails('${host.hostname}')">
                        <i class="fas fa-info-circle"></i> Details
                    </button>
                </div>
            ` : ''}
            
            ${host.tenant ? `
                <div class="tenant-info mt-2">
                    <small class="text-muted">Owner: ${host.owner_group || host.tenant}</small>
                </div>
            ` : ''}
        </div>
    `;
    
    // Add drag event listeners
    setupCardDragEvents(card);
    
    return card;
}
```

#### Loading States and Visual Feedback

**Loading Management:**
```javascript
function showLoading(show, message = 'Loading...', step = 'Initializing...', progress = 0) {
    const loadingIndicator = document.getElementById('loadingIndicator');
    const mainContent = document.getElementById('mainContent');
    
    if (show) {
        loadingIndicator.classList.remove('d-none');
        // ALWAYS keep main content visible so contract column stays visible
        mainContent.classList.remove('d-none');
        
        // Update loading message and progress
        updateLoadingProgress(step, progress);
        document.getElementById('loadingMessage').textContent = message;
    } else {
        loadingIndicator.classList.add('d-none');
        mainContent.classList.remove('d-none');
    }
}

function updateLoadingProgress(step, progress) {
    const progressBar = document.getElementById('loadingProgress');
    const stepElement = document.getElementById('loadingStep');
    
    if (progressBar) progressBar.style.width = `${progress}%`;
    if (stepElement) stepElement.textContent = step;
}
```

### 3. OpenStack Integration Module (openstack.js)

Manages all OpenStack API operations, data loading, and migration workflows.

#### Key Responsibilities
- **Aggregate data loading** with caching and background refresh
- **Host migration operations** between resource pools
- **GPU type discovery** and management
- **VM information retrieval** and monitoring

#### Core API Operations

**GPU Type Loading:**
```javascript
async function loadGpuTypes() {
    try {
        console.log('📋 Loading GPU types from OpenStack...');
        
        const response = await window.Utils.fetchWithTimeout('/api/gpu-types', {}, 15000);
        const data = await response.json();
        
        if (data.status === 'success') {
            populateGpuTypeSelector(data.data);
            console.log(`✅ Loaded ${data.data.length} GPU types`);
        } else {
            console.error('❌ Failed to load GPU types:', data.error);
        }
    } catch (error) {
        console.error('❌ Error loading GPU types:', error);
        showNotification('Failed to load GPU types', 'error');
    }
}
```

**Aggregate Data Loading:**
```javascript
async function loadAggregateData(gpuType, isBackgroundLoad = false) {
    console.log(`📊 Loading aggregate data for GPU type: ${gpuType} (background: ${isBackgroundLoad})`);
    
    // Check cache first
    if (window.gpuDataCache.has(gpuType)) {
        const cachedData = window.gpuDataCache.get(gpuType);
        const age = Date.now() - cachedData.timestamp;
        
        if (age < CACHE_EXPIRY) {
            console.log(`⚡ Using cached data for ${gpuType} (age: ${Math.round(age/1000)}s)`);
            window.Frontend.renderAggregateData(cachedData.data);
            window.Frontend.showMainContent();
            return Promise.resolve(cachedData.data);
        }
    }
    
    // Show loading for foreground requests
    if (!isBackgroundLoad) {
        window.Frontend.showLoading(true, `Loading ${gpuType} aggregate data...`, 'Discovering aggregates...', 10);
    }
    
    try {
        const response = await window.Utils.fetchWithTimeout(`/api/aggregates/${gpuType}`, {}, 30000);
        const data = await response.json();
        
        if (data.status === 'success') {
            // Cache the data
            window.gpuDataCache.set(gpuType, {
                data: data.data,
                timestamp: Date.now()
            });
            
            // Update UI if not background load
            if (!isBackgroundLoad) {
                window.Frontend.renderAggregateData(data.data);
                window.Frontend.showMainContent();
            }
            
            console.log(`✅ Successfully loaded data for ${gpuType}`);
            return data.data;
        } else {
            throw new Error(data.error || 'Unknown error loading aggregate data');
        }
    } catch (error) {
        console.error(`❌ Error loading aggregate data for ${gpuType}:`, error);
        if (!isBackgroundLoad) {
            window.Frontend.showLoading(false);
            showNotification(`Failed to load ${gpuType} data: ${error.message}`, 'error');
        }
    }
}
```

**Migration Operations:**
```javascript
async function executeMigration(host, sourceAggregate, targetAggregate) {
    console.log(`🔄 Executing migration: ${host} from ${sourceAggregate} to ${targetAggregate}`);
    
    try {
        const response = await fetch('/api/execute-migration', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                host: host,
                source_aggregate: sourceAggregate,
                target_aggregate: targetAggregate
            })
        });
        
        const result = await response.json();
        
        if (result.status === 'success') {
            console.log(`✅ Migration successful for ${host}`);
            
            // Update analytics
            window.Analytics.recordOperation('migration', true, Date.now() - startTime);
            
            // Refresh data to reflect changes
            const currentGpuType = window.currentGpuType;
            if (currentGpuType) {
                // Clear cache to force refresh
                window.gpuDataCache.delete(currentGpuType);
                await loadAggregateData(currentGpuType);
            }
            
            return result;
        } else {
            throw new Error(result.error || 'Migration failed');
        }
    } catch (error) {
        console.error(`❌ Migration failed for ${host}:`, error);
        window.Analytics.recordOperation('migration', false, Date.now() - startTime);
        throw error;
    }
}
```

### 4. Hyperstack Integration Module (hyperstack.js)

Handles VM deployment operations and Hyperstack API interactions for RunPod launches.

#### Key Responsibilities
- **Image selection modal** with region filtering
- **VM deployment operations** via Hyperstack API
- **Network configuration** and firewall management
- **Regional deployment** optimization

#### Core Functions

**Image Selection Modal:**
```javascript
function showImageSelectionModal(hostname) {
    console.log(`🖼️ Opening image selection modal for ${hostname}`);
    
    const modal = new bootstrap.Modal(document.getElementById('imageSelectionModal'));
    document.getElementById('imageSelectionHostname').textContent = hostname;
    
    // Store hostname for later use
    window.selectedHostname = hostname;
    
    // Load available images
    loadAvailableImages();
    
    modal.show();
}

async function loadAvailableImages() {
    const loadingDiv = document.getElementById('imageSelectionLoading');
    const contentDiv = document.getElementById('imageSelectionContent');
    
    loadingDiv.style.display = 'block';
    contentDiv.style.display = 'none';
    
    try {
        const response = await fetch('/api/hyperstack/images');
        const data = await response.json();
        
        if (data.status === 'success') {
            populateImageList(data.data);
            setupRegionFiltering(data.data);
            
            loadingDiv.style.display = 'none';
            contentDiv.style.display = 'block';
        } else {
            throw new Error(data.error || 'Failed to load images');
        }
    } catch (error) {
        console.error('❌ Error loading images:', error);
        showImageSelectionError(error.message);
    }
}
```

**VM Launch Operations:**
```javascript
async function executeRunpodLaunch(hostname, imageName, imageId) {
    console.log(`🚀 Executing RunPod launch for ${hostname} with image ${imageName}`);
    
    try {
        const response = await fetch('/api/execute-runpod-launch', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                hostname: hostname,
                image_name: imageName,
                image_id: imageId
            })
        });
        
        const result = await response.json();
        
        if (result.status === 'success') {
            console.log(`✅ RunPod launch successful for ${hostname}`);
            
            // Show success notification
            showNotification(`RunPod VM launched successfully on ${hostname}`, 'success');
            
            // Update pending operations
            removePendingOperation(hostname, 'runpod-launch');
            
            // Refresh host data
            refreshHostData();
            
            return result;
        } else {
            throw new Error(result.error || 'RunPod launch failed');
        }
    } catch (error) {
        console.error(`❌ RunPod launch failed for ${hostname}:`, error);
        showNotification(`RunPod launch failed: ${error.message}`, 'error');
        throw error;
    }
}
```

### 5. Logging and Analytics System (logs.js)

Provides comprehensive logging, debugging, and analytics functionality.

#### Key Responsibilities
- **Operation logging** with detailed audit trails
- **Debug information** collection and display
- **Performance analytics** and metrics
- **Error tracking** and reporting

#### Core Logging Functions

**Debug Logging:**
```javascript
const DebugLogger = {
    addToDebugLog: function(category, message, severity = 'info') {
        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp: timestamp,
            category: category,
            message: message,
            severity: severity
        };
        
        // Add to debug log display
        this.updateDebugDisplay(logEntry);
        
        // Store in local storage for persistence
        this.storeLogEntry(logEntry);
        
        // Console output with appropriate level
        const consoleMethod = severity === 'error' ? 'error' : 
                            severity === 'warn' ? 'warn' : 'log';
        console[consoleMethod](`[${category}] ${message}`);
    },
    
    updateDebugDisplay: function(logEntry) {
        const debugContainer = document.getElementById('debugLogContainer');
        if (!debugContainer) return;
        
        const entryDiv = document.createElement('div');
        entryDiv.className = `debug-entry severity-${logEntry.severity}`;
        entryDiv.innerHTML = `
            <div class="debug-timestamp">${logEntry.timestamp}</div>
            <div class="debug-category">[${logEntry.category}]</div>
            <div class="debug-message">${logEntry.message}</div>
        `;
        
        debugContainer.appendChild(entryDiv);
        debugContainer.scrollTop = debugContainer.scrollHeight;
    }
};
```

**Analytics Tracking:**
```javascript
const Analytics = {
    recordOperation: function(operation, success, duration) {
        const metric = {
            timestamp: new Date().toISOString(),
            operation: operation,
            success: success,
            duration: duration,
            session_id: this.getSessionId()
        };
        
        // Update session statistics
        this.updateSessionStats(metric);
        
        // Store metric
        this.storeMetric(metric);
        
        console.log(`📊 Analytics: ${operation} ${success ? 'succeeded' : 'failed'} in ${duration}ms`);
    },
    
    updateSessionStats: function(metric) {
        const stats = this.getSessionStats();
        
        stats.total_operations++;
        if (metric.success) {
            stats.successful_operations++;
        } else {
            stats.failed_operations++;
        }
        
        stats.total_duration += metric.duration;
        stats.average_duration = stats.total_duration / stats.total_operations;
        
        this.saveSessionStats(stats);
        this.updateStatsDisplay(stats);
    }
};
```

### 6. Utilities Module (utils.js)

Provides common utilities, API helpers, and data transformation functions.

#### Key Responsibilities
- **API request handling** with timeout and error management
- **Data transformation** and validation
- **Common UI helpers** and utilities
- **Response processing** and error handling

#### Core Utility Functions

**API Request Utilities:**
```javascript
const Utils = {
    fetchWithTimeout: async function(url, options = {}, timeout = 10000) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        
        try {
            const response = await fetch(url, {
                ...options,
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            return response;
        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                throw new Error(`Request timeout after ${timeout}ms`);
            }
            throw error;
        }
    },
    
    checkResponse: function(response) {
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return response;
    },
    
    parseJsonResponse: async function(response) {
        try {
            return await response.json();
        } catch (error) {
            throw new Error('Invalid JSON response');
        }
    }
};
```

**Data Transformation:**
```javascript
const DataTransformers = {
    formatHostData: function(rawHost, type) {
        return {
            hostname: rawHost.hostname,
            status: rawHost.status || 'unknown',
            vm_count: rawHost.vm_count || 0,
            gpu_used: rawHost.gpu_used || 0,
            gpu_capacity: rawHost.gpu_capacity || 0,
            has_vms: rawHost.vm_count > 0,
            tenant: rawHost.tenant,
            owner_group: rawHost.owner_group,
            type: type,
            utilization: rawHost.gpu_capacity > 0 ? 
                (rawHost.gpu_used / rawHost.gpu_capacity) * 100 : 0
        };
    },
    
    groupHostsByStatus: function(hosts) {
        return {
            available: hosts.filter(host => !host.has_vms),
            in_use: hosts.filter(host => host.has_vms)
        };
    }
};
```

## User Interface Components

### Drag and Drop System

**Setup and Event Handling:**
```javascript
function setupDragAndDrop() {
    // Enable drag for all host cards
    document.querySelectorAll('.machine-card').forEach(card => {
        card.draggable = true;
        setupCardDragEvents(card);
    });
    
    // Setup drop zones
    document.querySelectorAll('.drop-zone').forEach(zone => {
        setupDropZoneEvents(zone);
    });
}

function setupCardDragEvents(card) {
    card.addEventListener('dragstart', function(e) {
        e.dataTransfer.setData('text/plain', card.dataset.hostname);
        e.dataTransfer.setData('source-type', card.dataset.type);
        card.classList.add('dragging');
    });
    
    card.addEventListener('dragend', function(e) {
        card.classList.remove('dragging');
    });
}

function setupDropZoneEvents(zone) {
    zone.addEventListener('dragover', function(e) {
        e.preventDefault();
        zone.classList.add('drag-over');
    });
    
    zone.addEventListener('dragleave', function(e) {
        zone.classList.remove('drag-over');
    });
    
    zone.addEventListener('drop', function(e) {
        e.preventDefault();
        zone.classList.remove('drag-over');
        
        const hostname = e.dataTransfer.getData('text/plain');
        const sourceType = e.dataTransfer.getData('source-type');
        const targetType = zone.dataset.type;
        
        if (sourceType !== targetType) {
            handleHostDrop(hostname, sourceType, targetType);
        }
    });
}
```

### Modal Management

**VM Details Modal:**
```javascript
async function showVmDetails(hostname) {
    console.log(`🔍 Loading VM details for ${hostname}`);
    
    const modal = new bootstrap.Modal(document.getElementById('vmDetailsModal'));
    const modalBody = document.getElementById('vmDetailsBody');
    
    // Show loading state
    modalBody.innerHTML = '<div class="text-center"><div class="spinner-border" role="status"></div></div>';
    modal.show();
    
    try {
        const response = await fetch(`/api/host-vms/${hostname}`);
        const data = await response.json();
        
        if (data.status === 'success') {
            renderVmDetails(data.data, modalBody);
        } else {
            modalBody.innerHTML = `<div class="alert alert-danger">Error: ${data.error}</div>`;
        }
    } catch (error) {
        console.error('Error loading VM details:', error);
        modalBody.innerHTML = `<div class="alert alert-danger">Failed to load VM details</div>`;
    }
}

function renderVmDetails(vmData, container) {
    if (vmData.vms.length === 0) {
        container.innerHTML = `
            <div class="text-center text-muted">
                <i class="fas fa-server fa-3x mb-3"></i>
                <p>No VMs running on this host</p>
            </div>
        `;
        return;
    }
    
    const vmList = vmData.vms.map(vm => `
        <div class="vm-item border rounded p-3 mb-2">
            <div class="d-flex justify-content-between align-items-start">
                <div>
                    <h6 class="mb-1">${vm.name}</h6>
                    <small class="text-muted">${vm.id}</small>
                </div>
                <span class="badge bg-${vm.status === 'ACTIVE' ? 'success' : 'warning'}">${vm.status}</span>
            </div>
            <div class="mt-2">
                <small><strong>Flavor:</strong> ${vm.flavor}</small><br>
                <small><strong>Tenant:</strong> ${vm.tenant}</small><br>
                <small><strong>Created:</strong> ${new Date(vm.created).toLocaleString()}</small>
            </div>
        </div>
    `).join('');
    
    container.innerHTML = `
        <div class="vm-details">
            <h5>${vmData.hostname} - ${vmData.total_vms} VM(s)</h5>
            <div class="vm-list mt-3">
                ${vmList}
            </div>
        </div>
    `;
}
```

## Performance Optimizations

### Caching Strategy
- **5-minute GPU data cache** with timestamp validation
- **Background preloading** of non-active GPU types
- **NetBox tenant caching** to reduce API calls
- **Progressive loading** with user feedback

### Efficient DOM Updates
- **DocumentFragment** for batch DOM operations
- **Event delegation** for dynamic content
- **Debounced search** and filtering
- **Virtual scrolling** for large datasets (when needed)

### Memory Management
- **Proper event listener cleanup**
- **Cache size limitations**
- **Garbage collection friendly patterns**
- **Resource cleanup on navigation**

This frontend architecture provides a robust, maintainable, and performant user interface for managing OpenStack GPU resources with real-time updates and comprehensive functionality.