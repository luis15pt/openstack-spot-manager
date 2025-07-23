"""
Utility functions for OpenStack Spot Manager
Contains common utilities used across modules
"""

import requests
from datetime import datetime
from typing import Optional, Dict, Any, Union
import asyncio
import aiohttp
from requests.adapters import HTTPAdapter
from requests.packages.urllib3.util.retry import Retry


class HTTPError(Exception):
    """Custom exception for HTTP errors"""
    def __init__(self, message: str, status_code: Optional[int] = None):
        super().__init__(message)
        self.status_code = status_code


def check_response(response: requests.Response) -> requests.Response:
    """
    Utility function for proper HTTP response checking
    
    Args:
        response: requests.Response object
        
    Returns:
        requests.Response: The same response if successful
        
    Raises:
        HTTPError: If response status indicates an error
    """
    if not response.ok:
        raise HTTPError(f"HTTP error! status: {response.status_code}", response.status_code)
    return response


def fetch_with_timeout(url: str, options: Optional[Dict[str, Any]] = None, timeout: int = 30) -> requests.Response:
    """
    Utility function to add timeout to HTTP requests
    
    Args:
        url: URL to fetch
        options: Optional dictionary of request parameters (method, headers, data, etc.)
        timeout: Timeout in seconds (default: 30)
        
    Returns:
        requests.Response: HTTP response object
        
    Raises:
        HTTPError: If request fails or times out
        requests.exceptions.Timeout: If request times out
    """
    if options is None:
        options = {}
    
    # Set up retry strategy
    retry_strategy = Retry(
        total=3,
        backoff_factor=1,
        status_forcelist=[429, 500, 502, 503, 504],
    )
    
    session = requests.Session()
    adapter = HTTPAdapter(max_retries=retry_strategy)
    session.mount("http://", adapter)
    session.mount("https://", adapter)
    
    try:
        # Extract method, default to GET
        method = options.get('method', 'GET').upper()
        
        # Prepare request parameters
        request_params = {
            'timeout': timeout,
            'headers': options.get('headers', {}),
        }
        
        # Add data/json based on content type
        if 'data' in options:
            request_params['data'] = options['data']
        elif 'json' in options:
            request_params['json'] = options['json']
        
        # Add other common parameters
        if 'params' in options:
            request_params['params'] = options['params']
        if 'auth' in options:
            request_params['auth'] = options['auth']
        if 'cookies' in options:
            request_params['cookies'] = options['cookies']
        
        response = session.request(method, url, **request_params)
        return check_response(response)
        
    except requests.exceptions.Timeout:
        raise HTTPError("Request timeout")
    except requests.exceptions.RequestException as e:
        raise HTTPError(f"Request failed: {str(e)}")


async def fetch_with_timeout_async(url: str, options: Optional[Dict[str, Any]] = None, timeout: int = 30) -> aiohttp.ClientResponse:
    """
    Async utility function to add timeout to HTTP requests
    
    Args:
        url: URL to fetch
        options: Optional dictionary of request parameters
        timeout: Timeout in seconds (default: 30)
        
    Returns:
        aiohttp.ClientResponse: HTTP response object
        
    Raises:
        HTTPError: If request fails or times out
    """
    if options is None:
        options = {}
    
    async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=timeout)) as session:
        try:
            method = options.get('method', 'GET').upper()
            
            request_params = {
                'headers': options.get('headers', {}),
            }
            
            if 'data' in options:
                request_params['data'] = options['data']
            elif 'json' in options:
                request_params['json'] = options['json']
            
            if 'params' in options:
                request_params['params'] = options['params']
            
            async with session.request(method, url, **request_params) as response:
                if not (200 <= response.status < 300):
                    raise HTTPError(f"HTTP error! status: {response.status}", response.status)
                return response
                
        except asyncio.TimeoutError:
            raise HTTPError("Request timeout")
        except Exception as e:
            raise HTTPError(f"Request failed: {str(e)}")


# Status utility functions
def get_status_class(status: str) -> str:
    """
    Get Bootstrap CSS class for status
    
    Args:
        status: Status string
        
    Returns:
        str: CSS class name
    """
    status_mapping = {
        'ACTIVE': 'success',
        'BUILD': 'warning',
        'ERROR': 'danger',
        'SHUTOFF': 'secondary',
    }
    return status_mapping.get(status, 'primary')


