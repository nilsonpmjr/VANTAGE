"""
Subdomain enumeration module using subfinder.

Uses passive sources only (no brute force).
Requires subfinder binary in PATH.
"""

import asyncio
import shutil

from .base import ReconModule


class SubdomainsModule(ReconModule):
    name = "subdomains"
    display_name = "Subdomains"
    requires = ["subfinder"]
    target_types = ["domain"]
    timeout_seconds = 45

    def is_available(self) -> bool:
        return shutil.which("subfinder") is not None

    async def run(self, target: str, target_type: str) -> dict:
        if target_type != "domain":
            return {"skipped": "Subdomain enumeration only supports domain targets."}
        try:
            target = self.guard_target_argument(target)
        except ValueError as exc:
            return {"error": str(exc)}

        cmd = [
            "subfinder",
            "-d", target,
            "-silent",
            "-timeout", "30",
            "-max-time", "40",
        ]

        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.DEVNULL,
            )
            try:
                stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=42)
            except asyncio.TimeoutError:
                proc.kill()
                await proc.communicate()
                return {"error": "subfinder timed out"}

            output = stdout.decode("utf-8", errors="replace")
        except FileNotFoundError:
            return {"error": "subfinder not found"}
        except Exception as e:
            return {"error": str(e)}

        subdomains = [
            line.strip()
            for line in output.splitlines()
            if line.strip() and "." in line.strip()
        ]

        # Deduplicate, cap at 500
        subdomains = list(dict.fromkeys(subdomains))[:500]

        return {
            "subdomains": subdomains,
            "count": len(subdomains),
        }
