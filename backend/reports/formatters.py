"""
Per-service content formatters for Rich terminal output.
"""

import json
from datetime import datetime

from logging_config import get_logger

logger = get_logger(__name__)


def format_service_content(service: str, data: dict, t: dict, get_country_name, get_tag_desc) -> str:
    """
    Formats the inner content string for a single service panel.

    Args:
        service: Service name key (e.g. 'virustotal').
        data: Raw API response dict for the service.
        t: Translation dict for the active language.
        get_country_name: Callable(code) -> str.
        get_tag_desc: Callable(tag) -> str | None.

    Returns:
        Rich markup string ready for console printing.
    """
    if "error" in data:
        return f"[red]Error: {data['error']}[/]"

    if "_meta_error" in data:
        err = data["_meta_error"]
        msg = data.get("_meta_msg", "Unknown error")
        if err == "not_found":
            return f"[dim white]ℹ️  {msg}[/]"
        elif err == "forbidden":
            return f"[yellow]⚠️  {msg}[/]"
        else:
            return f"[red]❌ {msg}[/]"

    lines = []

    if service == 'virustotal':
        try:
            attrs = data.get('data', {}).get('attributes', {})
            stats = attrs.get('last_analysis_stats', {})
            malicious = stats.get('malicious', 0)
            total = sum(stats.values())

            color = "red" if malicious > 0 else "green"
            lines.append(f"• {t['score']}: [{color}]{malicious}/{total} {t['vendors']}[/]")

            votes = attrs.get('total_votes', {})
            if votes:
                h = votes.get('harmless', 0)
                m = votes.get('malicious', 0)
                lines.append(f"• {t['votes']}: [green]👍 {h}[/] / [red]👎 {m}[/]")

            last_scan = attrs.get('last_analysis_date')
            if last_scan:
                dt = datetime.fromtimestamp(last_scan).strftime('%Y-%m-%d')
                lines.append(f"• {t['last_analysis']}: {dt}")

            network = attrs.get('network')
            if network:
                lines.append(f"• {t['network']}: {network}")

            filename = attrs.get('meaningful_name')
            if not filename:
                names = attrs.get('names')
                if names:
                    filename = names[0]
            if filename:
                lines.append(f"• {t['filename']}: {filename}")

            if 'country' in attrs:
                lines.append(f"• {t['country']}: {get_country_name(attrs['country'])}")
            if 'as_owner' in attrs:
                lines.append(f"• {t['org']}: {attrs['as_owner']}")

            tags = attrs.get('tags', [])
            if tags:
                lines.append(f"• Tags: [dim]{', '.join(tags[:5])}[/]")
                for tag in tags[:5]:
                    desc = get_tag_desc(tag)
                    if desc:
                        lines.append(f"  [dim italic]↳ {tag}: {desc}[/]")
        except Exception as e:
            logger.error(f"Error parsing VirusTotal data: {e}")
            lines.append("[yellow]Error parsing data[/]")

    elif service == 'abuseipdb':
        try:
            d = data.get('data', {})
            score = d.get('abuseConfidenceScore', 0)
            color = "red" if score > 0 else "green"
            lines.append(f"• {t['confidence']}: [{color}]{score}%[/]")
            lines.append(f"• {t['reports']}: {d.get('totalReports', 0)}")

            last_reported = d.get('lastReportedAt')
            if last_reported:
                try:
                    dt = datetime.fromisoformat(last_reported).strftime('%Y-%m-%d')
                    lines.append(f"• {t['last_reported']}: {dt}")
                except Exception as exc:
                    logger.debug(f"Could not parse AbuseIPDB lastReportedAt={last_reported!r}: {exc}")

            lines.append(f"• {t['usage_type']}: {d.get('usageType', 'N/A')}")
            if 'countryCode' in d:
                lines.append(f"• {t['country']}: {get_country_name(d['countryCode'])}")
            if 'isp' in d:
                lines.append(f"• {t['isp']}: {d['isp']}")
            if 'domain' in d:
                lines.append(f"• {t['domain']}: {d['domain']}")
        except Exception as e:
            logger.error(f"Error parsing AbuseIPDB data: {e}")
            lines.append("[yellow]Error parsing data[/]")

    elif service == 'shodan':
        try:
            lines.append(f"• {t['os']}: {data.get('os', 'N/A')}")
            lines.append(f"• {t['org']}: {data.get('org', 'N/A')}")
            if 'city' in data and 'country_name' in data:
                lines.append(f"• {t['city']}/{t['country']}: {data.get('city')}, {data.get('country_name')}")

            hostnames = data.get('hostnames', [])
            if hostnames:
                lines.append(f"• {t['hostnames']}: {', '.join(hostnames[:3])}")

            last_update = data.get('last_update')
            if last_update:
                try:
                    dt = datetime.fromisoformat(last_update.split('.')[0]).strftime('%Y-%m-%d')
                    lines.append(f"• {t['last_analysis']}: {dt}")
                except Exception as exc:
                    logger.debug(f"Could not parse Shodan last_update={last_update!r}: {exc}")

            ports = data.get('ports', [])
            lines.append(f"• {t['ports']}: {', '.join(map(str, ports)) if ports else 'None'}")
            if 'vulns' in data:
                lines.append(f"• {t['vulns']}: [red]{len(data['vulns'])} detected[/]")
        except Exception as e:
            logger.error(f"Error parsing Shodan data: {e}")
            lines.append("[yellow]Error parsing data[/]")

    elif service == 'alienvault':
        try:
            pulse_info = data.get('pulse_info', {})
            count = pulse_info.get('count', 0)
            color = "red" if count > 0 else "green"
            lines.append(f"• {t['pulses']}: [{color}]{count}[/]")
            lines.append(f"  [dim italic]↳ {t['pulse_desc']}[/]")

            pulses = pulse_info.get('pulses', [])
            if pulses:
                names = [p.get('name') for p in pulses[:3]]
                lines.append(f"• {t['pulse_names']}: [dim]{', '.join(names)}[/]")

            if 'country_name' in data:
                lines.append(f"• {t['country']}: {data.get('country_name')}")
            if 'city' in data:
                lines.append(f"• {t['city']}: {data.get('city')}")
        except Exception as e:
            logger.error(f"Error parsing AlienVault data: {e}")
            lines.append("[yellow]Error parsing data[/]")

    elif service == 'greynoise':
        try:
            noise = data.get('noise', False)
            riot = data.get('riot', False)
            lines.append(f"• Noise: {'[red]Yes[/]' if noise else '[green]No[/]'}")
            if noise:
                lines.append(f"  [dim italic]↳ {t['noise_desc']}[/]")

            lines.append(f"• RIOT: {'[green]Yes[/]' if riot else '[blue]No[/]'}")
            lines.append(f"  [dim italic]↳ {t['riot_desc']}[/]")

            lines.append(f"• {t['class']}: {data.get('classification', 'unknown')}")

            actor = data.get('actor')
            if actor and actor != 'unknown':
                lines.append(f"• {t['actor']}: {actor}")

            bot = data.get('bot')
            if bot:
                lines.append(f"• {t['bot']}: {bot}")

            last_seen = data.get('last_seen')
            if last_seen:
                lines.append(f"• {t['last_seen']}: {last_seen}")
        except Exception as e:
            logger.error(f"Error parsing GreyNoise data: {e}")
            lines.append("[yellow]Error parsing data[/]")

    elif service == 'urlscan':
        try:
            lines.append(f"• {t['total_scans']}: {data.get('total', 0)}")

            results = data.get('results', [])
            if results:
                last_res = results[0]
                page = last_res.get('page', {})
                task = last_res.get('task', {})

                if 'title' in page:
                    lines.append(f"• {t['page_title']}: {page.get('title')}")
                if 'server' in page:
                    lines.append(f"• {t['server']}: {page.get('server')}")
                if 'country' in page:
                    lines.append(f"• {t['country']}: {get_country_name(page.get('country'))}")
                if 'time' in task:
                    try:
                        dt = datetime.fromisoformat(task.get('time').replace('Z', '+00:00')).strftime('%Y-%m-%d')
                        lines.append(f"• {t['last_analysis']}: {dt}")
                    except Exception as exc:
                        logger.debug(f"Could not parse UrlScan time={task.get('time')!r}: {exc}")
        except Exception as e:
            logger.error(f"Error parsing UrlScan data: {e}")
            lines.append("[yellow]Error parsing data[/]")

    elif service == 'blacklistmaster':
        try:
            if isinstance(data, dict) and data.get("_meta_msg") == "No content returned":
                lines.append("• [green]Status: Clean (Not found on any blacklists)[/]")
            elif isinstance(data, dict) and data.get("_meta_error"):
                lines.append(f"• [yellow]Status: {data.get('_meta_msg', 'Source returned an error')}[/]")
            else:
                lines.append("• [red]Status: Found on blacklists[/]")
                try:
                    raw_str = json.dumps(data)
                    if len(raw_str) > 150:
                        raw_str = raw_str[:147] + "..."
                    lines.append(f"  [dim]Data: {raw_str}[/]")
                except Exception as exc:
                    logger.debug(f"Could not serialize BlacklistMaster payload: {exc}")
        except Exception as e:
            logger.error(f"Error parsing BlacklistMaster data: {e}")
            lines.append("[yellow]Error parsing data[/]")

    elif service == 'abusech':
        try:
            if (
                data.get('query_status') == 'ok'
                and isinstance(data.get('data'), list)
                and len(data['data']) > 0
            ):
                threat = data['data'][0]
                lines.append(f"• [red]{t['threat']}: {threat.get('threat_type', 'Unknown')}[/]")
                lines.append(f"• {t['confidence']}: {threat.get('confidence_level', 0)}%")
            else:
                lines.append(f"• [green]{t['clean_threats']}[/]")
        except Exception as e:
            logger.error(f"Error parsing Abuse.ch data: {e}")
            lines.append("[yellow]Error parsing data[/]")

    elif service == 'urlhaus':
        try:
            urls_online = int(data.get('urls_online', 0) or 0)
            url_count = int(data.get('url_count', 0) or 0)
            if urls_online > 0 or url_count > 0:
                color = "red" if urls_online > 0 else "yellow"
                lines.append(f"• [{color}]{t['urlhaus_urls_online']}: {urls_online}[/]")
                lines.append(f"• {t['urlhaus_urls_total']}: {url_count}")
            else:
                lines.append(f"• [green]{t['urlhaus_clean']}[/]")
        except Exception as e:
            logger.error(f"Error parsing URLhaus data: {e}")
            lines.append("[yellow]Error parsing data[/]")

    elif service == 'pulsedive':
        try:
            risk = data.get('risk', 'none')
            color = "red" if risk in ['high', 'critical'] else "green"
            lines.append(f"• {t['risk_level']}: [{color}]{risk.upper()}[/]")
            lines.append(f"• {t['feeds']}: {len(data.get('feeds', [])) if data.get('feeds') else 0}")
        except Exception as e:
            logger.error(f"Error parsing Pulsedive data: {e}")
            lines.append("[yellow]Error parsing data[/]")

    return "\n".join(lines)


def border_color_for_service(service: str, data: dict) -> str:
    """Returns the Rich border color for a service panel based on its risk."""
    if service == 'virustotal':
        if data.get('data', {}).get('attributes', {}).get('last_analysis_stats', {}).get('malicious', 0) > 0:
            return "red"
    elif service == 'abuseipdb':
        if data.get('data', {}).get('abuseConfidenceScore', 0) > 0:
            return "red"
    elif service == 'blacklistmaster':
        if not (isinstance(data, dict) and data.get("_meta_msg") == "No content returned"):
            if "error" not in data and "_meta_error" not in (data if isinstance(data, dict) else {}):
                return "red"
    elif service == 'abusech':
        if (
            data.get('query_status') == 'ok'
            and isinstance(data.get('data'), list)
            and len(data['data']) > 0
        ):
            return "red"
    elif service == 'urlhaus':
        urls_online = int(data.get('urls_online', 0) or 0)
        url_count = int(data.get('url_count', 0) or 0)
        if urls_online > 0:
            return "red"
        if url_count > 0:
            return "yellow"
    elif service == 'pulsedive':
        if data.get('risk') in ['high', 'critical']:
            return "red"
    return "white"
