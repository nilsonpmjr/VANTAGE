"""
ReportGenerator: accumulates threat intelligence results and renders them
as Rich terminal output (printable report or dashboard grid).
"""

from datetime import datetime
from zoneinfo import ZoneInfo

from rich.align import Align
from rich.columns import Columns
from rich.console import Console
from rich.panel import Panel

from reports.translations import TRANS, COUNTRY_MAP, SERVICE_ICONS
from reports.formatters import format_service_content, border_color_for_service


class ReportGenerator:
    """
    Accumulates threat intelligence results and renders them via Rich.

    Usage:
        gen = ReportGenerator(target="8.8.8.8", lang="pt")
        gen.add_result("virustotal", vt_data)
        gen.add_result("shodan", shodan_data)
        gen.print_dashboard()   # or gen.print_to_console()
    """

    def __init__(self, target: str, lang: str = 'pt'):
        self.target = target
        self.lang = lang if lang in TRANS else 'en'
        self.t = TRANS[self.lang]
        self.results: dict = {}
        self.timestamp = datetime.now(ZoneInfo("America/Sao_Paulo")).strftime("%Y-%m-%d %H:%M:%S %Z")
        self.console = Console()
        self.risk_counter = 0
        self.total_sources = 0

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _get_country_name(self, code: str) -> str:
        if not code:
            return "N/A"
        return COUNTRY_MAP.get(code.upper(), code)

    def _get_tag_desc(self, tag: str):
        return self.t.get('tags', {}).get(tag)

    # ------------------------------------------------------------------
    # Data ingestion
    # ------------------------------------------------------------------

    def add_result(self, service_name: str, data: dict) -> None:
        """Adds a service result and updates risk metrics."""
        if data is None:
            data = {"error": "API returned no data (Check logs or API Status)"}

        self.results[service_name] = data

        if "error" in data or "_meta_error" in data:
            return

        self.total_sources += 1

        is_risky = False
        if service_name == 'virustotal':
            malicious = (
                data.get('data', {})
                .get('attributes', {})
                .get('last_analysis_stats', {})
                .get('malicious', 0)
            )
            if malicious >= 3:
                is_risky = True
        elif service_name == 'abuseipdb':
            if data.get('data', {}).get('abuseConfidenceScore', 0) >= 25:
                is_risky = True
        elif service_name == 'alienvault':
            if data.get('pulse_info', {}).get('count', 0) > 0:
                is_risky = True
        elif service_name == 'urlscan':
            if data.get('data', {}).get('verdict', {}).get('score', 0) > 0:
                is_risky = True
        elif service_name == 'greynoise':
            if data.get('classification') == 'malicious':
                is_risky = True
        elif service_name == 'blacklistmaster':
            if not (isinstance(data, dict) and data.get("_meta_msg") == "No content returned"):
                if "error" not in data and "_meta_error" not in (data if isinstance(data, dict) else {}):
                    is_risky = True
        elif service_name == 'abusech':
            if (
                data.get('query_status') == 'ok'
                and isinstance(data.get('data'), list)
                and len(data['data']) > 0
            ):
                is_risky = True
        elif service_name == 'pulsedive':
            if data.get('risk') in ['high', 'critical']:
                is_risky = True

        if is_risky:
            self.risk_counter += 1

    # ------------------------------------------------------------------
    # Panel builders
    # ------------------------------------------------------------------

    def _get_verdict_panel(self) -> Panel:
        flagged = f"{self.risk_counter}/{self.total_sources}"
        if self.risk_counter >= 2:
            color = "red"
            text = f"🚨 {self.t['verdict']}: {self.t['high_risk']} ({flagged} {self.t['sources_flagged']})"
        elif self.risk_counter == 1:
            color = "yellow"
            text = f"⚠️  {self.t['verdict']}: {self.t['suspicious']} ({flagged} {self.t['sources_flagged']})"
        else:
            color = "green"
            text = f"🛡️  {self.t['verdict']}: {self.t['safe']} ({flagged} {self.t['sources_flagged']})"
        return Panel(Align.center(f"[bold {color}]{text}[/]"), border_style=color)

    def _build_service_content(self, service: str, data: dict) -> str:
        return format_service_content(
            service, data, self.t, self._get_country_name, self._get_tag_desc
        )

    # ------------------------------------------------------------------
    # Output methods
    # ------------------------------------------------------------------

    def print_to_console(self) -> None:
        """Prints the report in a linear printable format."""
        header_text = (
            f"[bold]{self.t['title']}[/]\n"
            f"[dim]{'-' * 60}[/]\n"
            f"🎯 {self.t['target']}:    [cyan]{self.target}[/]\n"
            f"🔍 {self.t['type']}:      [cyan]--[/]\n"
            f"🕒 {self.t['timestamp']}: [dim]{self.timestamp}[/]\n"
            f"[dim]{'-' * 60}[/]"
        )
        self.console.print(header_text)
        self.console.print()
        self.console.print(self._get_verdict_panel())
        self.console.print()

        skipped = []
        for service, data in self.results.items():
            if isinstance(data, dict) and (data.get("error") or data.get("_meta_error")):
                skipped.append((service, data))
                continue
            icon = SERVICE_ICONS.get(service, '🔎')
            title = f"{icon} {service.capitalize()}"
            content = self._build_service_content(service, data)
            self.console.print(f"[bold]{title}[/]")
            self.console.print(content)
            self.console.print()

        self.console.print(f"[dim]{'-' * 60}[/]")

        if skipped:
            lines = []
            for svc, d in skipped:
                reason = d.get("_meta_error") or d.get("error", "unknown")
                lines.append(f"  [dim]• {svc}: {reason}[/]")
            self.console.print(Panel("\n".join(lines), title="⚠ Serviços Indisponíveis", border_style="dim"))

        self.console.print(f"[dim]{self.t['end_report']}[/]")

    def print_dashboard(self) -> None:
        """Prints the report as a dashboard grid layout."""
        self.console.print()

        header_content = f"[bold cyan]{self.target}[/] [dim]({self.timestamp})[/]"
        header_panel = Panel(
            Align.center(header_content),
            title=self.t['title'],
            border_style="blue",
        )
        self.console.print(header_panel)
        self.console.print(self._get_verdict_panel())

        panels = []
        skipped = []
        for service, data in self.results.items():
            if isinstance(data, dict) and (data.get("error") or data.get("_meta_error")):
                skipped.append((service, data))
                continue

            content = self._build_service_content(service, data)
            color = border_color_for_service(service, data)
            panels.append(Panel(content, title=f"[bold]{service.upper()}[/]", border_style=color))

        self.console.print(Columns(panels, expand=True))

        if skipped:
            lines = []
            for svc, d in skipped:
                reason = d.get("_meta_error") or d.get("error", "unknown")
                lines.append(f"  [dim]• {svc}: {reason}[/]")
            self.console.print()
            self.console.print(Panel("\n".join(lines), title="⚠ Serviços Indisponíveis", border_style="dim"))

