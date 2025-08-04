// Hyperstack API operations for OpenStack Spot Manager
// Handles VM launches, networking, and firewall operations

// Execute RunPod VM launch
function executeRunpodLaunch(hostname) {
    return new Promise((resolve, reject) => {
        console.log(`🚀 Starting RunPod launch for ${hostname}`);
        window.Logs.addToDebugLog('Hyperstack', `Starting RunPod launch for ${hostname}`, 'info', hostname);
        
        // Get stored operation data to find image information
        const operation = window.Frontend.pendingOperations.find(op => 
            op.hostname === hostname && op.type === 'runpod-launch'
        );
        
        // Build preview request with image information
        const previewRequest = { hostname: hostname };
        if (operation && operation.details.image_name) {
            previewRequest.image_name = operation.details.image_name;
        }
        if (operation && operation.details.image_id) {
            previewRequest.image_id = operation.details.image_id;
        }
        
        // Preview first
        window.Utils.fetchWithTimeout('/api/preview-runpod-launch', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(previewRequest)
        }, 15000)
        .then(window.Utils.checkResponse)
        .then(response => response.json())
        .then(previewData => {
            console.log(`📋 Preview data for ${hostname}:`, previewData);
            
            if (previewData.error) {
                console.error(`❌ Preview failed for ${hostname}:`, previewData.error);
                window.Logs.addToDebugLog('Hyperstack', `Preview failed: ${previewData.error}`, 'error', hostname);
                window.Frontend.showNotification(`Preview failed for ${hostname}: ${previewData.error}`, 'danger');
                reject(new Error(previewData.error));
                return;
            }
            
            console.log(`✅ Preview successful for ${hostname} - VM: ${previewData.vm_name}, Flavor: ${previewData.flavor_name}`);
            window.Logs.addToDebugLog('Hyperstack', `VM: ${previewData.vm_name}, Flavor: ${previewData.flavor_name}, GPU: ${previewData.gpu_type}`, 'success', hostname);
            
            // Execute the launch with image data
            const launchData = { hostname: hostname };
            
            // Add image data if available from operation
            if (previewData.image_name) {
                launchData.image_name = previewData.image_name;
            }
            if (previewData.image_id) {
                launchData.image_id = previewData.image_id;
            }
            
            window.Utils.fetchWithTimeout('/api/execute-runpod-launch', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(launchData)
            }, 60000) // 60 second timeout for VM launch
            .then(window.Utils.checkResponse)
            .then(response => response.json())
            .then(data => {
                console.log(`📊 Launch execution result for ${hostname}:`, data);
                
                if (data.success) {
                    console.log(`✅ Launch successful for ${hostname} - VM ID: ${data.vm_id || 'N/A'}`);
                    window.Logs.addToDebugLog('Hyperstack', `VM launched successfully - ID: ${data.vm_id || 'N/A'}`, 'success', hostname);
                    
                    let message = `Successfully launched VM ${data.vm_name} on ${hostname}`;
                    if (data.vm_id) {
                        message += ` (ID: ${data.vm_id})`;
                    }
                    
                    // Add post-launch task notifications
                    let tasks = [];
                    if (data.storage_network_scheduled && hostname.startsWith('CA1-')) {
                        tasks.push('storage network (120s)');
                        console.log(`🔌 Storage network attachment scheduled for ${hostname} in 120s`);
                        window.Logs.addToDebugLog('Hyperstack', 'Storage network attachment scheduled for 120s after launch', 'info', hostname);
                    }
                    if (data.firewall_scheduled) {
                        tasks.push('firewall (180s)');
                        console.log(`🔥 Firewall attachment scheduled for ${hostname} in 180s`);
                        window.Logs.addToDebugLog('Hyperstack', 'Firewall attachment scheduled for 180s after launch', 'info', hostname);
                    }
                    
                    if (tasks.length > 0) {
                        message += `. Scheduled: ${tasks.join(', ')}.`;
                    }
                    
                    window.Frontend.showNotification(message, 'success');
                    
                    // Refresh host status to show it's now in use
                    if (window.Frontend && window.Frontend.updateHostAfterVMLaunch) {
                        window.Frontend.updateHostAfterVMLaunch(hostname);
                        console.log(`🔄 Updated host status for ${hostname} to show VM is running`);
                        window.Logs.addToDebugLog('Hyperstack', 'Host status updated to show VM is running', 'success', hostname);
                    } else {
                        console.log(`🔄 Host status update skipped for ${hostname} (function not available)`);
                        window.Logs.addToDebugLog('Hyperstack', 'Host status update function not available - skipped', 'info', hostname);
                    }
                    
                    resolve(data);
                } else {
                    console.error(`❌ Launch failed for ${hostname}:`, data.error);
                    window.Logs.addToDebugLog('Hyperstack', `Launch execution failed: ${data.error}`, 'error', hostname);
                    window.Frontend.showNotification(`Launch failed for ${hostname}: ${data.error}`, 'danger');
                    reject(new Error(data.error || 'Launch failed'));
                }
            })
            .catch(error => {
                console.error(`💥 Exception during launch execution for ${hostname}:`, error);
                window.Logs.addToDebugLog('Hyperstack', `Network error during launch execution: ${error.message}`, 'error', hostname);
                window.Frontend.showNotification(`Network error launching VM on ${hostname}`, 'danger');
                reject(error);
            });
        })
        .catch(error => {
            console.error(`💥 Exception during preview for ${hostname}:`, error);
            window.Logs.addToDebugLog('Hyperstack', `Network error during preview: ${error.message}`, 'error', hostname);
            window.Frontend.showNotification(`Preview error for ${hostname}`, 'danger');
            reject(error);
        });
    });
}

