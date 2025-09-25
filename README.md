# GRM - GPU Resource Manager

*The CRM for GPU Infrastructure*

A comprehensive web-based management platform for GPU compute resources across multiple cloud providers, providing unified control over OpenStack, RunPod, contract hardware, and multi-cloud resource management.

## Overview

GRM (GPU Resource Manager) is a Flask-based application that enables efficient management of GPU resources across multiple platforms and resource pools (OpenStack on-demand/spot, RunPod cloud instances, contract hardware). Like how CRM revolutionized customer management, GRM provides a unified interface for GPU infrastructure management with real-time monitoring, drag-and-drop operations, and automated resource optimization.

## Features

### Core Functionality
- **Multi-Platform GPU Management**: Unified interface for OpenStack, RunPod, and contract hardware
- **Real-time GPU Monitoring**: Track GPU utilization and VM counts across all platforms
- **Drag-and-Drop Operations**: Intuitive interface for resource migrations between pools
- **Modular Column System**: Clean, uniform layout with consistent spacing and headers
- **Contract Management**: Dedicated interface for multi-tenant contract hardware management
- **Background Data Loading**: Automatic preloading with intelligent multi-level caching

### Advanced Features
- **Intelligent Cache Updates**: Instant UI feedback - VM launches and host migrations appear immediately without waiting for cache expiry
- **RunPod Integration**: Deploy VMs directly to RunPod platform via Hyperstack API
- **NetBox Integration**: Automatic tenant and owner group classification
- **Parallel Data Collection**: 4-agent concurrent system reduces load times from ~300s to ~30s
- **Smart Caching**: Multi-level TTL-based caching with targeted updates
- **Bulk Operations**: Concurrent processing for large-scale operations
- **Command Logging**: Complete audit trail of all operations
- **Responsive Design**: Bootstrap-based UI that works on all devices

### Supported GPU Types
- **L40**: High-performance compute GPUs
- **RTX-A6000**: Professional workstation GPUs  
- **A100**: Data center AI/ML GPUs
- **H100**: Next-generation AI training GPUs

## Performance

### Intelligent Caching System
- **Parallel Data Collection**: 4-agent concurrent system processes 100+ hosts in ~30s vs previous ~300s
- **Smart Cache Updates**: VM launches and host migrations update cache instantly instead of waiting 10 minutes
- **Multi-Level TTL Caching**: NetBox (30min), Aggregates (1hr), Parallel data (10min) with targeted invalidation
- **Real-Time Feedback**: UI shows changes immediately without manual refresh

### Optimization Results
- **10x Faster**: Data collection optimized from 5+ minutes to <30 seconds
- **Instant Updates**: Operations appear in UI immediately vs 10-minute cache wait
- **Reduced API Load**: Intelligent caching minimizes redundant OpenStack API calls
- **Better UX**: No more "refresh and wait" - changes appear instantly

## Quick Start

### Prerequisites
- OpenStack environment with properly configured aggregates
- Python 3.8+ and pip
- Network access to OpenStack APIs

### Installation
```bash
# Clone the repository
git clone https://github.com/your-org/grm.git
cd grm

# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with your OpenStack credentials

# Run the application
python app.py
```

Navigate to `http://localhost:6969` to access the web interface.

## Documentation

- **[Deployment Guide](DEPLOYMENT_GUIDE.md)** - Complete setup and deployment instructions
- **[API Documentation](API_DOCUMENTATION.md)** - REST API endpoints and examples
- **[Architecture Overview](ARCHITECTURE.md)** - System design and component interactions
- **[Frontend Guide](FRONTEND_DOCUMENTATION.md)** - JavaScript modules and UI components

## Configuration

### Required Environment Variables
```bash
# OpenStack Authentication
OS_AUTH_URL=https://your-openstack.com:5000/v3
OS_USERNAME=your-username
OS_PASSWORD=your-password
OS_PROJECT_NAME=your-project
OS_USER_DOMAIN_NAME=Default
OS_PROJECT_DOMAIN_NAME=Default
```

### Optional Integrations
```bash
# NetBox DCIM Integration
NETBOX_URL=https://your-netbox.com
NETBOX_API_KEY=your-netbox-token

# RunPod/Hyperstack Integration
HYPERSTACK_API_KEY=your-hyperstack-key
RUNPOD_API_KEY=your-runpod-key
```

## Screenshots

### Main Dashboard
![Dashboard](docs/images/dashboard.png)
*Real-time GPU utilization across all resource pools*

### Host Migration
![Migration](docs/images/migration.png)
*Drag-and-drop host migration between aggregates*

### Contract Management
![Contract](docs/images/contract.png)
*Dedicated contract aggregate management interface*

## Architecture

The system consists of:
- **Flask Backend**: REST API server with OpenStack integration
- **JavaScript Frontend**: Responsive web interface with real-time updates
- **External Integrations**: OpenStack, NetBox, Hyperstack APIs
- **Background Processing**: Concurrent data loading and caching

## Development

### Local Development
```bash
# Run in development mode with auto-reload
export FLASK_ENV=development
python app.py
```

### Testing
```bash
# Run test suite
python -m pytest tests/

# Test specific components
python -m pytest tests/test_api.py
```

## Production Deployment

### Using Gunicorn
```bash
# Install Gunicorn
pip install gunicorn

# Run with Gunicorn
gunicorn -w 4 -b 0.0.0.0:6969 app:app
```

### Using Docker
```bash
# Build container
docker build -t grm .

# Run container
docker run -p 6969:6969 --env-file .env grm
```

See [Deployment Guide](DEPLOYMENT_GUIDE.md) for complete production setup instructions.

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Security

- All credentials are managed via environment variables
- API keys are masked in logs and UI
- Comprehensive input validation on all endpoints
- Secure session management

## Support

- **Issues**: Report issues on GitHub Issues
- **Discussions**: Community discussions on GitHub Discussions
- **Documentation**: Complete docs in the `/docs` directory

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- OpenStack SDK for cloud integration
- Bootstrap for responsive UI framework
- Font Awesome for icons and visual elements