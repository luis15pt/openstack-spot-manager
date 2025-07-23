// Simple initialization script for OpenStack Spot Manager
// Works directly with functions from frontend.js without complex modules

console.log('🚀 Starting OpenStack Spot Manager initialization...');

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', function() {
    console.log('📋 DOM loaded, initializing application...');
    
    // Initialize basic event listeners
    setupBasicEventListeners();
    
    // Load GPU types on page load
    loadGpuTypes();
    
    console.log('✅ Basic initialization complete');
});

// Setup basic event listeners
function setupBasicEventListeners() {
    console.log('🔧 Setting up event listeners...');
    
    // GPU type selector
    const gpuSelect = document.getElementById('gpuTypeSelect');
    if (gpuSelect) {
        gpuSelect.addEventListener('change', function() {
            const selectedType = this.value;
            if (selectedType) {
                console.log('🔄 Loading data for GPU type:', selectedType);
                loadAggregateData(selectedType);
            }
        });
    }
    
    // Refresh button
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', function() {
            const currentType = document.getElementById('gpuTypeSelect').value;
            if (currentType) {
                console.log('🔄 Refreshing data for:', currentType);
                loadAggregateData(currentType);
            }
        });
    }
    
    // Control buttons
    const moveToOndemandBtn = document.getElementById('moveToOndemandBtn');
    const moveToRunpodBtn = document.getElementById('moveToRunpodBtn');
    const moveToSpotBtn = document.getElementById('moveToSpotBtn');
    
    if (moveToOndemandBtn) {
        moveToOndemandBtn.addEventListener('click', () => moveSelectedHosts('ondemand'));
    }
    if (moveToRunpodBtn) {
        moveToRunpodBtn.addEventListener('click', () => moveSelectedHosts('runpod'));
    }
    if (moveToSpotBtn) {
        moveToSpotBtn.addEventListener('click', () => moveSelectedHosts('spot'));
    }
}

// Load GPU types from API
function loadGpuTypes() {
    console.log('📊 Loading GPU types...');
    showLoading(true, 'Loading GPU types...', 'Fetching available types...', 20);
    
    fetch('/api/gpu-types')
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            return response.json();
        })
        .then(data => {
            console.log('✅ GPU types loaded:', data);
            populateGpuTypeSelector(data.gpu_types);
            showLoading(false);
        })
        .catch(error => {
            console.error('❌ Error loading GPU types:', error);
            showLoading(false);
            showNotification('Failed to load GPU types: ' + error.message, 'danger');
        });
}

// Populate GPU type selector
function populateGpuTypeSelector(gpuTypes) {
    const select = document.getElementById('gpuTypeSelect');
    if (!select) return;
    
    // Clear existing options except the placeholder
    select.innerHTML = '<option value="">Select GPU Type...</option>';
    
    // Add GPU type options
    gpuTypes.forEach(type => {
        const option = document.createElement('option');
        option.value = type;
        option.textContent = type;
        select.appendChild(option);
    });
    
    console.log(`📋 Added ${gpuTypes.length} GPU types to selector`);
}

// Load aggregate data for a specific GPU type
function loadAggregateData(gpuType) {
    console.log('🔄 Loading aggregate data for:', gpuType);
    showLoading(true, `Loading ${gpuType} data...`, 'Fetching host information...', 40);
    
    fetch(`/api/aggregates/${gpuType}`)
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            return response.json();
        })
        .then(data => {
            console.log('✅ Aggregate data loaded:', data);
            
            // Store current data globally
            window.currentGpuType = gpuType;
            window.aggregateData = data;
            
            // Render the data using frontend.js functions
            if (typeof renderAggregateData === 'function') {
                renderAggregateData(data);
            } else {
                console.error('❌ renderAggregateData function not found');
            }
            
            showLoading(false);
            showMainContent();
        })
        .catch(error => {
            console.error('❌ Error loading aggregate data:', error);
            showLoading(false);
            showNotification('Failed to load data: ' + error.message, 'danger');
        });
}

// Move selected hosts to target type
function moveSelectedHosts(targetType) {
    const selectedCards = document.querySelectorAll('.machine-card.selected');
    if (selectedCards.length === 0) {
        showNotification('Please select hosts to move', 'warning');
        return;
    }
    
    console.log(`🔄 Moving ${selectedCards.length} hosts to ${targetType}`);
    
    selectedCards.forEach(card => {
        const hostname = card.dataset.host;
        const sourceType = card.dataset.type;
        
        if (sourceType === targetType) {
            console.log(`⚠️ ${hostname} is already in ${targetType}`);
            return;
        }
        
        console.log(`📋 Queuing move: ${hostname} from ${sourceType} to ${targetType}`);
        // Add to pending operations (implement this later)
    });
    
    // Clear selection
    selectedCards.forEach(card => card.classList.remove('selected'));
    if (window.selectedHosts) {
        window.selectedHosts.clear();
    }
    
    showNotification(`Queued ${selectedCards.length} hosts for migration to ${targetType}`, 'success');
}

// Show/hide loading indicator
function showLoading(show, message = 'Loading...', step = 'Initializing...', progress = 0) {
    const loadingIndicator = document.getElementById('loadingIndicator');
    const mainContent = document.getElementById('mainContent');
    
    if (show) {
        if (loadingIndicator) {
            loadingIndicator.classList.remove('d-none');
        }
        if (mainContent) {
            mainContent.classList.add('d-none');
        }
        
        const messageEl = document.getElementById('loadingMessage');
        const stepEl = document.getElementById('loadingStep');
        const progressEl = document.getElementById('loadingProgress');
        
        if (messageEl) messageEl.textContent = message;
        if (stepEl) stepEl.textContent = step;
        if (progressEl) progressEl.style.width = progress + '%';
    } else {
        if (loadingIndicator) {
            loadingIndicator.classList.add('d-none');
        }
    }
}

// Show main content
function showMainContent() {
    const mainContent = document.getElementById('mainContent');
    if (mainContent) {
        mainContent.classList.remove('d-none');
    }
}

// Show notification
function showNotification(message, type = 'info') {
    console.log(`📢 Notification (${type}):`, message);
    
    const toast = document.getElementById('notificationToast');
    const toastBody = document.getElementById('toastBody');
    
    if (toast && toastBody) {
        toastBody.textContent = message;
        
        // Remove existing type classes
        toast.classList.remove('bg-success', 'bg-danger', 'bg-warning', 'bg-info');
        
        // Add appropriate type class
        switch(type) {
            case 'success':
                toast.classList.add('bg-success', 'text-white');
                break;
            case 'danger':
            case 'error':
                toast.classList.add('bg-danger', 'text-white');
                break;
            case 'warning':
                toast.classList.add('bg-warning', 'text-dark');
                break;
            default:
                toast.classList.add('bg-info', 'text-white');
        }
        
        // Show the toast
        const bsToast = new bootstrap.Toast(toast);
        bsToast.show();
    }
}

console.log('📋 App initialization script loaded');