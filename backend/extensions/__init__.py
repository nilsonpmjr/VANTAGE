"""
Registry and manifest helpers for the VANTAGE extensibility MVP.
"""

from .registry import get_configured_plugin_roots, get_extensions_catalog, load_extensions_registry

__all__ = ["get_configured_plugin_roots", "get_extensions_catalog", "load_extensions_registry"]
