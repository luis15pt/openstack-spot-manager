# OpenStack Spot Manager - Development Guidelines

## Project Overview
Enterprise-grade OpenStack infrastructure management system with GPU resource optimization, multi-cloud integration (OpenStack, Hyperstack, RunPod), and real-time monitoring capabilities.

**Note: This development server has no access to OpenStack infrastructure - it's for code development and testing only.**

## Architecture Analysis

### Core Strengths
- **Parallel Agents System**: Innovative 4-agent concurrent data collection reducing API latency from ~300s to ~30s
- **Multi-level Caching**: Intelligent TTL-based caching across NetBox, OpenStack aggregates, and parallel data
- **Modular Design**: Clean separation of concerns with dedicated modules for specialized functionality
- **Performance-First Approach**: Comprehensive performance tracking and optimization

### System Components

#### Backend Architecture
```
app.py (Entry point)
├── app_routes.py (Route handlers)
├── app_business_logic.py (Core business logic)
└── modules/
    ├── parallel_agents.py (4-agent concurrent data collection)
    ├── aggregate_operations.py (OpenStack aggregate management)
    ├── openstack_operations.py (SDK operations)
    ├── host_operations.py (Host-specific operations)
    ├── netbox_operations.py (NetBox API integration)
    └── utility_functions.py (Shared utilities)
```

#### Frontend Architecture
```
static/
├── frontend.js (UI rendering & state management)
├── openstack.js (Migration operations)
├── cache-manager.js (Cache management)
├── customer-view.js (Customer interface)
├── utils.js (Shared utilities)
└── logs.js (Debug logging system)
```

## Development Guidelines

### 1. Performance Standards
- **Parallel Execution Required**: Use ThreadPoolExecutor for any operation touching >5 hosts
- **Cache Everything**: Implement caching for any data that doesn't change in <60 seconds
- **Performance Logging**: All major operations must log timing metrics
- **Target Response Times**: API calls <5s, bulk operations <30s

### 2. Error Handling Patterns
```python
# Required pattern for all external API calls
try:
    result = external_api_call()
except Exception as e:
    print(f"❌ Operation failed: {e}")
    return fallback_or_default_value
```

### 3. Caching Strategy
- **NetBox Data**: 30 minutes TTL (changes infrequently)
- **OpenStack Aggregates**: 1 hour TTL (administrative changes)
- **Parallel Agents Data**: 1-60 seconds TTL (real-time accuracy)
- **VM/Host Data**: Real-time (no caching for accuracy)

### 4. Code Organization Rules

#### Module Responsibilities
- **`parallel_agents.py`**: Concurrent data collection only
- **`aggregate_operations.py`**: OpenStack aggregate CRUD operations
- **`host_operations.py`**: Individual host operations (VMs, details)
- **`openstack_operations.py`**: Core OpenStack SDK connection management
- **`utility_functions.py`**: Shared utilities (logging, formatting, validation)

#### Frontend Module Responsibilities
- **`frontend.js`**: UI rendering, DOM manipulation, state management
- **`openstack.js`**: Migration operations, aggregate management
- **`utils.js`**: HTTP utilities, common functions
- **`logs.js`**: Debug logging, performance monitoring

### 5. API Design Standards
```python
# Standard API response format
return jsonify({
    'success': True/False,
    'data': actual_data,
    'error': error_message_if_any,
    'metadata': {
        'timestamp': current_time,
        'execution_time': elapsed_time
    }
})
```

### 6. Security Requirements
- **Never log credentials**: Use `mask_api_key()` for any credential logging
- **Validate all inputs**: Check all user inputs before processing
- **Environment-based config**: All credentials in environment variables
- **Error message sanitization**: Don't expose sensitive information in errors

### 7. Logging Standards
```python
# Required logging format
print(f"🚀 Operation: {operation_name}")
print(f"📊 Results: {summary_stats}")
print(f"⏱️ Time: {elapsed_time:.2f}s")
print(f"✅ Success" if success else f"❌ Failed: {error}")
```

## Testing Guidelines (TODO - High Priority)

### Required Test Coverage
- [ ] Unit tests for all utility functions
- [ ] Integration tests for OpenStack operations
- [ ] Performance tests for parallel agents
- [ ] Security tests for API endpoints
- [ ] End-to-end tests for critical workflows