def get_status_icon(status: str) -> str:
    """
    Get Font Awesome icon class for status
    
    Args:
        status: Status string
        
    Returns:
        str: Font Awesome icon class
    """
    icon_mapping = {
        'ACTIVE': 'fas fa-play-circle',
        'BUILD': 'fas fa-spinner fa-spin',
        'ERROR': 'fas fa-exclamation-triangle',
        'SHUTOFF': 'fas fa-stop-circle',
    }
    return icon_mapping.get(status, 'fas fa-question-circle')


def get_status_color(status: str) -> str:
    """
    Get color hex code for status
    
    Args:
        status: Status string
        
    Returns:
        str: Hex color code
    """
    color_mapping = {
        'ACTIVE': '#28a745',
        'BUILD': '#ffc107',
        'ERROR': '#dc3545',
        'SHUTOFF': '#6c757d',
    }
    return color_mapping.get(status, '#007bff')


def format_date(date_string: Optional[str]) -> str:
    """
    Date formatting utility
    
    Args:
        date_string: ISO date string or None
        
    Returns:
        str: Formatted date string or 'N/A' if input is None/empty
    """
    if not date_string:
        return 'N/A'
    
    try:
        # Handle various date formats
        if 'T' in date_string:
            # ISO format with T separator
            if date_string.endswith('Z'):
                # UTC format
                date = datetime.fromisoformat(date_string.replace('Z', '+00:00'))
            else:
                date = datetime.fromisoformat(date_string)
        else:
            # Try to parse as general datetime
            date = datetime.fromisoformat(date_string)
        
        # Format similar to JavaScript's toLocaleDateString() + toLocaleTimeString()
        return date.strftime('%m/%d/%Y %I:%M:%S %p')
    
    except (ValueError, TypeError):
        return 'Invalid Date'


def get_command_icon(command_type: str) -> str:
    """
    Command icon utility - returns Font Awesome icon class for command types
    
    Args:
        command_type: Type of command
        
    Returns:
        str: Font Awesome icon class
    """
    icon_mapping = {
        'wait-command': 'fas fa-clock',
        'hyperstack-launch': 'fas fa-rocket',
        'storage-network-find': 'fas fa-search',
        'storage-port-create': 'fas fa-plus',
        'storage-port-attach': 'fas fa-link',
        'firewall-get': 'fas fa-shield-alt',
        'firewall-update': 'fas fa-shield-alt',
        'aggregate-remove': 'fas fa-minus-circle',
        'aggregate-add': 'fas fa-plus-circle',
    }
    return icon_mapping.get(command_type, 'fas fa-terminal')


# Additional utility functions that might be useful in Python context

def safe_get(dictionary: Dict[str, Any], key: str, default: Any = None) -> Any:
    """
    Safely get a value from a dictionary with a default fallback
    
    Args:
        dictionary: Dictionary to search in
        key: Key to look for
        default: Default value if key not found
        
    Returns:
        Any: Value from dictionary or default
    """
    return dictionary.get(key, default)


def is_valid_url(url: str) -> bool:
    """
    Check if a string is a valid URL
    
    Args:
        url: URL string to validate
        
    Returns:
        bool: True if valid URL, False otherwise
    """
    try:
        from urllib.parse import urlparse
        result = urlparse(url)
        return all([result.scheme, result.netloc])
    except Exception:
        return False


def truncate_string(text: str, max_length: int = 50, suffix: str = "...") -> str:
    """
    Truncate a string to specified length with suffix
    
    Args:
        text: String to truncate
        max_length: Maximum length before truncation
        suffix: Suffix to add when truncating
        
    Returns:
        str: Truncated string
    """
    if len(text) <= max_length:
        return text
    return text[:max_length - len(suffix)] + suffix


# Export all utility functions in a dictionary for easier access
UTILS = {
    'check_response': check_response,
    'fetch_with_timeout': fetch_with_timeout,
    'fetch_with_timeout_async': fetch_with_timeout_async,
    'get_status_class': get_status_class,
    'get_status_icon': get_status_icon,
    'get_status_color': get_status_color,
    'format_date': format_date,
    'get_command_icon': get_command_icon,
    'safe_get': safe_get,
    'is_valid_url': is_valid_url,
    'truncate_string': truncate_string,
}