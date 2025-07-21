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
    
    const commandsHtml = commands.map((cmd, index) => createCommandLogEntry(cmd, index)).join('');
    container.innerHTML = commandsHtml;
}

function createCommandLogEntry(cmd, index) {
    const timestamp = new Date(cmd.timestamp).toLocaleString();
    const statusClass = cmd.success === null ? 'preview' : (cmd.success ? 'success' : (cmd.type === 'timeout' ? 'timeout' : 'error'));
    const statusText = cmd.success === null ? 'PREVIEW' : (cmd.success ? 'SUCCESS' : cmd.type.toUpperCase());
    const statusIcon = cmd.success === null ? 'fas fa-eye' : 
                       (cmd.success ? 'fas fa-check-circle' : 
                        (cmd.type === 'timeout' ? 'fas fa-clock' : 'fas fa-exclamation-circle'));
    const cardClass = cmd.success === null ? 'border-info' : 
                      (cmd.success ? 'border-success' : 
                       (cmd.type === 'timeout' ? 'border-warning' : 'border-danger'));
    
    // Create collapsed unique ID for this command
    const commandId = `cmd-log-${index}-${Date.now()}`;
    
    let output = '';
    if (cmd.type !== 'preview') {
        const outputText = cmd.stdout || cmd.stderr || 'No output';
        const outputClass = cmd.stderr ? 'command-error-output' : 'command-success-output';
        output = `
            <div class="command-actual-output mt-2">
                <strong class="text-primary">Output:</strong>
                <div class="${outputClass} bg-dark text-light p-2 rounded small mt-1" style="font-family: monospace; white-space: pre-wrap;">${outputText}</div>
            </div>`;
    }
    
    return `
        <div class="command-log-card card mb-3 ${cardClass}">
            <div class="card-header bg-light">
                <div class="d-flex justify-content-between align-items-center">
                    <div class="d-flex align-items-center">
                        <button class="btn btn-sm btn-outline-secondary me-2" 
                                onclick="toggleCommandLogCollapse('${commandId}')" 
                                id="collapse-btn-${commandId}"
                                title="Expand/Collapse command details">
                            <i class="fas fa-chevron-down"></i>
                        </button>
                        <div>
                            <span class="badge bg-${statusClass} me-2">
                                <i class="${statusIcon} me-1"></i>
                                ${statusText}
                            </span>
                            <strong>${cmd.command.substring(0, 60)}${cmd.command.length > 60 ? '...' : ''}</strong>
                        </div>
                    </div>
                    <div class="text-end">
                        <small class="text-muted d-block">${timestamp}</small>
                        <small class="text-muted">${cmd.hostname || 'N/A'}</small>
                    </div>
                </div>
            </div>
            <div class="card-body collapse" id="command-body-${commandId}">
                <div class="command-details">
                    <div class="mb-2">
                        <strong class="text-primary">Full Command:</strong>
                        <div class="bg-dark text-light p-2 rounded small mt-1" style="font-family: monospace; white-space: pre-wrap;">${cmd.command}</div>
                    </div>
                    ${output}
                </div>
            </div>
        </div>`;
}