// Schedule a RunPod launch (add to pending operations)
function scheduleRunpodLaunch(hostname) {
    console.log(`📋 Opening image selection modal for ${hostname}`);
    window.Logs.addToDebugLog('Hyperstack', `Opening image selection modal for ${hostname}`, 'info', hostname);
    
    // Get the host card to determine current state
    const hostCard = document.querySelector(`[data-host="${hostname}"]`);
    if (!hostCard) {
        console.error(`❌ Host card not found for ${hostname}`);
        window.Logs.addToDebugLog('Hyperstack', `Host card not found for ${hostname}`, 'error', hostname);
        window.Frontend.showNotification(`Host ${hostname} not found`, 'danger');
        return;
    }
    
    // Show image selection modal
    showImageSelectionModal(hostname);
}

// Global variables for image selection
let availableImages = [];
let selectedImage = null;
let currentLaunchHostname = '';
let currentRegionFilter = null;

// Image cache with timestamp
let imageCache = {
    data: [],
    timestamp: null,
    expireAfter: 5 * 60 * 1000 // 5 minutes in milliseconds
};

// Region mapping and detection (based on actual Hyperstack API response)
const regionMappings = {
    'CA1': 'CANADA-1',
    'US1': 'US-1', 
    'NO1': 'NORWAY-1'
};

const regionFlags = {
    'CANADA-1': '🇨🇦',
    'US-1': '🇺🇸', 
    'NORWAY-1': '🇳🇴',
    // Default flag for unknown regions
    'default': '🌍'
};

// Region status colors based on green_status from API
const regionStatusColors = {
    'GREEN': 'success',
    'NOT_GREEN': 'warning',
    'default': 'secondary'
};

// Detect region from hostname
function detectRegionFromHostname(hostname) {
    if (!hostname) return null;
    
    // Extract region prefix from hostname (e.g., CA1-ESC812-206 -> CA1)
    const regionMatch = hostname.match(/^([A-Z]+\d*)-/);
    if (regionMatch) {
        const regionPrefix = regionMatch[1];
        return regionMappings[regionPrefix] || null;
    }
    
    return null;
}

