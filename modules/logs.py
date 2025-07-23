"""
Logging and Debug System for OpenStack Spot Manager
Handles command logs, debug logs, and system statistics
Python module equivalent of static/logs.js
"""

import json
import threading
from datetime import datetime
from typing import List, Dict, Optional, Any, Union
from dataclasses import dataclass, asdict
from enum import Enum


class LogLevel(Enum):
    """Log levels for debug entries."""
    INFO = "info"
    WARNING = "warning"
    SUCCESS = "success"
    ERROR = "error"


class CommandType(Enum):
    """Command execution types."""
    PREVIEW = "preview"
    TIMEOUT = "timeout"
    ERROR = "error"
    SUCCESS = "success"


@dataclass
class DebugEntry:
    """Represents a debug log entry."""
    timestamp: str
    type: str
    message: str
    level: str
    hostname: Optional[str] = None


@dataclass
class DebugStats:
    """Statistics for debug session."""
    session_start_time: str
    operations_count: int = 0
    commands_executed: int = 0
    errors_count: int = 0


@dataclass
class CommandLogEntry:
    """Represents a command log entry."""
    timestamp: str
    command: str
    hostname: Optional[str]
    success: Optional[bool]  # None for preview, True/False for actual execution
    type: str  # preview, success, error, timeout
    stdout: Optional[str] = None
    stderr: Optional[str] = None


@dataclass
class CommandStats:
    """Statistics for command execution."""
    successful: int = 0
    failed: int = 0
    preview: int = 0
    total: int = 0


