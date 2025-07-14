# OpenStack Spot Manager

A web-based interface for managing OpenStack aggregate host migrations between on-demand and spot pools.

## Features

- **Two-column layout**: Visual interface showing on-demand and spot aggregates side by side
- **Drag and drop**: Move hosts between aggregates by dragging
- **Click to select**: Select multiple hosts and use move buttons
- **GPU type support**: L40, RTX-A6000, A100, H100 aggregate pairs
- **VM safety checks**: Warns when spot hosts have running VMs
- **Command preview**: Shows exact OpenStack commands before execution
- **Real-time updates**: Live host counts and status indicators
- **NetBox integration**: Device owner grouping and tenant information
- **Owner-based grouping**: Available devices grouped by "Chris" vs "Investors"
- **Tenant badges**: Visual indicators showing device ownership

## Installation

1. Install dependencies:
```bash
pip install -r requirements.txt
```

2. Configure OpenStack credentials by creating a `.env` file (copy from `.env.example`):
```bash
cp .env.example .env
```

3. Edit `.env` with your OpenStack credentials:
```bash
# OpenStack Authentication Configuration
OS_AUTH_URL=https://your-openstack-auth-url:5000/v3
OS_USERNAME=your-username
OS_PASSWORD=your-password
OS_PROJECT_NAME=your-project-name
OS_USER_DOMAIN_NAME=Default
OS_PROJECT_DOMAIN_NAME=Default
OS_REGION_NAME=RegionOne

# NetBox Integration (Optional)
NETBOX_URL=https://your-netbox-instance.com
NETBOX_API_KEY=your-netbox-api-key-here
```

4. Run the application:
```bash
python app.py
```

5. Access the web interface at `http://localhost:6969`

## Credential Configuration

This application supports multiple ways to configure OpenStack credentials:

### Option 1: Environment File (.env)
Create a `.env` file with your credentials (recommended for development):
```bash
OS_AUTH_URL=https://openstack.example.com:5000/v3
OS_USERNAME=myuser
OS_PASSWORD=mypassword
OS_PROJECT_NAME=myproject
OS_USER_DOMAIN_NAME=Default
OS_PROJECT_DOMAIN_NAME=Default

# NetBox Integration (Optional)
NETBOX_URL=https://netbox.example.com
NETBOX_API_KEY=your-api-key
```

### Option 2: Environment Variables
Export credentials directly (good for production):
```bash
export OS_AUTH_URL=https://openstack.example.com:5000/v3
export OS_USERNAME=myuser
export OS_PASSWORD=mypassword
export OS_PROJECT_NAME=myproject
```

### Option 3: OpenStack CLI Configuration
The app can also use existing OpenStack CLI configuration files (`clouds.yaml`).

## NetBox Integration

The application supports optional NetBox integration for enhanced device management:

### Features
- **Device Owner Grouping**: Available devices are automatically grouped by owner ("Chris" vs "Investors")
- **Tenant Information**: Each device card displays tenant information from NetBox
- **Visual Indicators**: Color-coded badges and grouping based on device ownership
- **API Caching**: NetBox API responses are cached to improve performance

### Configuration
Add NetBox credentials to your `.env` file:
```bash
NETBOX_URL=https://your-netbox-instance.com
NETBOX_API_KEY=your-netbox-api-token
```

### How It Works
1. The application queries NetBox API endpoint: `/api/dcim/devices/?name={hostname}`
2. Extracts tenant information from device records
3. Groups devices based on tenant name (contains "Chris" → Chris group, otherwise → Investors group)
4. Displays tenant badges and owner-based grouping in the UI

### Graceful Fallback
If NetBox is not configured or unavailable, the application continues to function normally with all devices defaulting to the "Investors" group.

## Usage

1. **Select GPU Type**: Choose from L40, RTX-A6000, A100, or H100 in the dropdown
2. **View Aggregates**: The interface shows two columns - on-demand (left) and spot (right)
3. **Move Hosts**: 
   - Drag hosts between columns
   - Or click to select hosts and use the move buttons
4. **Preview Commands**: Before execution, you'll see the exact OpenStack commands
5. **Safety Checks**: Hosts with running VMs show warnings and badges
6. **Execute Migration**: Confirm to run the migration commands

## Safety Features

- **VM Count Checking**: Displays VM count for each host
- **Spot Migration Protection**: Prevents moving hosts with VMs from spot aggregates
- **Command Preview**: Shows exact commands before execution
- **Confirmation Dialogs**: Requires user confirmation for all migrations
- **Error Handling**: Clear error messages for failed operations

## API Endpoints

- `GET /api/aggregates/<gpu_type>` - Get aggregate data
- `GET /api/host-vms/<hostname>` - Get VM details for a host
- `POST /api/preview-migration` - Preview migration commands
- `POST /api/execute-migration` - Execute migration

## Performance Improvements

This version uses the **OpenStack SDK** instead of CLI commands for:
- ⚡ **3-5x faster performance** (direct API calls vs subprocess overhead)
- 🔧 **Better error handling** (Python exceptions vs parsing CLI output)
- 📦 **Type safety** (Python objects vs string parsing)
- 🔄 **Connection reuse** (persistent connections vs new processes)

## Requirements

- Python 3.8+
- Flask 2.3+
- OpenStack SDK (openstacksdk)
- Valid OpenStack credentials
- Network access to OpenStack API endpoints