// Show image selection modal
function showImageSelectionModal(hostname) {
    console.log(`🖼️ Opening image selection modal for ${hostname}`);
    currentLaunchHostname = hostname;
    
    // Detect region from hostname
    const detectedRegion = detectRegionFromHostname(hostname);
    currentRegionFilter = detectedRegion;
    
    console.log(`🌍 Detected region for ${hostname}: ${detectedRegion || 'Unknown'}`);
    
    // Update modal title
    document.getElementById('imageSelectionHostname').textContent = hostname;
    
    // Reset modal state
    resetImageSelectionModal();
    
    // Show the modal
    const modal = new bootstrap.Modal(document.getElementById('imageSelectionModal'));
    modal.show();
    
    // Load images with region filter
    loadAvailableImages();
    
    // Setup region filter after modal is shown
    setTimeout(() => {
        setupRegionFilter();
    }, 100);
}

// Reset image selection modal to initial state
function resetImageSelectionModal() {
    selectedImage = null;
    
    // Show loading, hide content
    document.getElementById('imageSelectionLoading').style.display = 'block';
    document.getElementById('imageSelectionContent').style.display = 'none';
    document.getElementById('imageSelectionError').classList.add('d-none');
    document.getElementById('selectedImageInfo').style.display = 'none';
    
    // Disable confirm button
    document.getElementById('confirmImageSelectionBtn').disabled = true;
    
    // Clear search input
    const searchInput = document.getElementById('imageSearchInput');
    if (searchInput) {
        searchInput.value = '';
    }
}

// Load available images from Hyperstack API (with caching)
function loadAvailableImages(forceRefresh = false) {
    console.log('🔄 Loading available images from Hyperstack...');
    
    // Check cache first (unless force refresh)
    if (!forceRefresh && imageCache.timestamp && imageCache.data.length > 0) {
        const now = Date.now();
        const cacheAge = now - imageCache.timestamp;
        
        if (cacheAge < imageCache.expireAfter) {
            console.log(`📦 Using cached images (${Math.round(cacheAge / 1000)}s old)`);
            availableImages = imageCache.data;
            
            // Hide loading and show content
            document.getElementById('imageSelectionLoading').style.display = 'none';
            document.getElementById('imageSelectionContent').style.display = 'block';
            
            // Render images
            renderImageSelection();
            
            // Setup search functionality
            setupImageSearch();
            
            return;
        } else {
            console.log('🗑️ Cache expired, fetching fresh images...');
        }
    }
    
    // Build URL with region filter if applicable
    let apiUrl = '/api/hyperstack/images';
    if (currentRegionFilter && !forceRefresh) {
        apiUrl += `?region=${encodeURIComponent(currentRegionFilter)}`;
    }
    
    window.Utils.fetchWithTimeout(apiUrl, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
    }, 30000)
    .then(window.Utils.checkResponse)
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            availableImages = data.images;
            
            // Update cache
            imageCache.data = availableImages;
            imageCache.timestamp = Date.now();
            
            console.log(`✅ Loaded ${availableImages.length} images from Hyperstack (cached for 5 minutes)`);
            
            // Debug: Log unique regions found
            const uniqueRegions = [...new Set(availableImages.map(img => img.region_name))];
            console.log(`🌍 Available regions: ${uniqueRegions.join(', ')}`);
            
            window.Logs.addToDebugLog('Hyperstack', `Loaded ${availableImages.length} available images from regions: ${uniqueRegions.join(', ')}`, 'success');
            
            // Hide loading and show content
            document.getElementById('imageSelectionLoading').style.display = 'none';
            document.getElementById('imageSelectionContent').style.display = 'block';
            
            // Create dynamic region filter buttons based on actual regions
            createDynamicRegionButtons();
            
            // Render images
            renderImageSelection();
            
            // Setup search functionality
            setupImageSearch();
            
        } else {
            throw new Error(data.error || 'Failed to load images');
        }
    })
    .catch(error => {
        console.error('❌ Error loading images:', error);
        window.Logs.addToDebugLog('Hyperstack', `Error loading images: ${error.message}`, 'error');
        
        // Show error
        document.getElementById('imageSelectionLoading').style.display = 'none';
        document.getElementById('imageSelectionError').classList.remove('d-none');
        document.getElementById('imageSelectionErrorMessage').textContent = `Failed to load images: ${error.message}`;
    });
}

