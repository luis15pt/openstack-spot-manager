# OpenStack Spot Manager - Python Edition

This is the complete Python conversion of the OpenStack Spot Manager, now fully standalone and independent.

## What's Changed

✅ **Complete Python Implementation**: No dependencies on JavaScript or original Flask app
✅ **Standalone OpenStack Integration**: Direct OpenStack SDK calls
✅ **Real Data Support**: Works with your actual OpenStack environment
✅ **Demo Data Fallback**: Works without OpenStack for testing
✅ **All Original Features**: Host management, migrations, VM launches, analytics

## Setup Instructions

### 1. Install Dependencies
```bash
pip install -r requirements.txt
```

### 2. Configure OpenStack Environment
The app needs these environment variables to connect to OpenStack:

```bash
export OS_AUTH_URL="your-openstack-auth-url"
export OS_USERNAME="your-username"
export OS_PASSWORD="your-password"
export OS_PROJECT_NAME="your-project"
export OS_USER_DOMAIN_NAME="Default"
export OS_PROJECT_DOMAIN_NAME="Default"
export OS_REGION_NAME="RegionOne"
```

### 3. Run the Application
```bash
python3 app_python.py
```

The app will run on `http://localhost:6969`

## Features

### ✅ Works with Real OpenStack Data
When properly configured, displays:
- **Real GPU Types**: H100, A100, L40, RTX-A6000, H100-SXM5, etc.
- **Real Hosts**: Actual hosts from your OpenStack aggregates
- **Real VM Counts**: Current VM usage per host
- **Real GPU Usage**: GPU utilization statistics

### ✅ Demo Mode for Testing
Without OpenStack credentials, shows:
- **Demo GPU Types**: A100, H100, RTX-A6000, V100
- **Demo Hosts**: Simulated hosts with realistic stats
- **Demo Usage**: Sample GPU usage data

### ✅ All Original Features
- **Host Management**: Move hosts between spot/ondemand/runpod
- **VM Launches**: Deploy VMs via Hyperstack API
- **Analytics**: Session statistics and debug logging
- **Operations Queue**: Pending operations management

## Architecture

```
app_python.py           # Main Flask application
├── Standalone OpenStack Integration
├── GPU Aggregate Discovery
├── Host Information Retrieval
└── Web UI with Server-Side Rendering

modules/                # Python modules (converted from JavaScript)
├── utils.py           # HTTP utilities, status management
├── logs.py            # Debug logging, analytics
├── openstack.py       # OpenStack operations (legacy wrapper)
├── frontend.py        # UI generation helpers
├── hyperstack.py      # VM launch operations
└── script.py          # Main coordinator (legacy wrapper)

templates/
└── dashboard.html     # Updated template for Python integration
```

## Deployment

### Production Setup
1. Set OpenStack environment variables
2. Configure SSL termination (nginx/Apache)
3. Use production WSGI server (gunicorn)
4. Set `FLASK_DEBUG=False`

### Example Production Command
```bash
gunicorn -w 4 -b 0.0.0.0:6969 app_python:app
```

## Troubleshooting

### No GPU Types in Dropdown
- Check OpenStack environment variables are set
- Verify OpenStack connection in logs
- App will show demo data if OpenStack unavailable

### Empty Host Data
- Ensure user has admin privileges for `all_projects=True` queries
- Check aggregate names match expected patterns
- Monitor logs for OpenStack SDK errors

### Connection Issues
- Verify network connectivity to OpenStack endpoints
- Check firewall rules for API access
- Validate credentials and project permissions

## Migration from Original

The Python version is completely standalone:

1. **Stop original app**: `pkill -f app.py`
2. **Start Python app**: `python3 app_python.py`
3. **Same URL**: `http://localhost:6969`
4. **Same features**: All functionality preserved

## Development

### Adding New Features
1. Pure Python implementation (no JavaScript dependencies)
2. Use OpenStack SDK for API calls
3. Server-side rendering with Jinja2 templates
4. RESTful API endpoints for operations

### Testing
```bash
# Test with demo data (no OpenStack needed)
python3 app_python.py

# Test with real data (requires OpenStack env vars)
export OS_AUTH_URL=...
python3 app_python.py
```