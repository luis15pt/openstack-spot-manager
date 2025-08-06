# API Documentation - OpenStack Spot Manager

This document provides comprehensive documentation for all REST API endpoints available in the OpenStack Spot Manager.

## Base URL

All API endpoints are relative to the base URL of your deployment:
```
http://localhost:6969/api/
```

## Authentication

The API uses environment-based authentication for external services. No authentication is required for API endpoints as the application manages OpenStack, NetBox, and Hyperstack credentials internally.

## Response Format

All API responses follow a consistent JSON format:

### Success Response
```json
{
  "status": "success",
  "data": {...},
  "message": "Operation completed successfully"
}
```

### Error Response
```json
{
  "status": "error",
  "error": "Error description",
  "details": {...}
}
```

## Core Data Endpoints

### GET /api/gpu-types
Returns available GPU types and their aggregate configurations.

**Response:**
```json
{
  "status": "success",
  "data": [
    {
      "name": "L40",
      "display_name": "L40",
      "aggregates": {
        "ondemand": ["L40-n3", "L40-n3-NVLink"],
        "spot": ["L40-n3-spot"],
        "runpod": ["L40-n3-runpod"],
        "contracts": ["Contract-L40-Customer1"]
      }
    }
  ]
}
```

### GET /api/aggregates/{gpu_type}
Get all aggregate data for a specific GPU type.

**Parameters:**
- `gpu_type` (string): GPU type (e.g., "L40", "RTX-A6000", "A100", "H100")

**Response:**
```json
{
  "status": "success",
  "data": {
    "ondemand": {
      "name": "L40-n3",
      "hosts": [...],
      "gpu_summary": {
        "gpu_used": 24,
        "gpu_capacity": 80,
        "gpu_usage_ratio": "24/80",
        "gpu_usage_percentage": 30
      },
      "variants": [...]
    },
    "spot": {...},
    "runpod": {...},
    "gpu_overview": {
      "gpu_usage_ratio": "156/320",
      "gpu_usage_percentage": 48.75
    }
  }
}
```

### GET /api/aggregates/{gpu_type}/{aggregate_type}
Get specific aggregate data.

**Parameters:**
- `gpu_type` (string): GPU type
- `aggregate_type` (string): "ondemand", "spot", or "runpod"

**Response:**
```json
{
  "status": "success",
  "data": {
    "name": "L40-n3-spot",
    "hosts": [
      {
        "hostname": "gpu-host-001",
        "status": "active",
        "vm_count": 2,
        "gpu_used": 8,
        "gpu_capacity": 8,
        "has_vms": true,
        "tenant": "nexgen-cloud",
        "owner_group": "Nexgen Cloud"
      }
    ],
    "gpu_summary": {...}
  }
}
```

### GET /api/contract-aggregates/{gpu_type}
Get contract aggregates for specific GPU type with detailed host information.

**Parameters:**
- `gpu_type` (string): GPU type

**Response:**
```json
{
  "status": "success",
  "data": [
    {
      "aggregate": "Contract-L40-Customer1",
      "hosts": [...],
      "gpu_summary": {...},
      "tenant_info": {
        "primary_tenant": "customer1",
        "owner_group": "Investors"
      }
    }
  ]
}
```

### GET /api/host-vms/{hostname}
Get VMs running on specific host.

**Parameters:**
- `hostname` (string): Host name

**Response:**
```json
{
  "status": "success",
  "data": {
    "hostname": "gpu-host-001",
    "vms": [
      {
        "id": "vm-uuid-123",
        "name": "instance-001",
        "status": "ACTIVE",
        "flavor": "n3-RTX-A6000x4",
        "tenant": "customer-tenant",
        "created": "2024-01-15T10:30:00Z"
      }
    ],
    "total_vms": 1
  }
}
```

## Migration Operations

### POST /api/preview-migration
Preview host migration commands without execution.

**Request Body:**
```json
{
  "host": "gpu-host-001",
  "source_aggregate": "L40-n3",
  "target_aggregate": "L40-n3-spot"
}
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "commands": [
      "openstack aggregate remove host L40-n3 gpu-host-001",
      "openstack aggregate add host L40-n3-spot gpu-host-001"
    ],
    "validation": {
      "source_exists": true,
      "target_exists": true,
      "host_in_source": true
    }
  }
}
```

### POST /api/execute-migration
Execute host migration between aggregates.

**Request Body:**
```json
{
  "host": "gpu-host-001",
  "source_aggregate": "L40-n3",
  "target_aggregate": "L40-n3-spot"
}
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "host": "gpu-host-001",
    "source_aggregate": "L40-n3",
    "target_aggregate": "L40-n3-spot",
    "commands_executed": [
      "openstack aggregate remove host L40-n3 gpu-host-001",
      "openstack aggregate add host L40-n3-spot gpu-host-001"
    ],
    "execution_time": "2.3s"
  }
}
```

### POST /api/get-target-aggregate
Determine optimal target aggregate for host.

**Request Body:**
```json
{
  "hostname": "gpu-host-001",
  "gpu_type": "L40"
}
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "hostname": "gpu-host-001",
    "recommended_aggregate": "L40-n3-spot",
    "reasoning": "Host has no running VMs, suitable for spot aggregate"
  }
}
```

## RunPod/Hyperstack Integration