// Render image selection list
function renderImageSelection(filteredImages = null) {
    // Apply region filter first, then any additional filters (like search)
    let imagesToRender = filteredImages || availableImages;
    
    // If no specific filtered images provided, apply region filter
    if (!filteredImages) {
        imagesToRender = filterImagesByRegion(availableImages, currentRegionFilter);
    }
    
    const container = document.getElementById('imageSelectionList');
    
    if (imagesToRender.length === 0) {
        container.innerHTML = `
            <div class="text-center text-muted py-4">
                <i class="fas fa-compact-disc fa-3x mb-3"></i>
                <p>No images found matching your search criteria.</p>
            </div>
        `;
        return;
    }
    
    const imagesHtml = imagesToRender.map(image => {
        const isSelected = selectedImage && selectedImage.id === image.id;
        const cardClass = isSelected ? 'image-card selected' : 'image-card';
        
        // Determine status color based on green_status
        const statusColor = image.green_status === 'GREEN' ? 'success' : 
                           image.green_status === 'NOT_GREEN' ? 'warning' : 'secondary';
        
        return `
            <div class="${cardClass}" data-image-id="${image.id}" onclick="selectImage(${image.id})">
                <div class="image-card-header">
                    <div class="image-info">
                        <h6 class="image-name mb-1">
                            ${image.logo ? `<img src="${image.logo}" alt="${image.type}" style="width: 20px; height: 20px; margin-right: 8px;">` : '<i class="fas fa-compact-disc me-2"></i>'}
                            ${image.name}
                        </h6>
                        <div class="image-meta">
                            <span class="badge bg-primary me-1">${image.type}</span>
                            <span class="badge bg-secondary me-1">${image.region_name}</span>
                            <span class="badge bg-${statusColor} me-1">${image.green_status || 'UNKNOWN'}</span>
                            <span class="badge bg-info">${image.display_size}</span>
                        </div>
                    </div>
                    <div class="image-selection-indicator">
                        <i class="fas fa-check-circle text-success"></i>
                    </div>
                </div>
                <div class="image-details">
                    <p class="mb-1"><strong>Version:</strong> ${image.version}</p>
                    ${image.description ? `<p class="mb-1"><strong>Description:</strong> ${image.description}</p>` : ''}
                    ${image.snapshot ? `<p class="mb-1"><strong>From Snapshot:</strong> ${image.snapshot.name} (${image.snapshot.display_size})</p>` : ''}
                    <p class="mb-1"><strong>Public:</strong> ${image.is_public ? 'Yes' : 'No'}</p>
                    <p class="mb-0"><strong>Created:</strong> ${new Date(image.created_at).toLocaleDateString()}</p>
                </div>
            </div>
        `;
    }).join('');
    
    container.innerHTML = imagesHtml;
}

// Select an image
function selectImage(imageId) {
    const image = availableImages.find(img => img.id === imageId);
    if (!image) {
        console.error(`❌ Image with ID ${imageId} not found`);
        return;
    }
    
    selectedImage = image;
    console.log(`📸 Selected image: ${image.name} (ID: ${image.id})`);
    window.Logs.addToDebugLog('Hyperstack', `Selected image: ${image.name}`, 'info', currentLaunchHostname);
    
    // Update UI
    renderImageSelection(); // Re-render to show selection
    showSelectedImageInfo(image);
    
    // Enable confirm button
    document.getElementById('confirmImageSelectionBtn').disabled = false;
}

