/**
 * Loading State Manager for OpenStack Spot Manager
 * Handles loading indicators and status messages during backend operations
 */

class LoadingManager {
    constructor() {
        this.activeOperations = new Map();
        this.loadingOverlay = null;
        this.initializeLoadingUI();
    }

    /**
     * Initialize loading UI components
     */
    initializeLoadingUI() {
        // Create loading overlay if it doesn't exist
        if (!document.getElementById('loadingOverlay')) {
            this.createLoadingOverlay();
        }
        this.loadingOverlay = document.getElementById('loadingOverlay');
    }

    /**
     * Create the main loading overlay
     */
    createLoadingOverlay() {
        const overlay = document.createElement('div');
        overlay.id = 'loadingOverlay';
        overlay.className = 'loading-overlay';
        overlay.innerHTML = `
            <div class="loading-content">
                <div class="loading-spinner">
                    <div class="spinner-border text-primary" role="status">
                        <span class="visually-hidden">Loading...</span>
                    </div>
                </div>
                <div class="loading-message" id="loadingMessage">
                    <h5 id="loadingTitle">Processing...</h5>
                    <p id="loadingDescription">Please wait while we complete your request.</p>
                </div>
                <div class="loading-progress" id="loadingProgress" style="display: none;">
                    <div class="progress mb-2">
                        <div class="progress-bar" role="progressbar" style="width: 0%" id="progressBar"></div>
                    </div>
                    <small class="text-muted" id="progressText">Initializing...</small>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        // Add CSS styles
        const style = document.createElement('style');
        style.textContent = `
            .loading-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.7);
                display: none;
                justify-content: center;
                align-items: center;
                z-index: 9999;
                backdrop-filter: blur(5px);
            }
            .loading-overlay.show {
                display: flex;
            }
            .loading-content {
                background: white;
                padding: 30px;
                border-radius: 10px;
                box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
                text-align: center;
                max-width: 400px;
                width: 90%;
            }
            .loading-spinner {
                margin-bottom: 20px;
            }
            .loading-message h5 {
                margin-bottom: 10px;
                color: #333;
            }
            .loading-message p {
                color: #666;
                margin-bottom: 0;
            }
            .loading-progress {
                margin-top: 20px;
            }
            .operation-loading {
                opacity: 0.6;
                pointer-events: none;
            }
            .operation-loading .btn {
                position: relative;
            }
            .operation-loading .btn::after {
                content: '';
                position: absolute;
                width: 16px;
                height: 16px;
                margin: auto;
                border: 2px solid transparent;
                border-top-color: #ffffff;
                border-radius: 50%;
                animation: spin 1s linear infinite;
                top: 0;
                left: 0;
                bottom: 0;
                right: 0;
            }
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        `;
        document.head.appendChild(style);
    }

    /**
     * Show loading state for a specific operation
     */
    showLoading(operationId, config = {}) {
        const defaultConfig = {
            title: 'Processing...',
            description: 'Please wait while we complete your request.',
            showProgress: false,
            progress: 0,
            progressText: '',
            overlay: true
        };

        const finalConfig = { ...defaultConfig, ...config };
        
        this.activeOperations.set(operationId, finalConfig);

        if (finalConfig.overlay) {
            this.updateLoadingOverlay(finalConfig);
            this.loadingOverlay.classList.add('show');
        }

        // Add loading class to specific elements if provided
        if (finalConfig.element) {
            finalConfig.element.classList.add('operation-loading');
        }

        console.log(`🔄 Loading started: ${operationId}`, finalConfig);
    }

    /**
     * Update loading state
     */
    updateLoading(operationId, updates = {}) {
        if (!this.activeOperations.has(operationId)) {
            console.warn(`⚠️ No active loading operation found: ${operationId}`);
            return;
        }

        const config = this.activeOperations.get(operationId);
        const updatedConfig = { ...config, ...updates };
        this.activeOperations.set(operationId, updatedConfig);

        if (updatedConfig.overlay) {
            this.updateLoadingOverlay(updatedConfig);
        }

        console.log(`🔄 Loading updated: ${operationId}`, updates);
    }

    /**
     * Hide loading state
     */
    hideLoading(operationId) {
        if (!this.activeOperations.has(operationId)) {
            console.warn(`⚠️ No active loading operation found: ${operationId}`);
            return;
        }

        const config = this.activeOperations.get(operationId);
        this.activeOperations.delete(operationId);

        // Remove loading class from specific elements
        if (config.element) {
            config.element.classList.remove('operation-loading');
        }

        // Hide overlay if no other operations are active
        if (this.activeOperations.size === 0) {
            this.loadingOverlay.classList.remove('show');
        }

        console.log(`✅ Loading ended: ${operationId}`);
    }

    /**
     * Update the loading overlay content
     */
    updateLoadingOverlay(config) {
        const titleEl = document.getElementById('loadingTitle');
        const descriptionEl = document.getElementById('loadingDescription');
        const progressEl = document.getElementById('loadingProgress');
        const progressBarEl = document.getElementById('progressBar');
        const progressTextEl = document.getElementById('progressText');

        if (titleEl) titleEl.textContent = config.title;
        if (descriptionEl) descriptionEl.textContent = config.description;

        if (config.showProgress && progressEl) {
            progressEl.style.display = 'block';
            if (progressBarEl) {
                progressBarEl.style.width = `${config.progress}%`;
                progressBarEl.setAttribute('aria-valuenow', config.progress);
            }
            if (progressTextEl) progressTextEl.textContent = config.progressText;
        } else if (progressEl) {
            progressEl.style.display = 'none';
        }
    }

    /**
     * Show loading for specific UI element
     */
    showElementLoading(element, message = 'Loading...') {
        if (!element) return;

        element.classList.add('operation-loading');
        
        // Store original content
        if (!element.dataset.originalContent) {
            element.dataset.originalContent = element.innerHTML;
        }

        // Show loading content
        element.innerHTML = `
            <span class="d-flex align-items-center justify-content-center">
                <span class="spinner-border spinner-border-sm me-2" role="status"></span>
                ${message}
            </span>
        `;
        element.disabled = true;
    }

    /**
     * Hide loading for specific UI element
     */
    hideElementLoading(element) {
        if (!element) return;

        element.classList.remove('operation-loading');
        
        // Restore original content
        if (element.dataset.originalContent) {
            element.innerHTML = element.dataset.originalContent;
            delete element.dataset.originalContent;
        }
        element.disabled = false;
    }

    /**
     * Show loading toast notification
     */
    showLoadingToast(message, type = 'info') {
        const toastId = 'loadingToast' + Date.now();
        const toast = document.createElement('div');
        toast.id = toastId;
        toast.className = 'toast';
        toast.setAttribute('role', 'alert');
        toast.innerHTML = `
            <div class="toast-header">
                <div class="spinner-border spinner-border-sm me-2" role="status"></div>
                <strong class="me-auto">Processing</strong>
                <button type="button" class="btn-close" data-bs-dismiss="toast"></button>
            </div>
            <div class="toast-body">${message}</div>
        `;

        // Add to toast container
        let container = document.querySelector('.toast-container');
        if (!container) {
            container = document.createElement('div');
            container.className = 'toast-container position-fixed bottom-0 end-0 p-3';
            document.body.appendChild(container);
        }
        container.appendChild(toast);

        const bsToast = new bootstrap.Toast(toast);
        bsToast.show();

        return toastId;
    }

    /**
     * Get operation-specific loading messages
     */
    getOperationMessages(operationType) {
        const messages = {
            'openstack-fetch': {
                title: 'Fetching OpenStack Data',
                description: 'Connecting to OpenStack API and retrieving host information...',
                progressMessages: [
                    'Authenticating with OpenStack...',
                    'Discovering compute services...',
                    'Loading host aggregates...',
                    'Fetching VM details...',
                    'Processing host data...'
                ]
            },
            'netbox-fetch': {
                title: 'Fetching Netbox Data',
                description: 'Connecting to Netbox API and retrieving device information...',
                progressMessages: [
                    'Authenticating with Netbox...',
                    'Querying device inventory...',
                    'Loading device details...',
                    'Processing network information...'
                ]
            },
            'migration-preview': {
                title: 'Previewing Migration',
                description: 'Analyzing migration requirements and generating commands...',
                progressMessages: [
                    'Validating source host...',
                    'Checking target aggregate...',
                    'Generating migration commands...'
                ]
            },
            'migration-execute': {
                title: 'Executing Migration',
                description: 'Running OpenStack commands to migrate host...',
                progressMessages: [
                    'Preparing migration...',
                    'Executing OpenStack commands...',
                    'Verifying migration status...',
                    'Updating host records...'
                ]
            },
            'runpod-launch': {
                title: 'Launching Runpod VM',
                description: 'Creating virtual machine on Hyperstack platform...',
                progressMessages: [
                    'Preparing VM configuration...',
                    'Creating VM instance...',
                    'Configuring networking...',
                    'Setting up firewall rules...',
                    'Finalizing VM setup...'
                ]
            },
            'vm-details': {
                title: 'Loading VM Details',
                description: 'Fetching virtual machine information from OpenStack...',
                progressMessages: [
                    'Querying VM instances...',
                    'Loading VM metadata...',
                    'Processing VM status...'
                ]
            },
            'aggregate-data': {
                title: 'Loading Aggregate Data',
                description: 'Retrieving host aggregate information...',
                progressMessages: [
                    'Connecting to OpenStack...',
                    'Fetching aggregate details...',
                    'Loading host assignments...',
                    'Processing GPU information...'
                ]
            }
        };

        return messages[operationType] || {
            title: 'Processing',
            description: 'Please wait while we complete your request...',
            progressMessages: ['Processing...']
        };
    }
}

// Create global loading manager instance
window.loadingManager = new LoadingManager();

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = LoadingManager;
}