"""
Abstract base class for all Recon modules.
"""

import shutil
from abc import ABC, abstractmethod


class ReconModule(ABC):
    name: str = ""
    display_name: str = ""
    requires: list[str] = []          # external binaries needed (e.g. ["nmap"])
    target_types: list[str] = ["both"]  # "ip" | "domain" | "both"
    timeout_seconds: int = 30

    def is_available(self) -> bool:
        """Returns True if all required binaries are present on PATH."""
        return all(shutil.which(b) is not None for b in self.requires)

    def supports(self, target_type: str) -> bool:
        return "both" in self.target_types or target_type in self.target_types

    @abstractmethod
    async def run(self, target: str, target_type: str) -> dict:
        """
        Execute recon against target.
        Returns structured dict; never raises — catches all exceptions internally.
        """
        ...
