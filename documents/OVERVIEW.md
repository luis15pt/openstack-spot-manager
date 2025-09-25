# GRM - GPU Resource Manager

*The CRM for GPU Infrastructure*

## Purpose
GRM (GPU Resource Manager) is an enterprise-grade infrastructure management system that revolutionizes GPU resource allocation across multiple cloud providers. Like how CRM transformed customer relationship management, GRM provides unified real-time monitoring and management of GPU resources across OpenStack, RunPod, contract hardware, and other cloud platforms.

## Key Features

### 🖥️ **Multi-Cloud GPU Management**
- **OpenStack Integration**: Manage on-demand and spot GPU instances
- **RunPod Support**: Launch and monitor RunPod GPU instances
- **Contract Management**: Handle dedicated contract-based GPU resources
- **Real-time Monitoring**: Live GPU usage tracking across all platforms

### ⚡ **Performance Optimized**
- **Parallel Data Collection**: 4-agent concurrent system reduces load times from ~300s to ~30s
- **Smart Caching**: Multi-level TTL-based caching for instant data access
- **Drag & Drop Interface**: Intuitive host migration between aggregates
- **Live Updates**: Real-time status updates without page refreshes

### 📊 **Visual Dashboard**
- **Column-based Layout**: Organized by aggregate type (On-Demand, Spot, RunPod, Contract)
- **GPU Usage Visualization**: Progress bars and statistics for resource utilization
- **Host Grouping**: Automatic organization by GPU type and availability
- **Customer View**: Specialized interface for contract-based deployments

### 🔧 **Operational Tools**
- **Host Migration**: Move hosts between different aggregates with command preview
- **VM Management**: View and manage virtual machines on each host
- **Command Logging**: Complete audit trail of all operations
- **Batch Operations**: Execute multiple migrations simultaneously

### 🏢 **Enterprise Features**
- **NetBox Integration**: Sync with infrastructure documentation system
- **Contract Filtering**: Multi-tenant contract management
- **Debug Logging**: Comprehensive troubleshooting capabilities
- **Analytics Dashboard**: Performance metrics and usage statistics

## How It Works

1. **Data Collection**: Parallel agents gather data from OpenStack, NetBox, and cloud APIs
2. **Real-time Updates**: System continuously monitors GPU usage and host status
3. **Visual Management**: Drag and drop hosts between columns to trigger migrations
4. **Command Execution**: Preview and execute OpenStack commands with full logging
5. **Monitoring**: Track operations and performance through integrated dashboards

## Target Users
- **Cloud Infrastructure Teams**: Managing large-scale GPU deployments
- **DevOps Engineers**: Optimizing resource allocation and costs
- **System Administrators**: Monitoring and maintaining GPU clusters
- **Enterprise Customers**: Managing contract-based GPU resources

## Technical Stack
- **Backend**: Python with OpenStack SDK, NetBox API integration
- **Frontend**: Bootstrap 5, vanilla JavaScript with modular architecture
- **APIs**: RESTful endpoints for all operations
- **Caching**: Multi-level intelligent caching system
- **Performance**: Parallel processing with ThreadPoolExecutor

---

*GRM (GPU Resource Manager) revolutionizes GPU infrastructure management across multiple cloud platforms, providing enterprise-grade performance optimization and real-time monitoring capabilities. Just as CRM became essential for customer management, GRM is becoming the standard for GPU resource orchestration.*