// Show selected image information
function showSelectedImageInfo(image) {
    const infoContainer = document.getElementById('selectedImageInfo');
    const detailsContainer = document.getElementById('selectedImageDetails');
    
    detailsContainer.innerHTML = `
        <div class="row">
            <div class="col-md-6">
                <p class="mb-1">
                    ${image.logo ? `<img src="${image.logo}" alt="${image.type}" style="width: 16px; height: 16px; margin-right: 6px;">` : ''}
                    <strong>Name:</strong> ${image.name}
                </p>
                <p class="mb-1"><strong>Type:</strong> ${image.type}</p>
                <p class="mb-1"><strong>Region:</strong> ${image.region_name}</p>
                <p class="mb-1"><strong>Status:</strong> 
                    <span class="badge bg-${image.green_status === 'GREEN' ? 'success' : 
                                          image.green_status === 'NOT_GREEN' ? 'warning' : 'secondary'}">
                        ${image.green_status || 'UNKNOWN'}
                    </span>
                </p>
            </div>
            <div class="col-md-6">
                <p class="mb-1"><strong>Version:</strong> ${image.version}</p>
                <p class="mb-1"><strong>Size:</strong> ${image.display_size}</p>
                <p class="mb-1"><strong>Public:</strong> ${image.is_public ? 'Yes' : 'No'}</p>
                <p class="mb-1"><strong>Created:</strong> ${new Date(image.created_at).toLocaleDateString()}</p>
            </div>
        </div>
        ${image.description ? `<p class="mb-2 mt-2"><strong>Description:</strong> ${image.description}</p>` : ''}
        ${image.snapshot ? `<p class="mb-0"><strong>Snapshot:</strong> ${image.snapshot.name} (${image.snapshot.display_size}, created ${new Date(image.snapshot.created_at).toLocaleDateString()})</p>` : ''}
    `;
    
    infoContainer.style.display = 'block';
}

// Setup image search functionality
function setupImageSearch() {
    const searchInput = document.getElementById('imageSearchInput');
    
    searchInput.addEventListener('input', function() {
        const searchTerm = this.value.toLowerCase().trim();
        
        if (searchTerm === '') {
            renderImageSelection(); // Show images with region filter only
        } else {
            // Apply both region filter and search filter
            const regionFilteredImages = filterImagesByRegion(availableImages, currentRegionFilter);
            const searchFilteredImages = regionFilteredImages.filter(image => 
                image.name.toLowerCase().includes(searchTerm) ||
                image.type.toLowerCase().includes(searchTerm) ||
                image.version.toLowerCase().includes(searchTerm) ||
                image.region_name.toLowerCase().includes(searchTerm) ||
                (image.description && image.description.toLowerCase().includes(searchTerm)) ||
                (image.green_status && image.green_status.toLowerCase().includes(searchTerm)) ||
                (image.snapshot && image.snapshot.name.toLowerCase().includes(searchTerm))
            );
            renderImageSelection(searchFilteredImages);
        }
    });
}

// Create dynamic region filter buttons based on actual API response
function createDynamicRegionButtons() {
    const uniqueRegions = [...new Set(availableImages.map(img => img.region_name))].sort();
    const buttonContainer = document.getElementById('regionFilterButtons');
    
    if (!buttonContainer) return;
    
    // Clear existing buttons
    buttonContainer.innerHTML = '';
    
    // Add "All Regions" button
    const allBtn = document.createElement('button');
    allBtn.type = 'button';
    allBtn.className = 'btn btn-outline-primary region-filter-btn';
    allBtn.dataset.region = 'all';
    allBtn.innerHTML = '<i class="fas fa-globe me-1"></i>All Regions';
    buttonContainer.appendChild(allBtn);
    
    // Add buttons for each actual region with status indicators
    uniqueRegions.forEach(region => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-outline-primary region-filter-btn';
        btn.dataset.region = region;
        
        // Get region info from first image in that region
        const regionImage = availableImages.find(img => img.region_name === region);
        const greenStatus = regionImage?.green_status || 'UNKNOWN';
        const statusColor = regionStatusColors[greenStatus] || regionStatusColors['default'];
        
        // Get flag and display name
        const flag = regionFlags[region] || regionFlags['default'];
        const displayName = region.replace('-1', '').replace('-', ' ');
        
        // Add status indicator
        const statusIndicator = greenStatus === 'GREEN' ? '🟢' : 
                               greenStatus === 'NOT_GREEN' ? '🟡' : '⚫';
        
        btn.innerHTML = `${flag} ${displayName} ${statusIndicator}`;
        btn.title = `Region Status: ${greenStatus}`;
        
        buttonContainer.appendChild(btn);
    });
    
    console.log(`🏗️ Created dynamic region buttons for: ${uniqueRegions.join(', ')}`);
}

