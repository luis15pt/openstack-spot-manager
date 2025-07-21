// Hyperstack API operations for OpenStack Spot Manager
// Handles VM launches, networking, and firewall operations

// Execute RunPod VM launch
function executeRunpodLaunch(hostname) {
    return new Promise((resolve, reject) => {
        console.log(`🚀 Starting RunPod launch for ${hostname}`);
        window.Logs.addToDebugLog('Hyperstack', `Starting RunPod launch for ${hostname}`, 'info', hostname);
        
        // Preview first
        window.Utils.fetchWithTimeout('/api/preview-runpod-launch', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ hostname: hostname })
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
            
            // Execute the launch
            window.Utils.fetchWithTimeout('/api/execute-runpod-launch', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ hostname: hostname })
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
    console.log(`📋 Scheduling RunPod launch for ${hostname}`);
    window.Logs.addToDebugLog('Hyperstack', `Scheduling RunPod launch for ${hostname}`, 'info', hostname);
    
    // Get the host card to determine current state
    const hostCard = document.querySelector(`[data-host="${hostname}"]`);
    if (!hostCard) {
        console.error(`❌ Host card not found for ${hostname}`);
        window.Logs.addToDebugLog('Hyperstack', `Host card not found for ${hostname}`, 'error', hostname);
        window.Frontend.showNotification(`Host ${hostname} not found`, 'danger');
        return;
    }
    
    // Add RunPod launch operation (not a migration)
    window.Frontend.addRunPodLaunchOperation(hostname, {
        vm_name: hostname,
        flavor_name: 'default', // Should be determined based on host specs
        image_name: 'default',  // Should be determined based on requirements
        key_name: 'default',    // Should be determined based on user preferences
        manual: true,
        source: 'manual_launch'
    });
    
    console.log(`✅ RunPod launch scheduled for ${hostname}`);
    window.Logs.addToDebugLog('Hyperstack', `RunPod launch scheduled for ${hostname}`, 'success', hostname);
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
    "image_name": "Ubuntu 20.04 LTS",
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

// Export Hyperstack functions
window.Hyperstack = {
    executeRunpodLaunch,
    scheduleRunpodLaunch,
    generateRunpodLaunchCommands
};