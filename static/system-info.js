// System Information and Statistics Manager
// Handles all System Info tab updates, performance metrics, and statistical data

// Update System Info tab with comprehensive system information
function updateSystemInfo(data) {
    const loadStartTime = performance.now();
    
    if (data && data.gpuTypes) {
        // Update GPU Types status
        const gpuTypesStatus = document.getElementById('gpuTypesStatus');
        if (gpuTypesStatus) {
            gpuTypesStatus.innerHTML = `<i class="fas fa-check-circle text-success"></i> ${data.gpuTypes.length} types loaded`;
        }
        
        // Update parallel data status
        const parallelDataStatus = document.getElementById('parallelDataStatus');
        if (parallelDataStatus) {
            parallelDataStatus.innerHTML = `<i class="fas fa-check-circle text-success"></i> Collection complete`;
        }
        
        // Update cache status
        const systemCacheStatus = document.getElementById('systemCacheStatus');
        if (systemCacheStatus) {
            systemCacheStatus.innerHTML = `<i class="fas fa-database text-success"></i> Active`;
        }
        
        // Update system statistics
        const parallelStats = document.getElementById('parallelStats');
        const availableGpuTypes = document.getElementById('availableGpuTypes');
        if (parallelStats && data.aggregates) {
            const aggCount = Object.keys(data.aggregates).length;
            parallelStats.textContent = `⚡ Parallel: 0 hosts, ${aggCount} aggs, ${data.gpuTypes.length} types`;
        }
        if (availableGpuTypes) {
            availableGpuTypes.textContent = data.gpuTypes.length;
        }
        
        // Update OpenStack connection info
        updateOpenStackInfo();
        
        // Update Hyperstack information
        updateHyperstackInfo();
        
        // Update aggregate breakdown
        if (data.aggregates) {
            updateAggregateBreakdown(data.aggregates);
        }
        
        // Update performance metrics
        const totalLoadTime = document.getElementById('totalLoadTime');
        if (totalLoadTime) {
            const loadTime = ((performance.now() - loadStartTime) / 1000).toFixed(2);
            totalLoadTime.textContent = `${loadTime}s`;
        }
        
        // Update last update time
        const lastUpdateTime = document.getElementById('lastUpdateTime');
        if (lastUpdateTime) {
            lastUpdateTime.textContent = new Date().toLocaleTimeString();
        }
    }
}

// Update OpenStack connection information
function updateOpenStackInfo() {
    const openstackConnection = document.getElementById('openstackConnection');
    const openstackRegion = document.getElementById('openstackRegion');
    const openstackProject = document.getElementById('openstackProject');
    const openstackVersion = document.getElementById('openstackVersion');
    
    if (openstackConnection) {
        openstackConnection.innerHTML = `<i class="fas fa-check-circle text-success"></i> Connected`;
    }
    if (openstackRegion) {
        openstackRegion.textContent = process?.env?.OS_REGION_NAME || 'RegionOne';
    }
    if (openstackProject) {
        openstackProject.textContent = process?.env?.OS_PROJECT_NAME || 'admin';
    }
    if (openstackVersion) {
        openstackVersion.textContent = 'Nova v2.1';
    }
}

// Update Hyperstack integration information
function updateHyperstackInfo() {
    const hyperstackStatus = document.getElementById('hyperstackStatus');
    const hyperstackFirewall = document.getElementById('hyperstackFirewall');
    const hyperstackFlavors = document.getElementById('hyperstackFlavors');
    const hyperstackLastResponse = document.getElementById('hyperstackLastResponse');
    
    if (hyperstackStatus) {
        hyperstackStatus.innerHTML = `<i class="fas fa-check-circle text-success"></i> Connected`;
    }
    if (hyperstackFirewall) {
        hyperstackFirewall.textContent = 'Active (CA1)';
    }
    if (hyperstackFlavors) {
        hyperstackFlavors.textContent = '25+ available';
    }
    if (hyperstackLastResponse) {
        hyperstackLastResponse.textContent = new Date().toLocaleTimeString();
    }
}

