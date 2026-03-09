"""
Passive recon module using theHarvester.

Sources used: hackertarget, certspotter, crtsh, dnsdumpster
No API keys required — all free passive sources.
"""

import asyncio
import re
import shutil

from .base import ReconModule


class PassiveModule(ReconModule):
    name = "passive"
    display_name = "Passive"
    requires = ["theHarvester"]
    target_types = ["domain"]
    timeout_seconds = 60

    def is_available(self) -> bool:
        return shutil.which("theHarvester") is not None

    async def run(self, target: str, target_type: str) -> dict:
        if target_type != "domain":
            return {"skipped": "Passive harvest only supports domain targets."}

        cmd = [
            "theHarvester",
            "-d", target,
            "-l", "200",
            "-b", "hackertarget,certspotter,crtsh,dnsdumpster",
        ]

        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.DEVNULL,
            )
            try:
                stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=55)
            except asyncio.TimeoutError:
                proc.kill()
                await proc.communicate()
                return {"error": "theHarvester timed out"}

            output = stdout.decode("utf-8", errors="replace")
        except FileNotFoundError:
            return {"error": "theHarvester not found"}
        except Exception as e:
            return {"error": str(e)}

        return _parse_harvester_output(output, target)


def _parse_harvester_output(output: str, target: str) -> dict:
    emails: list[str] = []
    hosts: list[str] = []
    ips: list[str] = []

    email_re = re.compile(r"[a-zA-Z0-9_.+\-]+@[a-zA-Z0-9\-]+\.[a-zA-Z]{2,}")
    ip_re = re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b")

    in_emails = False
    in_hosts = False

    for line in output.splitlines():
        stripped = line.strip()

        if "Emails found" in stripped or "emails found" in stripped:
            in_emails = True
            in_hosts = False
            continue
        if "Hosts found" in stripped or "hosts found" in stripped or "IPs found" in stripped:
            in_emails = False
            in_hosts = True
            continue
        if stripped.startswith("[*]") or stripped.startswith("[-]"):
            in_emails = False
            in_hosts = False

        if in_emails and email_re.match(stripped):
            if stripped not in emails:
                emails.append(stripped)
        elif in_hosts and "." in stripped and not stripped.startswith("["):
            # could be hostname:ip or just hostname
            parts = stripped.split(":")
            host = parts[0].strip()
            if host and host not in hosts and target in host or host.endswith("." + target):
                hosts.append(host)
            if len(parts) > 1:
                ip_candidate = parts[1].strip()
                if ip_re.fullmatch(ip_candidate) and ip_candidate not in ips:
                    ips.append(ip_candidate)

        # Fallback: pick up any emails anywhere
        for m in email_re.findall(stripped):
            if m not in emails:
                emails.append(m)

    # Deduplicate and cap
    emails = list(dict.fromkeys(emails))[:100]
    hosts = list(dict.fromkeys(hosts))[:200]
    ips = list(dict.fromkeys(ips))[:100]

    if not emails and not hosts and not ips:
        return {"emails": [], "subdomains": [], "ips": [], "note": "No passive results found."}

    return {
        "emails": emails,
        "subdomains": hosts,
        "ips": ips,
        "source_count": len(emails) + len(hosts) + len(ips),
    }