function toggleCommandLogCollapse(commandId) {
    const body = document.getElementById(`command-body-${commandId}`);
    const btn = document.getElementById(`collapse-btn-${commandId}`);
    const icon = btn.querySelector('i');
    
    if (body && btn) {
        body.classList.toggle('show');
        
        if (body.classList.contains('show')) {
            icon.className = 'fas fa-chevron-up';
        } else {
            icon.className = 'fas fa-chevron-down';
        }
    }
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
    
    // Update session analytics  
    const operationsElement = document.getElementById('operationsCount');
    if (operationsElement) operationsElement.textContent = debugStats.operationsCount;
    
    const commandsElement = document.getElementById('commandsExecuted');
    if (commandsElement) commandsElement.textContent = debugStats.commandsExecuted;
    
    const errorRateElement = document.getElementById('errorRate');
    if (errorRateElement) {
        const errorRate = stats.total > 0 ? Math.round((stats.failed / stats.total) * 100) : 0;
        errorRateElement.textContent = `${errorRate}%`;
    }
    
    // Initialize session start time if not set
    const sessionStartElement = document.getElementById('sessionStartTime');
    if (sessionStartElement && sessionStartElement.textContent === 'Loading...') {
        sessionStartElement.textContent = new Date().toLocaleString();
    }
    
    // Skip recent results list since it doesn't exist in the new Analytics tab structure
    return;
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
    toggleCommandLogCollapse,
    clearCommandLog,
    updateCommandCount,
    loadResultsSummary,
    renderResultsSummary,
    
    // Debug stats access
    getDebugStats: () => debugStats,
    incrementOperationsCount: () => debugStats.operationsCount++,
    incrementCommandsExecuted: () => debugStats.commandsExecuted++
};

// Analytics and export functions
function exportCommandLog() {
    window.Utils.fetchWithTimeout('/api/command-log', {}, 10000)
        .then(window.Utils.checkResponse)
        .then(response => response.json())
        .then(data => {
            const blob = new Blob([JSON.stringify(data.commands, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = `command-log-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            
            URL.revokeObjectURL(url);
            addToDebugLog('System', 'Command log exported successfully', 'info');
        })
        .catch(error => {
            console.error('Error exporting command log:', error);
            addToDebugLog('System', `Error exporting command log: ${error.message}`, 'error');
        });
}

function exportAnalytics() {
    const stats = debugStats;
    const analyticsData = {
        session_start: document.getElementById('sessionStartTime')?.textContent || 'N/A',
        statistics: {
            successful: parseInt(document.getElementById('successCount')?.textContent || '0'),
            failed: parseInt(document.getElementById('errorCount')?.textContent || '0'),
            previewed: parseInt(document.getElementById('previewCount')?.textContent || '0'),
            total: parseInt(document.getElementById('totalCount')?.textContent || '0'),
            error_rate: document.getElementById('errorRate')?.textContent || '0%'
        },
        session_analytics: {
            operations_executed: stats.operationsCount,
            commands_executed: stats.commandsExecuted,
            errors_count: stats.errorsCount
        },
        export_timestamp: new Date().toISOString()
    };
    
    const blob = new Blob([JSON.stringify(analyticsData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `analytics-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    URL.revokeObjectURL(url);
    addToDebugLog('System', 'Analytics exported successfully', 'info');
}

function resetSessionStats() {
    if (!confirm('Are you sure you want to reset session statistics? This action cannot be undone.')) {
        return;
    }
    
    // Reset debug stats
    debugStats.operationsCount = 0;
    debugStats.commandsExecuted = 0;
    debugStats.errorsCount = 0;
    
    // Reset display elements
    const elements = ['successCount', 'errorCount', 'previewCount', 'totalCount'];
    elements.forEach(id => {
        const element = document.getElementById(id);
        if (element) element.textContent = '0';
    });
    
    const errorRateElement = document.getElementById('errorRate');
    if (errorRateElement) errorRateElement.textContent = '0%';
    
    const operationsElement = document.getElementById('operationsCount');
    if (operationsElement) operationsElement.textContent = '0';
    
    const commandsElement = document.getElementById('commandsExecuted');
    if (commandsElement) commandsElement.textContent = '0';
    
    // Update session start time
    const sessionStartElement = document.getElementById('sessionStartTime');
    if (sessionStartElement) sessionStartElement.textContent = new Date().toLocaleString();
    
    updateDebugStats();
    addToDebugLog('System', 'Session statistics reset successfully', 'info');
}

// Also make functions available globally for HTML onclick
window.toggleCommandLogCollapse = toggleCommandLogCollapse;
window.exportCommandLog = exportCommandLog;
window.exportAnalytics = exportAnalytics;
window.resetSessionStats = resetSessionStats;