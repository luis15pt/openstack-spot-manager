#!/usr/bin/env python3

import openstack
import subprocess
import os
from .utility_functions import log_command

# OpenStack connection - initialized lazily
_openstack_connection = None

def get_openstack_connection():
    """Get or create OpenStack connection"""
    global _openstack_connection
    if _openstack_connection is None:
        try:
            _openstack_connection = openstack.connect(
                auth_url=os.getenv('OS_AUTH_URL'),
                username=os.getenv('OS_USERNAME'),
                password=os.getenv('OS_PASSWORD'),
                project_name=os.getenv('OS_PROJECT_NAME'),
                user_domain_name=os.getenv('OS_USER_DOMAIN_NAME', 'Default'),
                project_domain_name=os.getenv('OS_PROJECT_DOMAIN_NAME', 'Default'),
                region_name=os.getenv('OS_REGION_NAME', 'RegionOne'),
                interface=os.getenv('OS_INTERFACE', 'public'),
                identity_api_version=os.getenv('OS_IDENTITY_API_VERSION', '3')
            )
            print("✅ OpenStack SDK connection established")
        except Exception as e:
            print(f"❌ Failed to connect to OpenStack: {e}")
            _openstack_connection = None
    
    return _openstack_connection

def find_aggregate_by_name(conn, aggregate_name):
    """Helper function to find aggregate by name"""
    try:
        aggregates = list(conn.compute.aggregates())
        for agg in aggregates:
            if agg.name == aggregate_name:
                return agg
        return None
    except Exception as e:
        print(f"❌ Error finding aggregate {aggregate_name}: {e}")
        return None

def run_openstack_command(command, log_execution=True):
    """Execute OpenStack CLI command and return result"""
    if log_execution:
        print(f"\n🔄 EXECUTING: {command}")
    
    try:
        result = subprocess.run(
            command, 
            shell=True, 
            capture_output=True, 
            text=True, 
            timeout=30
        )
        
        command_result = {
            'success': result.returncode == 0,
            'stdout': result.stdout.strip(),
            'stderr': result.stderr.strip(),
            'returncode': result.returncode
        }
        
        if log_execution:
            status = "✅ SUCCESS" if command_result['success'] else "❌ FAILED"
            print(f"{status} (return code: {result.returncode})")
            if command_result['stdout']:
                print(f"📤 STDOUT:\n{command_result['stdout']}")
            if command_result['stderr']:
                print(f"📥 STDERR:\n{command_result['stderr']}")
            print("-" * 60)
            
            log_command(command, command_result, 'executed')
        
        return command_result
        
    except subprocess.TimeoutExpired:
        error_result = {
            'success': False,
            'stdout': '',
            'stderr': 'Command timed out after 30 seconds',
            'returncode': -1
        }
        
        if log_execution:
            print("❌ FAILED (timeout)")
            print(f"📥 STDERR: Command timed out after 30 seconds")
            print("-" * 60)
            log_command(command, error_result, 'executed')
        
        return error_result
        
    except Exception as e:
        error_result = {
            'success': False,
            'stdout': '',
            'stderr': str(e),
            'returncode': -1
        }
        
        if log_execution:
            print(f"❌ FAILED (exception: {e})")
            print(f"📥 STDERR: {str(e)}")
            print("-" * 60)
            log_command(command, error_result, 'executed')
        
        return error_result