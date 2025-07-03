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

## Installation

1. Install dependencies:
```bash
pip install -r requirements.txt
```

2. Make sure OpenStack CLI is configured and accessible:
```bash
openstack aggregate list
```

3. Run the application:
```bash
python app.py
```

4. Access the web interface at `http://localhost:5000`

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

## Requirements

- Python 3.6+
- Flask
- OpenStack CLI configured and accessible
- Network access to OpenStack API