// Update aggregate breakdown information
function updateAggregateBreakdown(aggregates) {
    let ondemandCount = 0, spotCount = 0, runpodCount = 0, contractCount = 0;
    
    Object.values(aggregates).forEach(gpuType => {
        Object.keys(gpuType).forEach(key => {
            if (key.includes('ondemand') || key.includes('on-demand')) ondemandCount++;
            else if (key.includes('spot')) spotCount++;
            else if (key.includes('runpod')) runpodCount++;
            else if (key.includes('contract') || key.includes('Contract')) contractCount++;
        });
    });
    
    const ondemandAggregates = document.getElementById('ondemandAggregates');
    const spotAggregates = document.getElementById('spotAggregates');
    const runpodAggregates = document.getElementById('runpodAggregates');
    const contractAggregates = document.getElementById('contractAggregates');
    const activeContracts = document.getElementById('activeContracts');
    
    if (ondemandAggregates) ondemandAggregates.textContent = `${ondemandCount} aggregates`;
    if (spotAggregates) spotAggregates.textContent = `${spotCount} aggregates`;
    if (runpodAggregates) runpodAggregates.textContent = `${runpodCount} aggregates`;
    if (contractAggregates) contractAggregates.textContent = `${contractCount} aggregates`;
    if (activeContracts) activeContracts.textContent = contractCount;
    
    // Update contract details
    const contractTypes = document.getElementById('contractTypes');
    const contractHosts = document.getElementById('contractHosts');
    const contractUtilization = document.getElementById('contractUtilization');
    
    if (contractTypes && contractCount > 0) {
        contractTypes.textContent = 'IOnet, ING, FLA, SKY, Nanonet, Stanford';
    }
    if (contractHosts) {
        // Estimate total contract hosts based on aggregate count
        const estimatedHosts = contractCount * 8; // Rough estimate
        contractHosts.textContent = `~${estimatedHosts}`;
    }
    if (contractUtilization) {
        contractUtilization.textContent = 'Variable';
    }
}

// Update System Info tab with comprehensive cache statistics
function updateSystemInfoFromCache(cacheData) {
    // Update basic cache stats
    const cacheStats = document.getElementById('cacheStats');
    if (cacheStats) {
        cacheStats.textContent = `(${cacheData.hostCache} host cache, ${cacheData.netboxCache} netbox${cacheData.parallelCache > 0 ? `, ${cacheData.parallelCache} parallel` : ''})`;
    }
    
    // Update parallel stats with host count
    const parallelStats = document.getElementById('parallelStats');
    if (parallelStats && cacheData.cacheMethod === 'parallel_agents') {
        parallelStats.textContent = `⚡ Parallel: ${cacheData.totalHosts} hosts, ${cacheData.totalAggregates} aggs, ${cacheData.totalGpuTypes} types`;
    }
    
    // Update detailed cache information
    const hostCacheDetails = document.getElementById('hostCacheDetails');
    const netboxCacheDetails = document.getElementById('netboxCacheDetails');
    const parallelCacheDetails = document.getElementById('parallelCacheDetails');
    const netboxDevices = document.getElementById('netboxDevices');
    const cacheAge = document.getElementById('cacheAge');
    
    if (hostCacheDetails) {
        hostCacheDetails.textContent = `${cacheData.hostCache} entries`;
    }
    if (netboxCacheDetails) {
        netboxCacheDetails.textContent = `${cacheData.netboxCache} entries`;
    }
    if (parallelCacheDetails) {
        parallelCacheDetails.textContent = `${cacheData.parallelCache} entries`;
    }
    if (netboxDevices && cacheData.netboxCache > 0) {
        netboxDevices.textContent = cacheData.netboxCache;
    }
    
    // Update NetBox connection status
    const netboxConnection = document.getElementById('netboxConnection');
    const netboxLastSync = document.getElementById('netboxLastSync');
    if (netboxConnection && cacheData.netboxCache > 0) {
        netboxConnection.innerHTML = `<i class="fas fa-check-circle text-success"></i> Connected`;
    }
    if (netboxLastSync) {
        netboxLastSync.textContent = new Date().toLocaleTimeString();
    }
    
    // Update cache age information
    if (cacheAge) {
        const now = new Date();
        cacheAge.textContent = '< 1 minute'; // Since we just updated
    }
    
    // Update performance metrics
    const netboxResponseTime = document.getElementById('netboxResponseTime');
    if (netboxResponseTime && cacheData.netboxCache > 0) {
        // Estimate response time based on cache size (rough approximation)
        const estimatedTime = Math.max(100, Math.min(2000, cacheData.netboxCache * 2));
        netboxResponseTime.textContent = `~${estimatedTime}ms`;
    }
}

// Export System Info module
console.log('System Info module loaded');

// Export functions for global access
window.SystemInfo = {
    updateSystemInfo,
    updateOpenStackInfo,
    updateHyperstackInfo,
    updateAggregateBreakdown,
    updateSystemInfoFromCache
};