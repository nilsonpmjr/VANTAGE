"""
Port Scan module — uses nmap via subprocess.
Runs a TCP connect scan (-sT, no root required) with service detection.
Parses nmap XML output.
"""

import asyncio
import xml.etree.ElementTree as ET

from .base import ReconModule

_DEFAULT_PORTS = "21,22,23,25,53,80,110,111,135,139,143,443,445,993,995," \
                 "1723,3306,3389,5900,8080,8443,8888"


class PortsModule(ReconModule):
    name = "ports"
    display_name = "Ports"
    requires = ["nmap"]
    target_types = ["both"]
    timeout_seconds = 120

    async def run(self, target: str, target_type: str) -> dict:
        try:
            target = self.guard_target_argument(target)
        except ValueError as exc:
            return {"error": str(exc)}

        port_range = _DEFAULT_PORTS
        # fmt: off
        cmd = [
            "nmap",
            "-sT",           # TCP connect scan — no root required
            "-sV",           # service/version detection
            "-T4",           # aggressive timing (faster)
            "--open",        # only show open ports
            "-p", port_range,
            "--host-timeout", "90s",
            "--max-retries", "1",
            "-oX", "-",      # XML output to stdout
            target,
        ]
        # fmt: on

        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            try:
                stdout, stderr = await asyncio.wait_for(
                    proc.communicate(), timeout=self.timeout_seconds
                )
            except asyncio.TimeoutError:
                proc.kill()
                await proc.communicate()
                return {"error": "nmap scan timed out"}
        except FileNotFoundError:
            return {"error": "nmap not found — install with apt-get install nmap"}
        except Exception as e:
            return {"error": str(e)}

        if proc.returncode not in (0, 1):  # nmap exits 1 for "no hosts up"
            err_msg = stderr.decode(errors="replace")[:500]
            return {"error": f"nmap exited {proc.returncode}: {err_msg}"}

        return self._parse_xml(stdout.decode(errors="replace"))

    def _parse_xml(self, xml_output: str) -> dict:
        ports: list[dict] = []
        os_guesses: list[str] = []

        try:
            root = ET.fromstring(xml_output)
        except ET.ParseError as e:
            return {"error": f"XML parse error: {e}"}

        for host in root.findall("host"):
            # OS detection (best guess)
            osmatch = host.find(".//osmatch")
            if osmatch is not None:
                os_guesses.append(osmatch.get("name", ""))

            ports_elem = host.find("ports")
            if ports_elem is None:
                continue

            for port in ports_elem.findall("port"):
                state_elem = port.find("state")
                if state_elem is None or state_elem.get("state") != "open":
                    continue

                service_elem = port.find("service")
                service_name = service_elem.get("name", "") if service_elem is not None else ""
                service_product = service_elem.get("product", "") if service_elem is not None else ""
                service_version = service_elem.get("version", "") if service_elem is not None else ""

                ports.append({
                    "port": int(port.get("portid", 0)),
                    "protocol": port.get("protocol", "tcp"),
                    "state": "open",
                    "service": service_name,
                    "product": service_product,
                    "version": service_version,
                })

        return {
            "ports": ports,
            "open_count": len(ports),
            "os_guess": os_guesses[0] if os_guesses else None,
        }
