// Utility functions for OpenStack Spot Manager
// Contains common utilities used across modules

// Utility function for proper HTTP response checking
function checkResponse(response) {
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response;
}

// Utility function to add timeout to fetch requests
function fetchWithTimeout(url, options = {}, timeout = 30000) {
    return Promise.race([
        fetch(url, options),
        new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Request timeout')), timeout)
        )
    ]);
}

// Status utility functions
function getStatusClass(status) {
    switch(status) {
        case 'ACTIVE': return 'success';
        case 'BUILD': return 'warning';
        case 'ERROR': return 'danger';
        case 'SHUTOFF': return 'secondary';
        default: return 'primary';
    }
}

function getStatusIcon(status) {
    switch(status) {
        case 'ACTIVE': return 'fas fa-play-circle';
        case 'BUILD': return 'fas fa-spinner fa-spin';
        case 'ERROR': return 'fas fa-exclamation-triangle';
        case 'SHUTOFF': return 'fas fa-stop-circle';
        default: return 'fas fa-question-circle';
    }
}

function getStatusColor(status) {
    switch(status) {
        case 'ACTIVE': return '#28a745';
        case 'BUILD': return '#ffc107';
        case 'ERROR': return '#dc3545';
        case 'SHUTOFF': return '#6c757d';
        default: return '#007bff';
    }
}

// Date formatting utility
function formatDate(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
}

// Command icon utility
function getCommandIcon(type) {
    switch(type) {
        case 'wait-command': return 'fas fa-clock';
        case 'hyperstack-launch': return 'fas fa-rocket';
        case 'storage-network-find': return 'fas fa-search';
        case 'storage-port-create': return 'fas fa-plus';
        case 'storage-port-attach': return 'fas fa-link';
        case 'firewall-get': return 'fas fa-shield-alt';
        case 'firewall-update': return 'fas fa-shield-alt';
        case 'aggregate-remove': return 'fas fa-minus-circle';
        case 'aggregate-add': return 'fas fa-plus-circle';
        default: return 'fas fa-terminal';
    }
}

// Export utilities for use in other modules
window.Utils = {
    checkResponse,
    fetchWithTimeout,
    getStatusClass,
    getStatusIcon,
    getStatusColor,
    formatDate,
    getCommandIcon
};