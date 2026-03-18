"""
Traceroute module using the system traceroute CLI.

Uses UDP probes (default). No root/CAP_NET_RAW required on most systems.
"""

import asyncio
import re
import shutil

from .base import ReconModule


class TracerouteModule(ReconModule):
    name = "traceroute"
    display_name = "Traceroute"
    requires = ["traceroute"]
    target_types = ["both"]
    timeout_seconds = 30

    def is_available(self) -> bool:
        return shutil.which("traceroute") is not None

    async def run(self, target: str, target_type: str) -> dict:
        try:
            target = self.guard_target_argument(target)
        except ValueError as exc:
            return {"error": str(exc)}

        cmd = [
            "traceroute",
            "-n",        # numeric — no DNS reverse lookups
            "-w", "2",   # 2s wait per probe
            "-q", "1",   # 1 probe per hop
            "-m", "20",  # max 20 hops
            target,
        ]

        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
            )
            try:
                stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=28)
            except asyncio.TimeoutError:
                proc.kill()
                await proc.communicate()
                return {"error": "traceroute timed out"}

            output = stdout.decode("utf-8", errors="replace")
        except FileNotFoundError:
            return {"error": "traceroute not found"}
        except Exception as e:
            return {"error": str(e)}

        return _parse_traceroute(output)


def _parse_traceroute(output: str) -> dict:
    """
    Parse traceroute output lines like:
      1  192.168.1.1  1.234 ms
      2  * * *
    """
    hop_re = re.compile(
        r"^\s*(\d+)\s+(?:(\d{1,3}(?:\.\d{1,3}){3}|[0-9a-fA-F:]+)\s+([\d.]+)\s+ms|\*)"
    )
    hops = []

    for line in output.splitlines():
        m = hop_re.match(line)
        if not m:
            continue
        hop_num = int(m.group(1))
        if m.group(2):
            hops.append({"hop": hop_num, "ip": m.group(2), "rtt_ms": float(m.group(3))})
        else:
            hops.append({"hop": hop_num, "ip": "*", "rtt_ms": None})

    if not hops:
        return {"error": "No traceroute output parsed", "raw": output[:500]}

    reached = any(h["ip"] != "*" for h in hops[-3:]) if hops else False
    return {
        "hops": hops,
        "hop_count": len(hops),
        "reached": reached,
    }
