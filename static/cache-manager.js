/**
 * Cache Management System
 * Handles cache refresh operations, notifications, and status updates
 */

window.CacheManager = (function() {
    'use strict';

    let notificationTimeout = null;

    /**
     * Show notification to user
     */
    function showNotification(message, type = 'info', duration = 3000) {
        // Clear existing notification timeout
        if (notificationTimeout) {
            clearTimeout(notificationTimeout);
        }

        // Create or update notification element
        let notification = document.getElementById('cache-notification');
        if (!notification) {
            notification = document.createElement('div');
            notification.id = 'cache-notification';
            notification.className = 'cache-notification';
            document.body.appendChild(notification);
        }

        // Set notification content and style
        notification.className = `cache-notification ${type} show`;
        notification.innerHTML = `
            <div class="notification-content">
                <i class="fas ${getIconForType(type)}"></i>
                <span>${message}</span>
                <button type="button" class="btn-close" onclick="CacheManager.hideNotification()"></button>
            </div>
        `;

        // Auto-hide after specified duration
        notificationTimeout = setTimeout(() => {
            hideNotification();
        }, duration);
    }

    /**
     * Hide notification
     */
    function hideNotification() {
        const notification = document.getElementById('cache-notification');
        if (notification) {
            notification.classList.remove('show');
        }
        if (notificationTimeout) {
            clearTimeout(notificationTimeout);
            notificationTimeout = null;
        }
    }

    /**
     * Get icon class for notification type
     */
    function getIconForType(type) {
        switch (type) {
            case 'success': return 'fa-check-circle';
            case 'error': return 'fa-exclamation-triangle';
            case 'warning': return 'fa-exclamation-circle';
            default: return 'fa-info-circle';
        }
    }

    /**
     * Update cache status display
     */
    async function updateCacheStatus() {
        try {
            const response = await fetch('/api/cache-status');
            if (response.ok) {
                const status = await response.json();
                const cacheStatusEl = document.getElementById('cache-status');
                
                if (cacheStatusEl && status.success) {
                    const totalHosts = status.total_cached_hosts || 0;
                    const hostCache = status.host_aggregate_cache?.host_aggregate_cache_size || 0;
                    const netboxCache = status.netbox_cache?.tenant_cache_size || 0;
                    
                    cacheStatusEl.innerHTML = `
                        <i class="fas fa-database"></i> 
                        Cache: ${totalHosts} hosts (${hostCache} agg, ${netboxCache} tenant)
                    `;
                    cacheStatusEl.title = `Host Aggregate Cache: ${hostCache} entries\nNetBox Tenant Cache: ${netboxCache} entries`;
                }
            }
        } catch (error) {
            console.error('Failed to get cache status:', error);
        }
    }

    /**
     * Refresh all data - clears caches and reloads current view
     */
    async function refreshAllData() {
        const refreshBtn = document.getElementById('refresh-all-btn');
        const originalText = refreshBtn?.innerHTML;
        
        try {
            // Show loading state
            if (refreshBtn) {
                refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Refreshing...';
                refreshBtn.disabled = true;
            }

            showNotification('Refreshing all cached data...', 'info', 5000);
            
            // Clear all caches
            const response = await fetch('/api/refresh-all-data', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            if (response.ok) {
                const result = await response.json();
                console.log('✅ All data refreshed:', result);
                
                // Reload current data (whatever view is currently displayed)
                await reloadCurrentView();
                
                // Show success message
                const clearedInfo = result.cleared;
                const message = `Data refreshed! Cleared: ${clearedInfo.host_aggregate_cache} host cache, ${clearedInfo.netbox_cache} tenant cache`;
                showNotification(message, 'success');
                
                // Update cache status
                setTimeout(updateCacheStatus, 1000);
                
            } else {
                const error = await response.json();
                throw new Error(error.error || `HTTP ${response.status}`);
            }
            
        } catch (error) {
            console.error('❌ Failed to refresh all data:', error);
            showNotification(`Failed to refresh data: ${error.message}`, 'error');
        } finally {
            // Restore button
            if (refreshBtn && originalText) {
                refreshBtn.innerHTML = originalText;
                refreshBtn.disabled = false;
            }
        }
    }

    /**
     * Clear cache only - doesn't reload data
     */
    async function clearCacheOnly() {
        const clearBtn = document.getElementById('clear-cache-btn');
        const originalText = clearBtn?.innerHTML;
        
        try {
            // Show loading state
            if (clearBtn) {
                clearBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Clearing...';
                clearBtn.disabled = true;
            }

            const response = await fetch('/api/clear-cache', {
                method: 'POST'
            });
            
            if (response.ok) {
                const result = await response.json();
                console.log('✅ Cache cleared:', result);
                
                const clearedInfo = result.cleared;
                const message = `Cache cleared! ${clearedInfo.host_aggregate_cache} host entries, ${clearedInfo.netbox_cache} tenant entries`;
                showNotification(message, 'success');
                
                updateCacheStatus();
            } else {
                const error = await response.json();
                throw new Error(error.error || `HTTP ${response.status}`);
            }
        } catch (error) {
            console.error('❌ Failed to clear cache:', error);
            showNotification(`Failed to clear cache: ${error.message}`, 'error');
        } finally {
            // Restore button
            if (clearBtn && originalText) {
                clearBtn.innerHTML = originalText;
                clearBtn.disabled = false;
            }
        }
    }

    /**
     * Reload whatever view is currently displayed
     */
    async function reloadCurrentView() {
        try {
            const currentGpuType = getCurrentGpuType();
            if (currentGpuType && window.OpenStack?.loadAggregateData) {
                console.log(`🔄 Reloading current view: ${currentGpuType}`);
                await window.OpenStack.loadAggregateData(currentGpuType);
            } else {
                console.log('🔄 No current GPU type selected or loadAggregateData not available');
            }
        } catch (error) {
            console.error('❌ Failed to reload current view:', error);
            throw error;
        }
    }

    /**
     * Get currently selected GPU type
     */
    function getCurrentGpuType() {
        const gpuSelect = document.getElementById('gpuTypeSelect');
        return gpuSelect ? gpuSelect.value : null;
    }

    /**
     * Initialize cache management system
     */
    function init() {
        console.log('🔧 Initializing Cache Manager...');

        // Bind event listeners
        const refreshAllBtn = document.getElementById('refresh-all-btn');
        const clearCacheBtn = document.getElementById('clear-cache-btn');

        if (refreshAllBtn) {
            refreshAllBtn.addEventListener('click', refreshAllData);
        }

        if (clearCacheBtn) {
            clearCacheBtn.addEventListener('click', clearCacheOnly);
        }

        // Update cache status on page load
        updateCacheStatus();

        // Update cache status periodically (every 30 seconds)
        setInterval(updateCacheStatus, 30000);

        console.log('✅ Cache Manager initialized');
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Public API
    return {
        init,
        refreshAllData,
        clearCacheOnly,
        updateCacheStatus,
        showNotification,
        hideNotification
    };

})();

console.log('📄 CACHE-MANAGER.JS: Module loaded');