### Test Structure
```
tests/
├── unit/
│   ├── test_parallel_agents.py
│   ├── test_openstack_operations.py
│   └── test_utility_functions.py
├── integration/
│   ├── test_api_endpoints.py
│   └── test_cache_behavior.py
└── performance/
    └── test_parallel_performance.py
```

## Performance Monitoring

### Key Metrics to Track
- **Parallel Agent Performance**: Total time, hosts/second, speedup factor
- **Cache Hit Rates**: For each cache layer
- **API Response Times**: Per endpoint
- **Error Rates**: Failed operations percentage

### Current Performance Targets
- **Parallel Data Collection**: <30s for 100+ hosts
- **Individual Host Operations**: <5s
- **Cache Refresh**: <60s for full system
- **Migration Operations**: <10s per host

## Common Patterns

### 1. Parallel Execution Pattern
```python
with ThreadPoolExecutor(max_workers=4) as executor:
    futures = {
        'task1': executor.submit(function1),
        'task2': executor.submit(function2)
    }
    
    results = {}
    for name, future in futures.items():
        try:
            results[name] = future.result()
        except Exception as e:
            print(f"❌ {name} failed: {e}")
            results[name] = default_value
```

### 2. Cache-First Pattern
```python
# Check cache first
if cache_key in cache and is_cache_valid(cache_key):
    return cache[cache_key]

# Fetch fresh data
data = expensive_operation()
cache[cache_key] = data
return data
```

### 3. Retry Pattern
```python
for attempt in range(max_retries):
    try:
        return operation()
    except Exception as e:
        if attempt < max_retries - 1:
            time.sleep(retry_delay * (2 ** attempt))  # Exponential backoff
            continue
        raise e
```

## Debugging Guidelines

### Debug Modes
- **Parallel Agents**: Reduce `PARALLEL_CACHE_TTL` to 1 for real-time debugging
- **Frontend**: Enable `DEBUG_MODE = true` in JavaScript
- **API Calls**: Use `print_debug=True` for request/response logging

### Common Issues & Solutions

#### Cache Issues
- **Symptom**: Stale data showing in UI
- **Solution**: Restart application or call `/api/clear-cache`
- **Prevention**: Monitor cache age in logs

#### Performance Issues
- **Symptom**: Slow API responses
- **Solution**: Check parallel agent performance logs
- **Prevention**: Monitor thread pool utilization

#### Data Inconsistency
- **Symptom**: Different data in main view vs. detail modal
- **Solution**: Check cache TTL settings and API call patterns
- **Prevention**: Use consistent data sources

## Contribution Guidelines

### Before Making Changes
1. **Understand the parallel agents system** - it's the core performance optimization
2. **Check existing caching** - don't break the cache hierarchy
3. **Test with real data** - this system manages production infrastructure
4. **Monitor performance impact** - maintain sub-30s response times

### Code Review Requirements
- [ ] Performance impact assessed
- [ ] Error handling implemented
- [ ] Logging added for major operations
- [ ] Cache behavior considered
- [ ] Security implications reviewed

### Deployment Checklist
- [ ] Revert debug cache TTL settings to production values (600s)
- [ ] Test with production-scale data
- [ ] Verify OpenStack connection stability
- [ ] Monitor initial performance metrics
- [ ] Check error logs for any issues

## Future Architecture Considerations

### Scalability Improvements
- **Database Layer**: Add PostgreSQL/Redis for local caching
- **WebSocket Integration**: Real-time updates instead of polling
- **Microservices**: Split into specialized services as scale increases
- **Container Orchestration**: Kubernetes deployment for high availability

### Security Enhancements
- **Authentication**: Add user authentication and RBAC
- **Audit Trail**: Enhanced operation logging
- **Rate Limiting**: API protection against abuse
- **Secret Management**: Dedicated secret management system

### Monitoring & Observability
- **Metrics**: Prometheus integration for system metrics
- **Tracing**: Distributed tracing for complex operations
- **Alerting**: Automated alerts for system issues
- **Dashboards**: Grafana dashboards for operational visibility

---

## Quick Reference

### Essential Commands
```bash
# Clear all caches
curl -X POST http://localhost:8080/api/clear-cache

# Check cache statistics
curl http://localhost:8080/api/cache-stats

# Force refresh specific GPU type
curl "http://localhost:8080/api/aggregates/H100?force_refresh=true"
```

### Performance Tuning
```python
# For debugging - reduce cache TTL
PARALLEL_CACHE_TTL = 1

# For production - optimize cache TTL
PARALLEL_CACHE_TTL = 600
```

