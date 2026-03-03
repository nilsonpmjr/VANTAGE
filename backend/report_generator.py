"""
Backward-compatibility shim.

Import ReportGenerator from the reports package instead:
    from reports import ReportGenerator
"""

from reports.layout import ReportGenerator  # noqa: F401

__all__ = ["ReportGenerator"]
