// Logging and Debug System for OpenStack Spot Manager
// Handles command logs, debug logs, and system statistics

// Debug system state
let debugEntries = [];
let debugStats = {
    sessionStartTime: new Date().toISOString(),
    operationsCount: 0,
    commandsExecuted: 0,
    errorsCount: 0
};
let debugTabInitialized = false;

// Initialize debug tab if not already initialized
function initializeDebugTab() {
    if (!debugTabInitialized) {
        document.getElementById('sessionStartTime').textContent = new Date(debugStats.sessionStartTime).toLocaleString();
        debugTabInitialized = true;
    }
}

// Add entry to debug log
function addToDebugLog(type, message, level = 'info', hostname = null) {
    const entry = {
        timestamp: new Date().toISOString(),
        type: type,
        message: message,
        level: level,
        hostname: hostname
    };
    
    debugEntries.push(entry);
    
    // Update stats
    if (level === 'error') {
        debugStats.errorsCount++;
    }
    
    // Update display
    updateDebugLogDisplay();
    updateDebugStats();
    updateDebugTabBadge();
}

// Update debug log display
function updateDebugLogDisplay() {
    const container = document.getElementById('debugLogContainer');
    if (!container) return;
    
    if (debugEntries.length === 0) {
        container.innerHTML = `
            <div class="text-center text-muted">
                <i class="fas fa-bug fa-3x mb-3"></i>
                <p>Debug information will appear here during operations.</p>
            </div>`;
        return;
    }
    
    const entriesHtml = debugEntries.slice(-100).map(entry => {
        const levelClass = entry.level === 'error' ? 'danger' : 
                          entry.level === 'warning' ? 'warning' : 
                          entry.level === 'success' ? 'success' : 'info';
        
        const hostnameText = entry.hostname ? `[${entry.hostname}]` : '';
        const timestamp = new Date(entry.timestamp).toLocaleTimeString();
        
        return `
            <div class="debug-entry border-start border-${levelClass} border-3 ps-3 mb-2">
                <div class="debug-entry-header">
                    <span class="badge bg-${levelClass} me-2">${entry.level.toUpperCase()}</span>
                    <strong>${entry.type}</strong>
                    ${hostnameText}
                    <small class="text-muted ms-auto">${timestamp}</small>
                </div>
                <div class="debug-entry-content text-break">
                    ${entry.message}
                </div>
            </div>`;
    }).join('');
    
    container.innerHTML = entriesHtml;
    container.scrollTop = container.scrollHeight;
}

// Update debug statistics
function updateDebugStats() {
    initializeDebugTab();
    
    document.getElementById('operationsCount').textContent = debugStats.operationsCount;
    document.getElementById('commandsExecuted').textContent = debugStats.commandsExecuted;
    document.getElementById('errorsCount').textContent = debugStats.errorsCount;
}

// Update debug tab badge
function updateDebugTabBadge() {
    const badge = document.getElementById('debugTabCount');
    if (badge) {
        badge.textContent = debugEntries.length;
    }
}

// Clear debug log
function clearDebugLog() {
    debugEntries = [];
    debugStats.errorsCount = 0;
    updateDebugLogDisplay();
    updateDebugStats();
    updateDebugTabBadge();
    addToDebugLog('System', 'Debug log cleared', 'info');
}