### Debug Logging
```javascript
// Enable frontend debugging
window.DEBUG_MODE = true;
```

This codebase represents a sophisticated infrastructure management system with enterprise-grade performance optimizations. Maintain the high standards of performance, error handling, and monitoring when contributing.

## Code Quality Review & Recommendations

### 🔴 **Critical Issues**

#### Security Concerns
1. **Shell Command Injection Risk** (`app_business_logic.py:370`, `modules/openstack_operations.py`)
   - Using `subprocess.run(shell=True)` with potentially user-controlled input
   - **Fix**: Use parameterized commands or validate/sanitize input strictly

2. **API Key Logging Risk** (`app_business_logic.py:355`)
   - The `mask_api_key()` function exists but may not cover all logging scenarios
   - **Fix**: Audit all logging to ensure no API keys are exposed

### 🟡 **Code Quality Improvements**

#### Code Duplication & Organization
1. **Duplicate Functions** 
   - `get_host_gpu_info_with_debug()` exists in both `app_business_logic.py` and `modules/host_operations.py`
   - `get_host_vm_count_with_debug()` also duplicated
   - **Fix**: Consolidate into one location, preferably in modules

2. **Exception Handling Pattern** (96 occurrences)
   - Generic `except Exception as e:` throughout codebase
   - **Fix**: Use specific exception types where possible

3. **Large Functions**
   - `modules/parallel_agents.py` has very long functions (1500+ lines file)
   - **Fix**: Break into smaller, focused functions

#### Frontend Issues
1. **Console Logging** (514 occurrences across JS files)
   - Extensive `console.log/error/warn` usage in production code
   - **Fix**: Implement proper logging system for production

2. **Global Variables**
   - Many global variables in JavaScript files
   - **Fix**: Encapsulate in modules/namespaces

### 🟢 **Unused Code to Remove**

#### Potentially Unused Functions
1. **Debug Functions** - Both `*_with_debug()` versions appear to only be used internally within bulk operations
   - Consider if debug versions are still needed
   
2. **Legacy Code Check Needed**
   - The codebase shows signs of evolution, should audit for unused imports

### 🔵 **Architectural Recommendations**

#### Code Organization
1. **Module Structure**
   - Good separation of concerns in `modules/` directory
   - Consider moving business logic functions from `app_business_logic.py` to appropriate modules

2. **Configuration Management**
   - ✅ Good use of environment variables for API keys
   - Consider centralizing configuration in a config module

3. **Error Handling**
   - Implement centralized error handling/logging
   - Use custom exception classes for better error differentiation

#### Performance Optimizations
1. **Caching Strategy**
   - `cache-manager.js` exists, ensure it's being used effectively
   - Consider adding caching to expensive OpenStack operations

2. **Parallel Processing**
   - ✅ Good use of `ThreadPoolExecutor` in bulk operations
   - `modules/parallel_agents.py` shows sophisticated parallel processing

### 📊 **Codebase Statistics**
- **Total LOC**: ~15,495 lines
- **Largest files**: 
  - `static/script.js` (2,573 lines)
  - `static/frontend.js` (2,234 lines) 
  - `app_routes.py` (1,935 lines)
  - `modules/parallel_agents.py` (1,595 lines)

### 🎯 **Priority Actions**

#### High Priority
1. **Fix shell injection security risk** - Critical security vulnerability
2. **Remove duplicate functions** - Code maintainability issue
3. **Reduce console.log usage in production** - Performance and security concern

#### Medium Priority  
1. **Implement proper error handling patterns** - Use specific exceptions
2. **Break up large functions** - Improve maintainability
3. **Audit and remove unused code** - Reduce technical debt

#### Low Priority
1. **Improve code documentation** - Add docstrings and comments
2. **Standardize naming conventions** - Consistency across codebase
3. **Add type hints to Python functions** - Better IDE support and validation

### 📋 **Code Quality Checklist for Future Changes**

Before submitting code changes, ensure:
- [ ] No use of `subprocess.run(shell=True)` without input sanitization
- [ ] No duplicate function definitions across modules
- [ ] Production code has minimal console.log statements
- [ ] Specific exception types used instead of generic `Exception`
- [ ] Functions are under 100 lines where possible
- [ ] All sensitive data is properly masked in logs
- [ ] New code follows existing architectural patterns
- [ ] Performance impact has been considered