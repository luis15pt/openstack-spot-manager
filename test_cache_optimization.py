#!/usr/bin/env python3

"""
Test script to verify cache optimization functions work correctly
This tests the new cache-first approach for RunPod operations
"""

import time
import sys
import os

# Add the project root to Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

def test_hostname_pattern_matching():
    """Test the fast hostname pattern matching"""
    from modules.aggregate_operations import get_gpu_type_from_hostname_fast
    
    print("🧪 Testing hostname pattern matching...")
    
    test_cases = [
        ("CA1-esc8-1", "RTX-A6000"),
        ("CA1-h100-node01", "H100"),
        ("CA1-a100-server1", "A100"),
        ("CA1-l40-gpu1", "L40"),
        ("CA1-h100sxm-node1", "H100-SXM5"),
        ("unknown-hostname", None),
    ]
    
    for hostname, expected in test_cases:
        result = get_gpu_type_from_hostname_fast(hostname)
        status = "✅" if result == expected else "❌"
        print(f"  {status} {hostname} -> {result} (expected: {expected})")
    
    print()

def test_build_flavor_name_optimized():
    """Test the optimized build_flavor_name function"""
    from modules.aggregate_operations import build_flavor_name_optimized
    
    print("🧪 Testing optimized flavor name building...")
    
    test_cases = [
        "CA1-esc8-1",
        "CA1-h100-node01", 
        "CA1-a100-server1",
        "CA1-l40-gpu1"
    ]
    
    for hostname in test_cases:
        start_time = time.time()
        try:
            flavor_name = build_flavor_name_optimized(hostname)
            elapsed = time.time() - start_time
            print(f"  ✅ {hostname} -> {flavor_name} (took {elapsed:.3f}s)")
        except Exception as e:
            elapsed = time.time() - start_time
            print(f"  ❌ {hostname} -> Error: {e} (took {elapsed:.3f}s)")
    
    print()

def test_target_aggregate_optimized():
    """Test the optimized target aggregate function"""
    from modules.aggregate_operations import get_target_aggregate_optimized
    
    print("🧪 Testing optimized target aggregate lookup...")
    
    test_cases = [
        ("CA1-esc8-1", "spot"),
        ("CA1-h100-node01", "runpod"), 
        ("CA1-a100-server1", "ondemand"),
    ]
    
    for hostname, target_type in test_cases:
        start_time = time.time()
        try:
            result = get_target_aggregate_optimized(hostname, target_type)
            elapsed = time.time() - start_time
            if result:
                print(f"  ✅ {hostname} -> {target_type} = {result['target_aggregate']} (took {elapsed:.3f}s)")
            else:
                print(f"  ⚠️ {hostname} -> {target_type} = No result (took {elapsed:.3f}s)")
        except Exception as e:
            elapsed = time.time() - start_time
            print(f"  ❌ {hostname} -> {target_type} = Error: {e} (took {elapsed:.3f}s)")
    
    print()

def test_parallel_cache_usage():
    """Test that parallel cache is being used properly"""
    from modules.parallel_agents import get_all_data_parallel, get_parallel_cache_stats
    
    print("🧪 Testing parallel cache usage...")
    
    # Get cache stats before
    stats_before = get_parallel_cache_stats()
    print(f"  📊 Cache before: {stats_before['cached_datasets']} datasets, age: {stats_before.get('oldest_entry_age', 0):.1f}s")
    
    # Try to get parallel data (should use cache if available)
    start_time = time.time()
    try:
        data = get_all_data_parallel()
        elapsed = time.time() - start_time
        gpu_types = list(data.keys())
        total_hosts = sum(gpu_data['total_hosts'] for gpu_data in data.values())
        print(f"  ✅ Got {len(gpu_types)} GPU types, {total_hosts} hosts in {elapsed:.3f}s")
        print(f"  📋 GPU types: {', '.join(gpu_types)}")
    except Exception as e:
        elapsed = time.time() - start_time
        print(f"  ❌ Error getting parallel data: {e} (took {elapsed:.3f}s)")
    
    # Get cache stats after
    stats_after = get_parallel_cache_stats()
    print(f"  📊 Cache after: {stats_after['cached_datasets']} datasets, age: {stats_after.get('oldest_entry_age', 0):.1f}s")
    print()

def main():
    """Run all optimization tests"""
    print("🚀 Starting cache optimization tests...")
    print("=" * 60)
    
    test_hostname_pattern_matching()
    test_build_flavor_name_optimized()
    test_target_aggregate_optimized()
    test_parallel_cache_usage()
    
    print("=" * 60)
    print("✅ Cache optimization tests completed!")
    print()
    print("Key benefits:")
    print("  • Hostname pattern matching eliminates most OpenStack API calls")
    print("  • Parallel cache provides 30s-10min data freshness")
    print("  • RunPod operations should be 10-30x faster")

if __name__ == "__main__":
    main()