// Setup region filter buttons and detection info
function setupRegionFilter() {
    const regionButtons = document.querySelectorAll('.region-filter-btn');
    const regionInfo = document.getElementById('regionDetectionInfo');
    
    // Update detection info
    if (currentRegionFilter) {
        const flag = regionFlags[currentRegionFilter] || '🌍';
        const regionImage = availableImages.find(img => img.region_name === currentRegionFilter);
        const status = regionImage?.green_status || 'UNKNOWN';
        const statusIndicator = status === 'GREEN' ? '🟢' : status === 'NOT_GREEN' ? '🟡' : '⚫';
        
        regionInfo.innerHTML = `Auto-detected: ${flag} ${currentRegionFilter} ${statusIndicator}`;
        regionInfo.className = 'text-success';
        regionInfo.title = `Region Status: ${status}`;
    } else {
        regionInfo.textContent = 'No region detected - showing all regions';
        regionInfo.className = 'text-muted';
        regionInfo.title = '';
    }
    
    // Set active button based on current filter
    regionButtons.forEach(btn => {
        const region = btn.dataset.region;
        btn.classList.remove('active');
        
        if ((currentRegionFilter && region === currentRegionFilter) || 
            (!currentRegionFilter && region === 'all')) {
            btn.classList.add('active');
        }
        
        // Add click handler
        btn.addEventListener('click', () => {
            // Update active state
            regionButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            // Update current filter
            currentRegionFilter = region === 'all' ? null : region;
            
            console.log(`🌍 Region filter changed to: ${currentRegionFilter || 'All regions'}`);
            
            // Update detection info
            if (currentRegionFilter) {
                const flag = regionFlags[currentRegionFilter] || '🌍';
                const regionImage = availableImages.find(img => img.region_name === currentRegionFilter);
                const status = regionImage?.green_status || 'UNKNOWN';
                const statusIndicator = status === 'GREEN' ? '🟢' : status === 'NOT_GREEN' ? '🟡' : '⚫';
                
                regionInfo.innerHTML = `Selected: ${flag} ${currentRegionFilter} ${statusIndicator}`;
                regionInfo.className = 'text-primary';
                regionInfo.title = `Region Status: ${status}`;
            } else {
                regionInfo.textContent = 'Showing all regions';
                regionInfo.className = 'text-muted';
                regionInfo.title = '';
            }
            
            // Re-render images with new filter
            renderImageSelection();
        });
    });
}

// Filter images by region
function filterImagesByRegion(images, region) {
    if (!region) return images; // Show all if no region filter
    
    const filtered = images.filter(image => image.region_name === region);
    console.log(`🔍 Filtering ${images.length} images by region '${region}': ${filtered.length} matches`);
    
    if (filtered.length === 0) {
        const availableRegions = [...new Set(images.map(img => img.region_name))];
        console.log(`⚠️ No images found for region '${region}'. Available regions: ${availableRegions.join(', ')}`);
    }
    
    return filtered;
}

