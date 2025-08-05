#!/usr/bin/env python3

import re
from datetime import datetime

def extract_gpu_count_from_flavor(flavor_name):
    """Extract GPU count from flavor name like 'n3-RTX-A6000x8' or 'n3-RTX-A6000x1-spot'"""
    if not flavor_name or flavor_name == 'N/A':
        return 0
    
    # Pattern to match GPU count from flavor names like n3-RTX-A6000x8, n3-RTX-A6000x1-spot
    match = re.search(r'x(\d+)', flavor_name)
    if match:
        return int(match.group(1))
    return 0

def get_gpu_type_from_aggregate(aggregate_name):
    """Extract GPU type from aggregate name like 'RTX-A6000-n3-runpod' -> 'RTX-A6000'"""
    if not aggregate_name:
        return None
    
    match = re.match(r'^([A-Z0-9-]+)-n3', aggregate_name)
    if match:
        return match.group(1)
    return None

def get_gpu_count_from_hostname(hostname):
    """Determine GPU count from hostname - A4000 hosts have 10, others have 8"""
    if 'A4000' in hostname:
        return 10
    return 8

def mask_api_key(api_key, prefix=""):
    """Mask API key for display purposes"""
    if not api_key:
        return "***_KEY"
    
    if len(api_key) <= 8:
        return "***_KEY"
    
    return f"{api_key[:4]}***{api_key[-4:]}"

# Global command log storage (will be moved here from app.py)
command_log = []

def log_command(command, result, execution_type='executed'):
    """Log command execution with timestamp and result"""
    global command_log
    
    log_entry = {
        'id': len(command_log) + 1,
        'timestamp': datetime.now().isoformat(),
        'command': command,
        'type': execution_type,
        'success': result.get('success', False),
        'stdout': result.get('stdout', ''),
        'stderr': result.get('stderr', ''),
        'returncode': result.get('returncode', -1)
    }
    
    command_log.append(log_entry)
    
    # Keep only last 100 entries
    if len(command_log) > 100:
        command_log = command_log[-100:]

# Define aggregate pairs - multiple on-demand variants share one spot aggregate
AGGREGATE_PAIRS = {
    'L40': {
        'spot': 'L40-n3-spot',
        'ondemand_variants': [
            {'aggregate': 'L40-n3', 'variant': 'L40-n3'}
        ]
    },
    'RTX-A6000': {
        'spot': 'RTX-A6000-n3-spot', 
        'ondemand_variants': [
            {'aggregate': 'RTX-A6000-n3', 'variant': 'RTX-A6000-n3'}
        ]
    },
    'A100': {
        'spot': 'A100-n3-spot',
        'ondemand_variants': [
            {'aggregate': 'A100-n3', 'variant': 'A100-n3'},
            {'aggregate': 'A100-n3-NVLink', 'variant': 'A100-n3-NVLink'}
        ]
    },
    'H100': {
        'spot': 'H100-n3-spot',
        'ondemand_variants': [
            {'aggregate': 'H100-n3', 'variant': 'H100-n3'},
            {'aggregate': 'H100-n3-NVLink', 'variant': 'H100-n3-NVLink'}
        ]
    }
}