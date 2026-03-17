"""
Reports package for VANTAGE CLI output.

Exposes ReportGenerator for backward compatibility with threat_check.py.
"""

from reports.layout import ReportGenerator

__all__ = ["ReportGenerator"]