// Confirm image selection and launch VM
function confirmImageSelection() {
    if (!selectedImage || !currentLaunchHostname) {
        console.error('❌ No image selected or hostname missing');
        return;
    }
    
    console.log(`🚀 Launching VM on ${currentLaunchHostname} with image: ${selectedImage.name}`);
    window.Logs.addToDebugLog('Hyperstack', `Launching VM with image: ${selectedImage.name}`, 'info', currentLaunchHostname);
    
    // Add RunPod launch operation with selected image
    window.Frontend.addRunPodLaunchOperation(currentLaunchHostname, {
        vm_name: currentLaunchHostname,
        flavor_name: 'default', // Should be determined based on host specs
        image_name: selectedImage.name,
        image_id: selectedImage.id,
        key_name: 'default', // Should be determined based on user preferences
        manual: true,
        source: 'manual_launch'
    });
    
    // Close modal
    const modal = bootstrap.Modal.getInstance(document.getElementById('imageSelectionModal'));
    modal.hide();
    
    console.log(`✅ RunPod launch scheduled for ${currentLaunchHostname} with image ${selectedImage.name}`);
    window.Logs.addToDebugLog('Hyperstack', `RunPod launch scheduled with image ${selectedImage.name}`, 'success', currentLaunchHostname);
}

