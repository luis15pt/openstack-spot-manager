"""
OpenStack Spot Manager Modules Package
"""

from .utils import (
    HTTPError,
    check_response,
    fetch_with_timeout,
    fetch_with_timeout_async,
    get_status_class,
    get_status_icon,
    get_status_color,
    format_date,
    get_command_icon,
    safe_get,
    is_valid_url,
    truncate_string,
    UTILS
)

from .logs import (
    LogLevel,
    CommandType,
    LogsManager,
    logs_manager,
    add_to_debug_log,
    get_debug_stats,
    increment_operations_count,
    increment_commands_executed,
    clear_debug_log,
    export_debug_log,
    format_command_log_for_display,
    generate_results_summary,
    export_command_log_data,
    export_analytics_data,
    reset_session_stats
)

__version__ = "1.0.0"
__all__ = [
    # Utils
    "HTTPError",
    "check_response",
    "fetch_with_timeout", 
    "fetch_with_timeout_async",
    "get_status_class",
    "get_status_icon",
    "get_status_color",
    "format_date",
    "get_command_icon",
    "safe_get",
    "is_valid_url",
    "truncate_string",
    "UTILS",
    # Logs
    "LogLevel",
    "CommandType", 
    "LogsManager",
    "logs_manager",
    "add_to_debug_log",
    "get_debug_stats",
    "increment_operations_count",
    "increment_commands_executed",
    "clear_debug_log",
    "export_debug_log",
    "format_command_log_for_display",
    "generate_results_summary",
    "export_command_log_data",
    "export_analytics_data",
    "reset_session_stats"
]