class LogsManager:
    """
    Main class managing both debug logs and command logs.
    Handles in-memory storage, statistics, and export functionality.
    Thread-safe implementation for server-side usage.
    """
    
    def __init__(self):
        self._debug_entries: List[DebugEntry] = []
        self._debug_stats = DebugStats(
            session_start_time=datetime.now().isoformat()
        )
        self._debug_tab_initialized = False
        self._lock = threading.Lock()
    
    # Debug Log Management
    
    def initialize_debug_tab(self) -> Dict[str, Any]:
        """
        Initialize debug tab data.
        Returns session start time and initialization status.
        """
        with self._lock:
            if not self._debug_tab_initialized:
                self._debug_tab_initialized = True
            
            # Handle timestamp with Z suffix
            timestamp_str = self._debug_stats.session_start_time.replace('Z', '+00:00') if 'Z' in self._debug_stats.session_start_time else self._debug_stats.session_start_time
            return {
                "session_start_time": datetime.fromisoformat(
                    timestamp_str
                ).strftime("%Y-%m-%d %H:%M:%S"),
                "initialized": self._debug_tab_initialized
            }
    
    def add_to_debug_log(
        self, 
        entry_type: str, 
        message: str, 
        level: Union[LogLevel, str] = LogLevel.INFO, 
        hostname: Optional[str] = None
    ) -> None:
        """
        Add entry to debug log.
        
        Args:
            entry_type: Type of the log entry (e.g., 'System', 'Operation')
            message: Log message content
            level: Log level (info, warning, success, error)
            hostname: Optional hostname for the entry
        """
        if isinstance(level, LogLevel):
            level_str = level.value
        else:
            level_str = level
            
        entry = DebugEntry(
            timestamp=datetime.now().isoformat(),
            type=entry_type,
            message=message,
            level=level_str,
            hostname=hostname
        )
        
        with self._lock:
            self._debug_entries.append(entry)
            
            # Update stats
            if level_str == LogLevel.ERROR.value:
                self._debug_stats.errors_count += 1
    
    def get_debug_log_display_data(self) -> Dict[str, Any]:
        """
        Get debug log data formatted for display.
        Returns the last 100 entries with formatted timestamps.
        """
        with self._lock:
            if not self._debug_entries:
                return {
                    "entries": [],
                    "empty": True,
                    "message": "Debug information will appear here during operations."
                }
            
            # Get last 100 entries
            recent_entries = self._debug_entries[-100:]
            
            formatted_entries = []
            for entry in recent_entries:
                level_class = self._get_level_class(entry.level)
                hostname_text = f"[{entry.hostname}]" if entry.hostname else ""
                # Handle timestamp with Z suffix
                timestamp_str = entry.timestamp.replace('Z', '+00:00') if 'Z' in entry.timestamp else entry.timestamp
                timestamp = datetime.fromisoformat(timestamp_str).strftime("%H:%M:%S")
                
                formatted_entries.append({
                    "level": entry.level.upper(),
                    "level_class": level_class,
                    "type": entry.type,
                    "hostname": hostname_text,
                    "timestamp": timestamp,
                    "message": entry.message
                })
            
            return {
                "entries": formatted_entries,
                "empty": False
            }
    
    def _get_level_class(self, level: str) -> str:
        """Get CSS class for log level."""
        level_classes = {
            LogLevel.ERROR.value: "danger",
            LogLevel.WARNING.value: "warning", 
            LogLevel.SUCCESS.value: "success",
            LogLevel.INFO.value: "info"
        }
        return level_classes.get(level, "info")
    
    def get_debug_stats(self) -> Dict[str, Any]:
        """Get current debug statistics."""
        with self._lock:
            # Handle timestamp with Z suffix
            timestamp_str = self._debug_stats.session_start_time.replace('Z', '+00:00') if 'Z' in self._debug_stats.session_start_time else self._debug_stats.session_start_time
            return {
                "session_start_time": datetime.fromisoformat(
                    timestamp_str
                ).strftime("%Y-%m-%d %H:%M:%S"),
                "operations_count": self._debug_stats.operations_count,
                "commands_executed": self._debug_stats.commands_executed,
                "errors_count": self._debug_stats.errors_count,
                "debug_entries_count": len(self._debug_entries)
            }
    
    def increment_operations_count(self) -> None:
        """Increment the operations counter."""
        with self._lock:
            self._debug_stats.operations_count += 1
    
    def increment_commands_executed(self) -> None:
        """Increment the commands executed counter."""
        with self._lock:
            self._debug_stats.commands_executed += 1
    
    def clear_debug_log(self) -> None:
        """Clear debug log and reset error count."""
        with self._lock:
            self._debug_entries.clear()
            self._debug_stats.errors_count = 0
            
        self.add_to_debug_log('System', 'Debug log cleared', LogLevel.INFO)
    
    def export_debug_log(self) -> Dict[str, Any]:
        """
        Export debug log data as JSON-serializable dictionary.
        Equivalent to JavaScript exportDebugLog functionality.
        """
        with self._lock:
            export_data = {
                "export_time": datetime.now().isoformat(),
                "stats": asdict(self._debug_stats),
                "entries": [asdict(entry) for entry in self._debug_entries]
            }
        
        self.add_to_debug_log('System', 'Debug log exported', LogLevel.INFO)
        return export_data
    
    # Command Log Management (Server-side integration points)
    
    def create_command_log_entry_data(
        self, 
        command: str,
        hostname: Optional[str] = None,
        success: Optional[bool] = None,
        cmd_type: str = "preview",
        stdout: Optional[str] = None,
        stderr: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Create command log entry data structure.
        This would be used by the server to create entries for the command log.
        """
        entry = CommandLogEntry(
            timestamp=datetime.now().isoformat(),
            command=command,
            hostname=hostname,
            success=success,
            type=cmd_type,
            stdout=stdout,
            stderr=stderr
        )
        
        return asdict(entry)
    
    def format_command_log_for_display(self, commands: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Format command log data for display.
        Equivalent to renderCommandLog functionality.
        """
        if not commands:
            return {
                "commands": [],
                "empty": True,
                "message": "No commands executed yet. Commands will appear here when you perform migrations."
            }
        
        formatted_commands = []
        for index, cmd in enumerate(commands):
            formatted_cmd = self._format_single_command(cmd, index)
            formatted_commands.append(formatted_cmd)
        
        return {
            "commands": formatted_commands,
            "empty": False
        }
    
    def _format_single_command(self, cmd: Dict[str, Any], index: int) -> Dict[str, Any]:
        """Format a single command for display."""
        # Handle timestamp with Z suffix
        timestamp_str = cmd['timestamp'].replace('Z', '+00:00')
        timestamp = datetime.fromisoformat(timestamp_str).strftime("%Y-%m-%d %H:%M:%S")
        
        # Determine status
        if cmd['success'] is None:
            status_class = "preview"
            status_text = "PREVIEW"
            status_icon = "fas fa-eye"
            card_class = "border-info"
        elif cmd['success']:
            status_class = "success"
            status_text = "SUCCESS"
            status_icon = "fas fa-check-circle"
            card_class = "border-success"
        elif cmd['type'] == 'timeout':
            status_class = "timeout"
            status_text = "TIMEOUT"
            status_icon = "fas fa-clock"
            card_class = "border-warning"
        else:
            status_class = "error"
            status_text = "ERROR"
            status_icon = "fas fa-exclamation-circle"
            card_class = "border-danger"
        
        # Format command display
        command_display = cmd['command']
        if len(command_display) > 60:
            command_display = command_display[:60] + "..."
        
        # Format output
        output_data = None
        if cmd['type'] != 'preview':
            output_text = cmd.get('stdout') or cmd.get('stderr') or 'No output'
            output_class = 'command-error-output' if cmd.get('stderr') else 'command-success-output'
            output_data = {
                "text": output_text,
                "class": output_class
            }
        
        return {
            "id": f"cmd-log-{index}-{int(datetime.now().timestamp())}",
            "command": cmd['command'],
            "command_display": command_display,
            "hostname": cmd.get('hostname') or 'N/A',
            "timestamp": timestamp,
            "status_class": status_class,
            "status_text": status_text,
            "status_icon": status_icon,
            "card_class": card_class,
            "output": output_data
        }
    
    def calculate_command_stats(self, commands: List[Dict[str, Any]]) -> CommandStats:
        """Calculate statistics from command list."""
        stats = CommandStats()
        
        for cmd in commands:
            if cmd['success'] is None:
                stats.preview += 1
            elif cmd['success']:
                stats.successful += 1
            else:
                stats.failed += 1
            stats.total += 1
        
        return stats
    
    def generate_results_summary(self, commands: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Generate results summary data.
        Equivalent to renderResultsSummary functionality.
        """
        if not commands:
            return {
                "stats": asdict(CommandStats()),
                "error_rate": 0,
                "session_analytics": self.get_debug_stats()
            }
        
        stats = self.calculate_command_stats(commands)
        error_rate = round((stats.failed / stats.total) * 100) if stats.total > 0 else 0
        
        return {
            "stats": asdict(stats),
            "error_rate": error_rate,
            "session_analytics": self.get_debug_stats()
        }
    
    # Export Functions
    
    def export_command_log_data(self, commands: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Export command log data in JSON format.
        Equivalent to exportCommandLog functionality.
        """
        export_data = {
            "export_time": datetime.now().isoformat(),
            "commands": commands,
            "count": len(commands)
        }
        
        self.add_to_debug_log('System', 'Command log exported successfully', LogLevel.INFO)
        return export_data
    
    def export_analytics_data(self, commands: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Export analytics data in JSON format.
        Equivalent to exportAnalytics functionality.
        """
        stats = self.calculate_command_stats(commands)
        error_rate = round((stats.failed / stats.total) * 100) if stats.total > 0 else 0
        
        # Handle timestamp with Z suffix
        timestamp_str = self._debug_stats.session_start_time.replace('Z', '+00:00') if 'Z' in self._debug_stats.session_start_time else self._debug_stats.session_start_time
        analytics_data = {
            "session_start": datetime.fromisoformat(
                timestamp_str
            ).strftime("%Y-%m-%d %H:%M:%S"),
            "statistics": {
                "successful": stats.successful,
                "failed": stats.failed,
                "previewed": stats.preview,
                "total": stats.total,
                "error_rate": f"{error_rate}%"
            },
            "session_analytics": {
                "operations_executed": self._debug_stats.operations_count,
                "commands_executed": self._debug_stats.commands_executed,
                "errors_count": self._debug_stats.errors_count
            },
            "export_timestamp": datetime.now().isoformat()
        }
        
        self.add_to_debug_log('System', 'Analytics exported successfully', LogLevel.INFO)
        return analytics_data
    
    def reset_session_stats(self) -> None:
        """
        Reset session statistics.
        Equivalent to resetSessionStats functionality.
        """
        with self._lock:
            self._debug_stats.operations_count = 0
            self._debug_stats.commands_executed = 0
            self._debug_stats.errors_count = 0
            self._debug_stats.session_start_time = datetime.now().isoformat()
        
        self.add_to_debug_log('System', 'Session statistics reset successfully', LogLevel.INFO)
    
    # Utility Functions
    
    def to_json(self, data: Any, indent: int = 2) -> str:
        """Convert data to JSON string format."""
        return json.dumps(data, indent=indent, ensure_ascii=False)
    
    def generate_export_filename(self, prefix: str) -> str:
        """Generate filename for export with current date."""
        date_str = datetime.now().strftime("%Y-%m-%d")
        return f"{prefix}-{date_str}.json"


# Global instance for server-wide usage
logs_manager = LogsManager()


# Convenience functions that match the original JavaScript API
def add_to_debug_log(entry_type: str, message: str, level: Union[LogLevel, str] = LogLevel.INFO, hostname: Optional[str] = None) -> None:
    """Add entry to debug log."""
    logs_manager.add_to_debug_log(entry_type, message, level, hostname)


def get_debug_stats() -> Dict[str, Any]:
    """Get current debug statistics."""
    return logs_manager.get_debug_stats()


def increment_operations_count() -> None:
    """Increment the operations counter."""
    logs_manager.increment_operations_count()


def increment_commands_executed() -> None:
    """Increment the commands executed counter."""
    logs_manager.increment_commands_executed()


def clear_debug_log() -> None:
    """Clear debug log."""
    logs_manager.clear_debug_log()


def export_debug_log() -> Dict[str, Any]:
    """Export debug log data."""
    return logs_manager.export_debug_log()


def format_command_log_for_display(commands: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Format command log data for display."""
    return logs_manager.format_command_log_for_display(commands)


def generate_results_summary(commands: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Generate results summary data."""
    return logs_manager.generate_results_summary(commands)


def export_command_log_data(commands: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Export command log data."""
    return logs_manager.export_command_log_data(commands)


def export_analytics_data(commands: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Export analytics data."""
    return logs_manager.export_analytics_data(commands)


def reset_session_stats() -> None:
    """Reset session statistics."""
    logs_manager.reset_session_stats()