// Generate commands for RunPod launch operations
function generateRunpodLaunchCommands(operation) {
    const commands = [];
    
    // 1. Wait command
    commands.push({
        type: 'wait-command',
        hostname: operation.hostname,
        parent_operation: 'runpod-launch',
        title: 'Wait for aggregate migration to complete',
        description: 'Ensure host is properly moved to Runpod aggregate before VM deployment - prevents deployment failures',
        command: `sleep 60  # Wait for OpenStack aggregate membership to propagate across all services`,
        verification_commands: [
            'nova aggregate-show runpod-aggregate',
            `nova hypervisor-show ${operation.hostname}`
        ],
        estimated_duration: '60s',
        dependencies: [],
        timestamp: new Date().toISOString()
    });
    
    // 2. VM Launch command
    commands.push({
        type: 'hyperstack-launch',
        hostname: operation.hostname,
        parent_operation: 'runpod-launch',
        title: 'Deploy VM via Hyperstack API',
        description: 'Creates new virtual machine on the specified host with correct specifications and flavor',
        command: operation.commands ? operation.commands[0] : `curl -X POST https://infrahub-api.nexgencloud.com/v1/core/virtual-machines \\
  -H 'api_key: <HYPERSTACK_API_KEY>' \\
  -H 'Content-Type: application/json' \\
  -d '{
    "name": "${operation.vm_name || operation.hostname}",
    "flavor_name": "gpu-${operation.gpu_type || 'L40'}-1x",
    "image_name": "${operation.image_name || 'Ubuntu Server 24.04 LTS R570 CUDA 12.8'}",
    "keypair_name": "runpod-keypair",
    "assign_floating_ip": true,
    "user_data": "#!/bin/bash\\necho \\"RunPod VM initialized\\" > /var/log/runpod-init.log",
    "availability_zone": "nova:${operation.hostname}"
  }'`,
        verification_commands: [
            `nova list --host ${operation.hostname}`,
            `nova show ${operation.vm_name || operation.hostname}`
        ],
        estimated_duration: '120s',
        dependencies: ['wait-command'],
        timestamp: new Date().toISOString()
    });
    
    // 3. Storage network commands (for Canada hosts only)
    if (operation.hostname.startsWith('CA1-')) {
        commands.push({
            type: 'storage-network-find',
            hostname: operation.hostname,
            parent_operation: 'runpod-launch',
            title: 'Find RunPod storage network ID',
            description: 'Retrieves the network ID for RunPod-Storage-Canada-1 network to use for port creation',
            command: `openstack network show RunPod-Storage-Canada-1 -f value -c id`,
            verification_commands: [
                'openstack network list --name RunPod-Storage-Canada-1'
            ],
            estimated_duration: '10s',
            dependencies: ['hyperstack-launch'],
            timestamp: new Date().toISOString()
        });
        
        commands.push({
            type: 'storage-port-create',
            hostname: operation.hostname,
            parent_operation: 'runpod-launch',
            title: 'Create storage network port',
            description: 'Creates a dedicated port on the storage network for the VM',
            command: `openstack port create --network RunPod-Storage-Canada-1 --fixed-ip subnet=RunPod-Storage-Canada-1-subnet ${operation.vm_name || operation.hostname}-storage-port`,
            verification_commands: [
                `openstack port show ${operation.vm_name || operation.hostname}-storage-port`
            ],
            estimated_duration: '15s',
            dependencies: ['storage-network-find'],
            timestamp: new Date().toISOString()
        });
        
        commands.push({
            type: 'storage-port-attach',
            hostname: operation.hostname,
            parent_operation: 'runpod-launch',
            title: 'Attach storage port to VM',
            description: 'Attaches the storage network port to the VM for high-performance storage access',
            command: `openstack server add port ${operation.vm_name || operation.hostname} ${operation.vm_name || operation.hostname}-storage-port`,
            verification_commands: [
                `openstack server show ${operation.vm_name || operation.hostname} -c addresses`
            ],
            estimated_duration: '10s',
            dependencies: ['storage-port-create'],
            timestamp: new Date().toISOString()
        });
    }
    
    // 4. Firewall commands (if firewall ID is configured)
    if (operation.firewall_id || (operation.hostname.startsWith('CA1-') && window.HYPERSTACK_FIREWALL_CA1_ID)) {
        commands.push({
            type: 'firewall-get',
            hostname: operation.hostname,
            parent_operation: 'runpod-launch',
            title: 'Get current firewall VM attachments',
            description: 'Retrieves list of VMs currently attached to firewall to preserve them during update',
            command: `curl -X GET https://infrahub-api.nexgencloud.com/v1/core/sg-rules/${operation.firewall_id || window.HYPERSTACK_FIREWALL_CA1_ID} \\
  -H 'api_key: <HYPERSTACK_API_KEY>'`,
            verification_commands: [
                `curl -X GET https://infrahub-api.nexgencloud.com/v1/core/sg-rules/${operation.firewall_id || window.HYPERSTACK_FIREWALL_CA1_ID} -H 'api_key: <HYPERSTACK_API_KEY>'`
            ],
            estimated_duration: '10s',
            dependencies: ['hyperstack-launch'],
            timestamp: new Date().toISOString()
        });
        
        commands.push({
            type: 'firewall-update',
            hostname: operation.hostname,
            parent_operation: 'runpod-launch',
            title: 'Update firewall with all VMs (existing + new)',
            description: 'Updates firewall to include all existing VMs plus the newly created VM',
            command: `curl -X PUT https://infrahub-api.nexgencloud.com/v1/core/sg-rules/${operation.firewall_id || window.HYPERSTACK_FIREWALL_CA1_ID} \\
  -H 'api_key: <HYPERSTACK_API_KEY>' \\
  -H 'Content-Type: application/json' \\
  -d '{"virtual_machines": [<EXISTING_VMS>, "${operation.vm_name || operation.hostname}"]}'`,
            verification_commands: [
                `curl -X GET https://infrahub-api.nexgencloud.com/v1/core/sg-rules/${operation.firewall_id || window.HYPERSTACK_FIREWALL_CA1_ID} -H 'api_key: <HYPERSTACK_API_KEY>'`
            ],
            estimated_duration: '15s',
            dependencies: ['firewall-get'],
            timestamp: new Date().toISOString()
        });
    }
    
    return commands;
}

// Initialize image selection modal event listeners
function initializeImageSelectionModal() {
    // Confirm button
    const confirmBtn = document.getElementById('confirmImageSelectionBtn');
    if (confirmBtn) {
        confirmBtn.addEventListener('click', confirmImageSelection);
    }
    
    // Refresh button
    const refreshBtn = document.getElementById('refreshImagesBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            console.log('🔄 Force refreshing images...');
            resetImageSelectionModal();
            loadAvailableImages(true); // Force refresh
        });
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    initializeImageSelectionModal();
});

// Make image selection functions globally available
window.selectImage = selectImage;
window.confirmImageSelection = confirmImageSelection;

// Export Hyperstack functions
window.Hyperstack = {
    executeRunpodLaunch,
    scheduleRunpodLaunch,
    generateRunpodLaunchCommands,
    showImageSelectionModal,
    loadAvailableImages,
    selectImage,
    confirmImageSelection
};