// Export debug log
function exportDebugLog() {
    const exportData = {
        exportTime: new Date().toISOString(),
        stats: debugStats,
        entries: debugEntries
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `debug-log-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    URL.revokeObjectURL(url);
    addToDebugLog('System', 'Debug log exported', 'info');
}

// Command log functions
function loadCommandLog() {
    window.Utils.fetchWithTimeout('/api/command-log', {}, 10000)
        .then(window.Utils.checkResponse)
        .then(response => response.json())
        .then(data => {
            renderCommandLog(data.commands);
            updateCommandCount(data.count);
        })
        .catch(error => {
            console.error('Error loading command log:', error);
            addToDebugLog('System', `Error loading command log: ${error.message}`, 'error');
        });
}

function renderCommandLog(commands) {
    const container = document.getElementById('commandLogContainer');
    if (!container) return;
    
    if (!commands || commands.length === 0) {
        container.innerHTML = `
            <div class="text-center text-muted">
                <i class="fas fa-terminal fa-3x mb-3"></i>
                <p>No commands executed yet. Commands will appear here when you perform migrations.</p>
            </div>`;
        return;
    }
    
    const commandsHtml = commands.map(cmd => createCommandLogEntry(cmd)).join('');
    container.innerHTML = commandsHtml;
}

function createCommandLogEntry(cmd) {
    const timestamp = new Date(cmd.timestamp).toLocaleString();
    const statusClass = cmd.success === null ? 'preview' : (cmd.success ? 'success' : (cmd.type === 'timeout' ? 'timeout' : 'error'));
    const statusText = cmd.success === null ? 'preview' : (cmd.success ? 'success' : cmd.type);
    
    let output = '';
    if (cmd.type !== 'preview') {
        const outputText = cmd.stdout || cmd.stderr || 'No output';
        const outputClass = cmd.stderr ? 'error' : (outputText === 'No output' ? 'empty' : '');
        output = `
            <div class="command-output ${outputClass}">
                <pre>${outputText}</pre>
            </div>`;
    }
    
    return `
        <div class="command-entry mb-3">
            <div class="command-header">
                <span class="badge bg-${statusClass}">${statusText}</span>
                <span class="command-timestamp">${timestamp}</span>
                <span class="command-host">${cmd.hostname || 'N/A'}</span>
            </div>
            <div class="command-details">
                <strong>${cmd.command}</strong>
                ${output}
            </div>
        </div>`;
}

function clearCommandLog() {
    if (!confirm('Are you sure you want to clear the command log? This action cannot be undone.')) {
        return;
    }
    
    window.Utils.fetchWithTimeout('/api/clear-log', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        }
    }, 10000)
    .then(window.Utils.checkResponse)
    .then(response => response.json())
    .then(data => {
        window.Frontend.showNotification(data.message, 'success');
        loadCommandLog();
        loadResultsSummary();
    })
    .catch(error => {
        console.error('Error clearing command log:', error);
        window.Frontend.showNotification('Error clearing command log', 'danger');
        addToDebugLog('System', `Error clearing command log: ${error.message}`, 'error');
    });
}

function updateCommandCount(count) {
    const badge = document.getElementById('commandCount');
    if (badge) {
        badge.textContent = count;
        badge.classList.add('updated');
    }
    setTimeout(() => badge.classList.remove('updated'), 500);
}

function loadResultsSummary() {
    window.Utils.fetchWithTimeout('/api/command-log', {}, 10000)
        .then(window.Utils.checkResponse)
        .then(response => response.json())
        .then(data => {
            renderResultsSummary(data.commands);
        })
        .catch(error => {
            console.error('Error loading results summary:', error);
            addToDebugLog('System', `Error loading results summary: ${error.message}`, 'error');
        });
}

function renderResultsSummary(commands) {
    if (!commands) return;
    
    const stats = {
        successful: commands.filter(cmd => cmd.success === true).length,
        failed: commands.filter(cmd => cmd.success === false).length,
        preview: commands.filter(cmd => cmd.success === null).length,
        total: commands.length
    };
    
    document.getElementById('successCount').textContent = stats.successful;
    document.getElementById('errorCount').textContent = stats.failed;
    document.getElementById('previewCount').textContent = stats.preview;
    document.getElementById('totalCount').textContent = stats.total;
    
    // Show recent results
    const recentResults = commands.slice(-10).reverse();
    const recentResultsList = document.getElementById('recentResultsList');
    
    if (recentResults.length === 0) {
        recentResultsList.innerHTML = `
            <div class="text-center text-muted">
                <i class="fas fa-chart-line fa-3x mb-3"></i>
                <p>No results yet. Execute some commands to see results here.</p>
            </div>`;
        return;
    }
    
    const resultsHtml = recentResults.map(cmd => {
        const statusClass = cmd.success === null ? 'secondary' : (cmd.success ? 'success' : 'danger');
        const statusIcon = cmd.success === null ? 'fas fa-eye' : (cmd.success ? 'fas fa-check' : 'fas fa-times');
        
        return `
            <div class="result-item border-start border-${statusClass} border-3 ps-3 mb-2">
                <div class="d-flex justify-content-between align-items-start">
                    <div>
                        <i class="${statusIcon} text-${statusClass} me-2"></i>
                        <strong>${cmd.hostname || 'N/A'}</strong>
                        <small class="text-muted ms-2">${window.Utils.formatDate(cmd.timestamp)}</small>
                    </div>
                    <span class="badge bg-${statusClass}">${cmd.success === null ? 'preview' : (cmd.success ? 'success' : 'failed')}</span>
                </div>
                <div class="command-text text-truncate text-muted mt-1">
                    ${cmd.command}
                </div>
            </div>`;
    }).join('');
    
    recentResultsList.innerHTML = resultsHtml;
}

// Export logging functions
window.Logs = {
    initializeDebugTab,
    addToDebugLog,
    updateDebugLogDisplay,
    updateDebugStats,
    updateDebugTabBadge,
    clearDebugLog,
    exportDebugLog,
    loadCommandLog,
    renderCommandLog,
    createCommandLogEntry,
    clearCommandLog,
    updateCommandCount,
    loadResultsSummary,
    renderResultsSummary,
    
    // Debug stats access
    getDebugStats: () => debugStats,
    incrementOperationsCount: () => debugStats.operationsCount++,
    incrementCommandsExecuted: () => debugStats.commandsExecuted++
};