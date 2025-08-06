# Deployment Guide - OpenStack Spot Manager

This comprehensive guide covers everything needed to deploy, configure, and maintain the OpenStack Spot Manager in development and production environments.

## Table of Contents

1. [Prerequisites and System Requirements](#prerequisites-and-system-requirements)
2. [Installation Instructions](#installation-instructions)
3. [Configuration Setup](#configuration-setup)
4. [Deployment Options](#deployment-options)
5. [Testing and Verification](#testing-and-verification)
6. [Troubleshooting](#troubleshooting)
7. [Maintenance and Monitoring](#maintenance-and-monitoring)

## Prerequisites and System Requirements

### Hardware Requirements

**Minimum Requirements:**
- CPU: 2 cores
- RAM: 4GB
- Storage: 2GB free space
- Network: Reliable internet connection

**Recommended for Production:**
- CPU: 4+ cores
- RAM: 8GB+
- Storage: 10GB+ free space
- Network: High bandwidth for OpenStack API calls

### Software Requirements

**Operating System:**
- Linux (Ubuntu 20.04+, CentOS 8+, RHEL 8+)
- macOS 10.15+
- Windows 10+ (with WSL2 recommended)

**Core Dependencies:**
- Python 3.8 or higher
- pip (Python package installer)
- git
- curl (for testing)

**Python Dependencies:**
```
Flask==2.3.3
Werkzeug==2.3.7
openstacksdk==3.3.0
python-dotenv==1.0.0
requests==2.31.0
```

### OpenStack Environment Requirements

**Required OpenStack Services:**
- Nova Compute API
- Keystone Identity API
- Properly configured host aggregates

**Required Aggregates Pattern:**
Your OpenStack environment must have aggregates following these naming patterns:
- **Regular aggregates**: `{GPU_TYPE}-n3[-NVLink][-spot|-runpod]`
  - Examples: `L40-n3`, `L40-n3-NVLink`, `L40-n3-spot`, `RTX-A6000-n3-runpod`
- **Contract aggregates**: `Contract-{NAME}`
  - Examples: `Contract-L40-Customer1`, `Contract-RTX-A6000-Enterprise`

**Supported GPU Types:**
- L40
- RTX-A6000  
- A100
- H100

## Installation Instructions

### 1. Clone the Repository

```bash
# Clone from GitHub
git clone https://github.com/your-org/openstack-spot-manager.git
cd openstack-spot-manager

# Or download and extract ZIP
wget https://github.com/your-org/openstack-spot-manager/archive/main.zip
unzip main.zip
cd openstack-spot-manager-main
```

### 2. Create Virtual Environment

```bash
# Create virtual environment
python3 -m venv venv

# Activate virtual environment
# On Linux/macOS:
source venv/bin/activate

# On Windows:
# venv\Scripts\activate
```

### 3. Install Dependencies

```bash
# Upgrade pip
pip install --upgrade pip

# Install required packages
pip install -r requirements.txt

# Verify installation
pip list
```

### 4. Verify Installation

```bash
# Check Python version
python --version
# Should output: Python 3.8+ 

# Check Flask installation
python -c "import flask; print(f'Flask {flask.__version__} installed')"

# Check OpenStack SDK
python -c "import openstack; print(f'OpenStack SDK {openstack.__version__} installed')"
```

## Configuration Setup

### 1. Environment Variables

Create a `.env` file in the project root directory:

```bash
# Create environment file
cp .env.example .env

# Edit with your configuration
nano .env
```

### 2. Required OpenStack Configuration

Add these required environment variables to your `.env` file:

```bash
# OpenStack Authentication (Required)
OS_AUTH_URL=https://your-openstack.com:5000/v3
OS_USERNAME=your-username
OS_PASSWORD=your-password
OS_PROJECT_NAME=your-project-name
OS_USER_DOMAIN_NAME=Default
OS_PROJECT_DOMAIN_NAME=Default
OS_REGION_NAME=RegionOne
OS_INTERFACE=public
OS_IDENTITY_API_VERSION=3
```

### 3. Optional Integrations

Add these optional configurations for enhanced functionality:

```bash
# NetBox Integration (Optional - for tenant management)
NETBOX_URL=https://your-netbox.com
NETBOX_API_KEY=your-netbox-api-token

# Hyperstack/RunPod Integration (Optional - for VM deployment)
HYPERSTACK_API_URL=https://infrahub-api.nexgencloud.com/v1
HYPERSTACK_API_KEY=your-hyperstack-api-key
RUNPOD_API_KEY=your-runpod-api-key

# Hyperstack Firewall Configuration
HYPERSTACK_FIREWALL_CA1_ID=971
```

### 4. Application Configuration

```bash
# Application Settings
FLASK_ENV=development
FLASK_DEBUG=True
PORT=6969

# Logging Configuration
LOG_LEVEL=INFO
LOG_FILE=openstack_manager.log
```

### 5. Environment File Security

```bash
# Secure the environment file
chmod 600 .env

# Verify permissions
ls -la .env
# Should show: -rw------- 1 user user
```

### Example Complete .env File

```bash
# OpenStack Authentication
OS_AUTH_URL=https://openstack.example.com:5000/v3
OS_USERNAME=admin
OS_PASSWORD=secure_password_here
OS_PROJECT_NAME=admin
OS_USER_DOMAIN_NAME=Default
OS_PROJECT_DOMAIN_NAME=Default
OS_REGION_NAME=RegionOne
OS_INTERFACE=public
OS_IDENTITY_API_VERSION=3

# Optional NetBox Integration
NETBOX_URL=https://netbox.example.com
NETBOX_API_KEY=abc123def456ghi789

# Optional RunPod/Hyperstack Integration
HYPERSTACK_API_URL=https://infrahub-api.nexgencloud.com/v1
RUNPOD_API_KEY=your-runpod-key-here
HYPERSTACK_API_KEY=your-hyperstack-key-here
HYPERSTACK_FIREWALL_CA1_ID=971

# Application Settings
FLASK_ENV=production
PORT=6969
LOG_LEVEL=INFO
```

## Deployment Options

### Development Deployment

#### Quick Start (Development)

```bash
# Activate virtual environment
source venv/bin/activate

# Run development server
python app.py
```

The application will be available at `http://localhost:6969`

#### Development with Auto-reload

```bash
# Set development environment
export FLASK_ENV=development
export FLASK_DEBUG=True

# Run with auto-reload
python app.py
```

### Production Deployment

#### Option 1: Gunicorn (Recommended)

**Install Gunicorn:**
```bash
pip install gunicorn
```

**Create Gunicorn Configuration:**
```bash
# Create gunicorn.conf.py
cat > gunicorn.conf.py << 'EOF'
# Server socket
bind = "0.0.0.0:6969"
backlog = 2048

# Worker processes
workers = 4
worker_class = "sync"
worker_connections = 1000
timeout = 30
keepalive = 2

# Restart workers after this many requests, to help prevent memory leaks
max_requests = 1000
max_requests_jitter = 100

# Logging
errorlog = "-"
loglevel = "info"
accesslog = "-"
access_log_format = '%(h)s %(l)s %(u)s %(t)s "%(r)s" %(s)s %(b)s "%(f)s" "%(a)s"'

# Process naming
proc_name = 'openstack-spot-manager'

# Server mechanics
daemon = False
pidfile = '/tmp/gunicorn.pid'
user = None
group = None
tmp_upload_dir = None

# Preload app for better performance
preload_app = True
EOF
```

**Run with Gunicorn:**
```bash
# Run Gunicorn with configuration file
gunicorn -c gunicorn.conf.py app:app

# Or run with inline parameters
gunicorn -w 4 -b 0.0.0.0:6969 --timeout 30 app:app
```

#### Option 2: systemd Service

**Create systemd service file:**
```bash
sudo tee /etc/systemd/system/openstack-spot-manager.service > /dev/null << 'EOF'
[Unit]
Description=OpenStack Spot Manager
After=network.target

[Service]
Type=notify
User=www-data
Group=www-data
WorkingDirectory=/opt/openstack-spot-manager
Environment=PATH=/opt/openstack-spot-manager/venv/bin
EnvironmentFile=/opt/openstack-spot-manager/.env
ExecStart=/opt/openstack-spot-manager/venv/bin/gunicorn -c gunicorn.conf.py app:app
ExecReload=/bin/kill -s HUP $MAINPID
KillMode=mixed
TimeoutStopSec=5
PrivateTmp=true
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
```

**Enable and start service:**
```bash
# Install application to /opt
sudo cp -r . /opt/openstack-spot-manager
sudo chown -R www-data:www-data /opt/openstack-spot-manager

# Reload systemd and start service
sudo systemctl daemon-reload
sudo systemctl enable openstack-spot-manager
sudo systemctl start openstack-spot-manager

# Check status
sudo systemctl status openstack-spot-manager
```

#### Option 3: Docker Deployment

**Create Dockerfile:**
```dockerfile
FROM python:3.9-slim

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create non-root user
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

# Expose port
EXPOSE 6969

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:6969/health || exit 1

# Run application
CMD ["gunicorn", "-w", "4", "-b", "0.0.0.0:6969", "app:app"]
```

**Create docker-compose.yml:**
```yaml
version: '3.8'

services:
  openstack-manager:
    build: .
    ports:
      - "6969:6969"
    env_file:
      - .env
    volumes:
      - ./logs:/app/logs
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:6969/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  # Optional: Nginx reverse proxy
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./ssl:/etc/nginx/ssl:ro
    depends_on:
      - openstack-manager
    restart: unless-stopped
```

**Build and run:**
```bash
# Build and start
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

#### Option 4: Nginx Reverse Proxy

**Create nginx configuration:**
```bash
sudo tee /etc/nginx/sites-available/openstack-spot-manager << 'EOF'
server {
    listen 80;
    server_name your-domain.com;

    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    # SSL Configuration
    ssl_certificate /path/to/ssl/certificate.crt;
    ssl_certificate_key /path/to/ssl/private.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512;

    # Security headers
    add_header X-Content-Type-Options nosniff;
    add_header X-Frame-Options DENY;
    add_header X-XSS-Protection "1; mode=block";

    # Proxy settings
    location / {
        proxy_pass http://127.0.0.1:6969;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # WebSocket support
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Static files
    location /static/ {
        alias /opt/openstack-spot-manager/static/;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Health check endpoint
    location /health {
        access_log off;
        proxy_pass http://127.0.0.1:6969;
    }
}
EOF

# Enable site
sudo ln -s /etc/nginx/sites-available/openstack-spot-manager /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### Kubernetes Deployment

**Create Kubernetes manifests:**

**Namespace:**
```yaml
# namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: openstack-manager
```

**ConfigMap and Secret:**
```yaml
# config.yaml
apiVersion: v1
kind: Secret
metadata:
  name: openstack-credentials
  namespace: openstack-manager
type: Opaque
stringData:
  OS_AUTH_URL: "https://your-openstack.com:5000/v3"
  OS_USERNAME: "your-username"
  OS_PASSWORD: "your-password"
  OS_PROJECT_NAME: "your-project"
  NETBOX_API_KEY: "your-netbox-key"
  HYPERSTACK_API_KEY: "your-hyperstack-key"
  RUNPOD_API_KEY: "your-runpod-key"
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: openstack-config
  namespace: openstack-manager
data:
  OS_USER_DOMAIN_NAME: "Default"
  OS_PROJECT_DOMAIN_NAME: "Default"
  OS_REGION_NAME: "RegionOne"
  OS_INTERFACE: "public"
  OS_IDENTITY_API_VERSION: "3"
  FLASK_ENV: "production"
  PORT: "6969"
```

**Deployment:**
```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: openstack-manager
  namespace: openstack-manager
spec:
  replicas: 3
  selector:
    matchLabels:
      app: openstack-manager
  template:
    metadata:
      labels:
        app: openstack-manager
    spec:
      containers:
      - name: openstack-manager
        image: openstack-spot-manager:latest
        ports:
        - containerPort: 6969
        envFrom:
        - configMapRef:
            name: openstack-config
        - secretRef:
            name: openstack-credentials
        resources:
          limits:
            memory: "1Gi"
            cpu: "500m"
          requests:
            memory: "512Mi"
            cpu: "250m"
        livenessProbe:
          httpGet:
            path: /health
            port: 6969
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 6969
          initialDelaySeconds: 5
          periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: openstack-manager-service
  namespace: openstack-manager
spec:
  selector:
    app: openstack-manager
  ports:
  - protocol: TCP
    port: 80
    targetPort: 6969
  type: ClusterIP
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: openstack-manager-ingress
  namespace: openstack-manager
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
spec:
  rules:
  - host: openstack-manager.your-domain.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: openstack-manager-service
            port:
              number: 80
```

**Deploy to Kubernetes:**
```bash
# Apply manifests
kubectl apply -f namespace.yaml
kubectl apply -f config.yaml
kubectl apply -f deployment.yaml

# Check deployment
kubectl get pods -n openstack-manager
kubectl get services -n openstack-manager

# View logs
kubectl logs -f deployment/openstack-manager -n openstack-manager
```

## Testing and Verification

### 1. Basic Connectivity Tests

**Test OpenStack Connection:**
```bash
# Test OpenStack authentication
python -c "
import os
from dotenv import load_dotenv
load_dotenv()

import openstack
conn = openstack.connect()
print('✅ OpenStack connection successful')
print(f'Connected to: {conn.auth.get_auth_ref().service_catalog.get_endpoints()[\"identity\"][0][\"url\"]}')
"
```

**Test Web Interface:**
```bash
# Start application
python app.py &

# Test home page
curl -I http://localhost:6969/
# Should return: HTTP/1.1 200 OK

# Test API endpoint
curl http://localhost:6969/api/gpu-types
# Should return JSON with GPU types

# Stop application
pkill -f "python app.py"
```

### 2. API Endpoint Testing

**Test GPU Types API:**
```bash
curl -s http://localhost:6969/api/gpu-types | jq '.'
```

**Test Aggregate Data:**
```bash
# Replace L40 with an available GPU type
curl -s http://localhost:6969/api/aggregates/L40 | jq '.status'
```

**Test Migration Preview:**
```bash
curl -X POST http://localhost:6969/api/preview-migration \
  -H "Content-Type: application/json" \
  -d '{
    "host": "test-host",
    "source_aggregate": "L40-n3",
    "target_aggregate": "L40-n3-spot"
  }' | jq '.'
```

### 3. Integration Testing

**Test NetBox Integration (if configured):**
```bash
python -c "
import os
import requests
from dotenv import load_dotenv

load_dotenv()
netbox_url = os.getenv('NETBOX_URL')
netbox_key = os.getenv('NETBOX_API_KEY')

if netbox_url and netbox_key:
    response = requests.get(f'{netbox_url}/api/dcim/devices/?limit=1', 
                          headers={'Authorization': f'Token {netbox_key}'})
    print(f'✅ NetBox connection: {response.status_code}')
else:
    print('ℹ️ NetBox not configured')
"
```

**Test Hyperstack Integration (if configured):**
```bash
python -c "
import os
import requests
from dotenv import load_dotenv

load_dotenv()
hyperstack_url = os.getenv('HYPERSTACK_API_URL', 'https://infrahub-api.nexgencloud.com/v1')
hyperstack_key = os.getenv('HYPERSTACK_API_KEY')

if hyperstack_key:
    response = requests.get(f'{hyperstack_url}/core/images', 
                          headers={'api-key': hyperstack_key})
    print(f'✅ Hyperstack connection: {response.status_code}')
else:
    print('ℹ️ Hyperstack not configured')
"
```

### 4. Load Testing

**Install load testing tools:**
```bash
pip install locust
```

**Create load test script:**
```python
# locustfile.py
from locust import HttpUser, task, between

class OpenStackManagerUser(HttpUser):
    wait_time = between(1, 3)
    
    @task(3)
    def view_home_page(self):
        self.client.get("/")
    
    @task(2)
    def get_gpu_types(self):
        self.client.get("/api/gpu-types")
    
    @task(1)
    def get_aggregate_data(self):
        # Use actual GPU type from your environment
        self.client.get("/api/aggregates/L40")
```

**Run load test:**
```bash
# Run load test with 10 users
locust -f locustfile.py --host=http://localhost:6969 -u 10 -r 2 -t 60s --headless
```

### 5. Automated Testing Script

**Create comprehensive test script:**
```bash
#!/bin/bash
# test_deployment.sh

set -e

echo "🧪 Starting OpenStack Spot Manager deployment tests..."

# Test 1: Environment validation
echo "📋 Testing environment configuration..."
python -c "
import os
from dotenv import load_dotenv
load_dotenv()

required_vars = ['OS_AUTH_URL', 'OS_USERNAME', 'OS_PASSWORD', 'OS_PROJECT_NAME']
missing_vars = [var for var in required_vars if not os.getenv(var)]

if missing_vars:
    print(f'❌ Missing required environment variables: {missing_vars}')
    exit(1)
else:
    print('✅ All required environment variables present')
"

# Test 2: OpenStack connectivity
echo "🔌 Testing OpenStack connectivity..."
python -c "
import openstack
try:
    conn = openstack.connect()
    aggregates = list(conn.compute.aggregates())
    print(f'✅ OpenStack connection successful - found {len(aggregates)} aggregates')
except Exception as e:
    print(f'❌ OpenStack connection failed: {e}')
    exit(1)
"

# Test 3: Start application
echo "🚀 Starting application..."
python app.py &
APP_PID=$!
sleep 5

# Test 4: Web interface
echo "🌐 Testing web interface..."
if curl -s -f http://localhost:6969/ > /dev/null; then
    echo "✅ Web interface accessible"
else
    echo "❌ Web interface not accessible"
    kill $APP_PID
    exit 1
fi

# Test 5: API endpoints
echo "🔗 Testing API endpoints..."
if curl -s -f http://localhost:6969/api/gpu-types > /dev/null; then
    echo "✅ API endpoints accessible"
else
    echo "❌ API endpoints not accessible"
    kill $APP_PID
    exit 1
fi

# Cleanup
kill $APP_PID
echo "✅ All tests passed! Deployment is ready."
```

**Make executable and run:**
```bash
chmod +x test_deployment.sh
./test_deployment.sh
```

## Troubleshooting

### Common Issues and Solutions

#### 1. OpenStack Connection Issues

**Issue:** `Connection refused` or `Authentication failed`

**Solutions:**
```bash
# Check environment variables
env | grep OS_

# Test OpenStack CLI
openstack --os-cloud default aggregate list

# Verify network connectivity
curl -I $OS_AUTH_URL

# Check credentials
python -c "
import openstack
try:
    conn = openstack.connect()
    print('Connection successful')
    print(f'Token: {conn.auth.get_token()[:20]}...')
except Exception as e:
    print(f'Connection failed: {e}')
"
```

#### 2. Missing GPU Aggregates

**Issue:** `No GPU types found` or empty aggregate lists

**Solutions:**
```bash
# List all aggregates in OpenStack
openstack aggregate list

# Check aggregate naming patterns
openstack aggregate list | grep -E "(L40|RTX|A100|H100)"

# Verify aggregate metadata
openstack aggregate show AGGREGATE_NAME
```

**Expected aggregate patterns:**
- `L40-n3`, `L40-n3-NVLink`, `L40-n3-spot`, `L40-n3-runpod`
- `RTX-A6000-n3`, `RTX-A6000-n3-spot`
- `Contract-CustomerName-L40`

#### 3. Permission Denied Errors

**Issue:** `403 Forbidden` or permission errors

**Solutions:**
```bash
# Check OpenStack project permissions
openstack role assignment list --user $OS_USERNAME --project $OS_PROJECT_NAME

# Verify required roles (usually admin or member)
openstack role list

# Test specific operations
openstack aggregate list
openstack server list --all-tenants
```

#### 4. NetBox Integration Problems

**Issue:** NetBox API errors or timeouts

**Solutions:**
```bash
# Test NetBox connectivity
curl -H "Authorization: Token $NETBOX_API_KEY" "$NETBOX_URL/api/dcim/devices/?limit=1"

# Check API key permissions
curl -H "Authorization: Token $NETBOX_API_KEY" "$NETBOX_URL/api/users/me/"

# Verify NetBox URL format (should include /api/)
echo $NETBOX_URL  # Should be: https://netbox.example.com (without /api/)
```

#### 5. Port Already in Use

**Issue:** `Address already in use` on port 6969

**Solutions:**
```bash
# Find process using port 6969
sudo netstat -tlnp | grep :6969
# or
sudo ss -tlnp | grep :6969

# Kill process using the port
sudo kill -9 PID_NUMBER

# Use different port
export PORT=7000
python app.py
```

#### 6. Memory or Performance Issues

**Issue:** High memory usage or slow response times

**Solutions:**
```bash
# Monitor resource usage
top -p $(pgrep -f "python app.py")

# Reduce worker processes
gunicorn -w 2 -b 0.0.0.0:6969 app:app

# Enable garbage collection
export PYTHONUNBUFFERED=1
python app.py

# Check for memory leaks
pip install memory_profiler
python -m memory_profiler app.py
```

### Debug Mode and Logging

**Enable debug logging:**
```bash
# Set debug environment variables
export FLASK_ENV=development
export FLASK_DEBUG=True
export LOG_LEVEL=DEBUG

# Run with debug output
python app.py
```

**View application logs:**
```bash
# View real-time logs
tail -f openstack_manager.log

# Search for errors
grep -i error openstack_manager.log

# View API request logs
grep -i "api/" openstack_manager.log
```

### Health Check Script

**Create health check script:**
```bash
#!/bin/bash
# health_check.sh

set -e

echo "🏥 OpenStack Spot Manager Health Check"
echo "======================================"

# Check process
if pgrep -f "python app.py" > /dev/null; then
    echo "✅ Application process running"
else
    echo "❌ Application process not found"
    exit 1
fi

# Check web interface
if curl -s -f http://localhost:6969/health > /dev/null 2>&1; then
    echo "✅ Web interface responding"
else
    echo "❌ Web interface not responding"
    exit 1
fi

# Check OpenStack connectivity
if python -c "import openstack; openstack.connect().compute.aggregates().__next__()" 2>/dev/null; then
    echo "✅ OpenStack connectivity working"
else
    echo "❌ OpenStack connectivity failed"
    exit 1
fi

echo "✅ All health checks passed"
```

## Maintenance and Monitoring

### 1. Log Management

**Configure log rotation:**
```bash
# Create logrotate configuration
sudo tee /etc/logrotate.d/openstack-spot-manager << 'EOF'
/opt/openstack-spot-manager/openstack_manager.log {
    daily
    missingok
    rotate 52
    compress
    delaycompress
    notifempty
    create 0644 www-data www-data
    postrotate
        systemctl reload openstack-spot-manager
    endscript
}
EOF
```

**Monitor logs in real-time:**
```bash
# Follow application logs
tail -f openstack_manager.log

# Monitor for errors
tail -f openstack_manager.log | grep -i error

# Monitor API requests
tail -f openstack_manager.log | grep "api/"
```

### 2. Health Monitoring

**Create monitoring script:**
```bash
#!/bin/bash
# monitor.sh

HEALTH_URL="http://localhost:6969/health"
ALERT_EMAIL="admin@example.com"

while true; do
    if ! curl -s -f $HEALTH_URL > /dev/null; then
        echo "ALERT: OpenStack Spot Manager is not responding" | \
            mail -s "OpenStack Manager Down" $ALERT_EMAIL
        
        # Attempt restart
        systemctl restart openstack-spot-manager
        sleep 60
    fi
    
    sleep 30
done
```

**Add to crontab:**
```bash
# Run monitoring script
crontab -e

# Add line:
@reboot /opt/scripts/monitor.sh &
```

### 3. Prometheus Metrics Integration

**Add metrics endpoint to Flask app:**
```python
# Add to app.py
from prometheus_client import Counter, Histogram, generate_latest, CONTENT_TYPE_LATEST

# Metrics
REQUEST_COUNT = Counter('openstack_manager_requests_total', 'Total requests', ['method', 'endpoint'])
REQUEST_DURATION = Histogram('openstack_manager_request_duration_seconds', 'Request duration')

@app.route('/metrics')
def metrics():
    return generate_latest(), 200, {'Content-Type': CONTENT_TYPE_LATEST}
```

**Configure Prometheus:**
```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'openstack-spot-manager'
    static_configs:
      - targets: ['localhost:6969']
    metrics_path: '/metrics'
    scrape_interval: 30s
```

### 4. Backup and Recovery

**Backup configuration:**
```bash
#!/bin/bash
# backup.sh

BACKUP_DIR="/backup/openstack-spot-manager"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# Backup configuration
cp .env $BACKUP_DIR/.env_$DATE
cp gunicorn.conf.py $BACKUP_DIR/gunicorn.conf.py_$DATE

# Backup logs
cp openstack_manager.log $BACKUP_DIR/openstack_manager.log_$DATE

# Create archive
tar czf $BACKUP_DIR/backup_$DATE.tar.gz -C $BACKUP_DIR .env_$DATE gunicorn.conf.py_$DATE

echo "Backup created: $BACKUP_DIR/backup_$DATE.tar.gz"
```

### 5. Performance Tuning

**Optimize Gunicorn configuration:**
```python
# gunicorn.conf.py optimizations
import multiprocessing

# Calculate optimal worker count
workers = min(multiprocessing.cpu_count() * 2 + 1, 8)

# Memory optimization
max_requests = 1000
max_requests_jitter = 50

# Connection optimization
worker_connections = 1000
keepalive = 2

# Timeout optimization
timeout = 30
graceful_timeout = 30
```

**Database connection pooling (if using external DB):**
```python
# Add to app.py for database connections
from sqlalchemy.pool import QueuePool

engine = create_engine(
    DATABASE_URL,
    poolclass=QueuePool,
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True
)
```

### 6. Security Considerations

**Security checklist:**
- [ ] Environment variables secured (600 permissions on .env)
- [ ] HTTPS enabled in production
- [ ] Firewall configured (only necessary ports open)
- [ ] Regular security updates applied
- [ ] API keys rotated regularly
- [ ] Access logs monitored
- [ ] Rate limiting configured (if needed)

**Enable HTTPS:**
```bash
# Using Let's Encrypt with Certbot
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com

# Auto-renewal
sudo crontab -e
# Add: 0 12 * * * /usr/bin/certbot renew --quiet
```

### 7. Update and Upgrade Procedures

**Update application:**
```bash
#!/bin/bash
# update.sh

set -e

echo "🔄 Updating OpenStack Spot Manager..."

# Backup current version
cp -r /opt/openstack-spot-manager /opt/openstack-spot-manager.backup.$(date +%Y%m%d)

# Pull latest changes
cd /opt/openstack-spot-manager
git pull origin main

# Update dependencies
source venv/bin/activate
pip install -r requirements.txt

# Restart service
sudo systemctl restart openstack-spot-manager

# Verify update
sleep 10
curl -f http://localhost:6969/health

echo "✅ Update completed successfully"
```

**Database migrations (if applicable):**
```bash
# Run migrations
python migrate.py

# Verify migration
python -c "from app import verify_schema; verify_schema()"
```

This comprehensive deployment guide provides everything needed to successfully deploy and maintain the OpenStack Spot Manager in any environment. For additional support, refer to the troubleshooting section or create an issue in the project repository.