### POST /api/preview-runpod-launch
Preview VM launch command.

**Request Body:**
```json
{
  "hostname": "gpu-host-001",
  "image_name": "RunPod Ubuntu 22.04",
  "image_id": "img-123456"
}
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "command": "curl -X POST 'https://infrahub-api.nexgencloud.com/v1/core/virtual-machines' ...",
    "masked_command": "curl -X POST ... -H 'api-key: ****'",
    "estimated_resources": {
      "flavor": "n3-L40-8",
      "gpu_count": 8
    }
  }
}
```

### POST /api/execute-runpod-launch
Execute RunPod VM launch via Hyperstack API.

**Request Body:**
```json
{
  "hostname": "gpu-host-001",
  "image_name": "RunPod Ubuntu 22.04",
  "image_id": "img-123456"
}
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "vm_id": "vm-789abc",
    "hostname": "gpu-host-001",
    "image_name": "RunPod Ubuntu 22.04",
    "status": "BUILDING",
    "flavor": "n3-L40-8",
    "network_setup": true,
    "firewall_configured": true
  }
}
```

## OpenStack Network Operations

### POST /api/openstack/network/show
Show OpenStack network details.

**Request Body:**
```json
{
  "network_name": "storage-network"
}
```

### POST /api/openstack/port/create
Create network port.

**Request Body:**
```json
{
  "network_id": "net-123",
  "port_name": "storage-port-001"
}
```

### POST /api/openstack/server/add-network
Add network to server.

**Request Body:**
```json
{
  "server_uuid": "server-123",
  "port_id": "port-456"
}
```

### POST /api/openstack/server/get-uuid
Get server UUID.

**Request Body:**
```json
{
  "server_name": "gpu-host-001"
}
```

### POST /api/openstack/server/status
Get server status.

**Request Body:**
```json
{
  "server_uuid": "server-123"
}
```

## Hyperstack Firewall Management

### POST /api/hyperstack/firewall/get-attachments
Get firewall attachments.

**Request Body:**
```json
{
  "firewall_id": "971"
}
```

### POST /api/hyperstack/firewall/update-attachments
Update firewall attachments.

**Request Body:**
```json
{
  "firewall_id": "971",
  "vm_ids": ["vm-123", "vm-456"]
}
```

### GET /api/hyperstack/images
Get available Hyperstack images.

**Query Parameters:**
- `region` (optional): Filter by region

**Response:**
```json
{
  "status": "success",
  "data": [
    {
      "id": "img-123",
      "name": "Ubuntu 22.04 LTS",
      "region": "canada-1",
      "size": "10GB",
      "type": "runpod"
    }
  ]
}
```

## Logging and Monitoring

### GET /api/command-log
Get command execution log.

**Response:**
```json
{
  "status": "success",
  "data": [
    {
      "timestamp": "2024-01-15T10:30:00Z",
      "command": "openstack aggregate add host L40-n3-spot gpu-host-001",
      "status": "success",
      "execution_time": "1.2s",
      "user": "system"
    }
  ]
}
```

### POST /api/clear-log
Clear command log.

**Response:**
```json
{
  "status": "success",
  "message": "Command log cleared successfully"
}
```

## Error Codes

| HTTP Status | Error Code | Description |
|-------------|------------|-------------|
| 400 | Bad Request | Invalid parameters or request format |
| 404 | Not Found | Resource not found (host, aggregate, etc.) |
| 500 | Internal Server Error | OpenStack API error or system failure |
| 503 | Service Unavailable | External service (NetBox, Hyperstack) unavailable |

## Rate Limiting

The API implements internal rate limiting for external service calls:
- OpenStack API: No built-in limits (respects OpenStack quotas)
- NetBox API: Cached responses for 5 minutes
- Hyperstack API: Respects provider rate limits

## Examples

### Complete Migration Workflow
```bash
# 1. Preview migration
curl -X POST http://localhost:6969/api/preview-migration \
  -H "Content-Type: application/json" \
  -d '{
    "host": "gpu-host-001",
    "source_aggregate": "L40-n3",
    "target_aggregate": "L40-n3-spot"
  }'

# 2. Execute migration
curl -X POST http://localhost:6969/api/execute-migration \
  -H "Content-Type: application/json" \
  -d '{
    "host": "gpu-host-001",
    "source_aggregate": "L40-n3",
    "target_aggregate": "L40-n3-spot"
  }'
```

### RunPod Launch Workflow
```bash
# 1. Get available images
curl http://localhost:6969/api/hyperstack/images

# 2. Preview launch
curl -X POST http://localhost:6969/api/preview-runpod-launch \
  -H "Content-Type: application/json" \
  -d '{
    "hostname": "gpu-host-001",
    "image_name": "RunPod Ubuntu 22.04",
    "image_id": "img-123456"
  }'

# 3. Execute launch
curl -X POST http://localhost:6969/api/execute-runpod-launch \
  -H "Content-Type: application/json" \
  -d '{
    "hostname": "gpu-host-001",
    "image_name": "RunPod Ubuntu 22.04",
    "image_id": "img-123456"
  }'
```

## SDK Integration

The API is designed to work with the OpenStack SDK and external service APIs. All operations are idempotent where possible, and the system handles connection failures gracefully.

For more information about the underlying architecture, see [ARCHITECTURE.md](ARCHITECTURE.md).