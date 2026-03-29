"""
Structured analysis report generator for VANTAGE.

The current generation path is deterministic and provider-backed. It produces:

- a geo summary derived from public provider data already returned to VANTAGE
- structured analyst report sections for UI rendering
- plain-text report output for PDF/export flows

Future enhancement hook:
- SOCC chat / LLM enrichment can be layered on top of these sections later,
  but the v1 contract remains fully functional without external inference.
"""

from __future__ import annotations

from typing import Any

from reports.translations import COUNTRY_MAP


_PACKS = {
    "pt": {
        "target_types": {"ip": "IP", "domain": "domínio", "hash": "hash"},
        "titles": {
            "executive": "Executive Assessment",
            "infrastructure": "Infrastructure & Geolocation",
            "signals": "Threat Signals",
            "confidence": "Confidence & Coverage",
            "actions": "Recommended Actions",
        },
        "status": {
            "HIGH RISK": "alto risco",
            "SUSPICIOUS": "suspeito",
            "SAFE": "seguro",
            "UNKNOWN": "indeterminado",
        },
        "executive": (
            "O {type} {target} foi classificado como {status}. "
            "{risk} de {total} fontes ativas retornaram sinais de risco, resultando em um threat score de {score}%."
        ),
        "no_sources": "Nenhuma fonte ativa retornou dados suficientes para sustentar uma conclusão mais forte.",
        "geo_sentence": (
            "{source} posiciona a infraestrutura em {location}, com atribuição principal observada em {entity}."
        ),
        "geo_absent": "Nenhuma geolocalização confiável pôde ser inferida a partir das bases públicas consultadas.",
        "ports": "Há exposição observável em {ports}.",
        "entity": "O operador ou provedor mais fortemente associado a este alvo é {entity}.",
        "vt_bad": "VirusTotal reporta {malicious} motores maliciosos em {total} verificações.",
        "vt_good": "VirusTotal não registrou motores classificando o indicador como malicioso.",
        "abuse_bad": "AbuseIPDB aponta confiança de abuso de {score}% com {reports} reportes recentes associados a {isp}.",
        "abuse_good": "AbuseIPDB não traz histórico recente de abuso para a infraestrutura observada.",
        "alien": "AlienVault OTX mantém o indicador presente em {pulses} pulses de ameaça.",
        "shodan": "Shodan associa o ativo a {org} e observou portas expostas em {ports}.",
        "shodan_no_ports": "Shodan associou o ativo a {org}, sem destacar portas expostas relevantes.",
        "shodan_vulns": "O inventário do Shodan ainda cita {vulns} vulnerabilidades conhecidas associadas ao serviço exposto.",
        "urlscan": "Urlscan conecta o artefato ao IP {ip} sob o servidor ou edge {server}.",
        "greynoise_mal": "GreyNoise classifica a atividade como maliciosa e compatível com scanning ativo.",
        "greynoise_benign": "GreyNoise enquadra o comportamento como ruído benigno de internet.",
        "abusech": "Abuse.ch lista o indicador em sua base ativa com confiança de {confidence}% para a ameaça {threat_type}.",
        "pulsedive": "Pulsedive descreve o risco como {risk} com apoio de {feeds} feeds de inteligência.",
        "confidence": (
            "A análise foi construída sobre {total} fontes ativas, com {risk} retornos de risco e {clean} retornos não críticos."
        ),
        "confidence_geo": "A geolocalização entrou como contexto auxiliar e não como fator isolado de veredito.",
        "action_high_1": "Tratar o alvo como incidente em potencial, preservando IOC, ASN/ISP e localização observada para correlação imediata.",
        "action_high_2": "Cruzar a infraestrutura com Exposure, Watchlist e histórico do Dashboard para verificar recorrência.",
        "action_high_3": "Escalonar para hunting direcionado e containment quando o ativo pertencer ao seu perímetro ou cadeia crítica.",
        "action_suspicious_1": "Manter o alvo em observação e comparar a infraestrutura com eventos recentes do Feed e Notifications.",
        "action_suspicious_2": "Executar nova análise em janela posterior para confirmar persistência dos sinais.",
        "action_suspicious_3": "Promover para fluxo de investigação quando houver reforço por novas fontes ou contexto operacional.",
        "action_safe_1": "Registrar o resultado como baseline limpo, sem descartar monitoramento futuro.",
        "action_safe_2": "Revalidar o alvo caso a infraestrutura, geolocalização ou reputação mudem em novas consultas.",
        "unknown_entity": "entidade ainda não classificada",
        "unknown_location": "localização não determinada",
    },
    "en": {
        "target_types": {"ip": "IP", "domain": "domain", "hash": "hash"},
        "titles": {
            "executive": "Executive Assessment",
            "infrastructure": "Infrastructure & Geolocation",
            "signals": "Threat Signals",
            "confidence": "Confidence & Coverage",
            "actions": "Recommended Actions",
        },
        "status": {
            "HIGH RISK": "high risk",
            "SUSPICIOUS": "suspicious",
            "SAFE": "safe",
            "UNKNOWN": "undetermined",
        },
        "executive": (
            "The {type} {target} was classified as {status}. "
            "{risk} of {total} active sources returned risk signals, resulting in a {score}% threat score."
        ),
        "no_sources": "No active source returned enough evidence to support a stronger conclusion.",
        "geo_sentence": (
            "{source} places the infrastructure in {location}, with primary attribution observed under {entity}."
        ),
        "geo_absent": "No reliable geolocation could be inferred from the public intelligence sources consulted.",
        "ports": "Observable exposure is present on {ports}.",
        "entity": "The operator or provider most strongly associated with this target is {entity}.",
        "vt_bad": "VirusTotal reports {malicious} malicious engines across {total} checks.",
        "vt_good": "VirusTotal did not register engines classifying this indicator as malicious.",
        "abuse_bad": "AbuseIPDB reports an abuse confidence score of {score}% with {reports} recent reports tied to {isp}.",
        "abuse_good": "AbuseIPDB does not show a recent abuse history for the observed infrastructure.",
        "alien": "AlienVault OTX keeps the indicator in {pulses} threat pulses.",
        "shodan": "Shodan associates the asset with {org} and observed exposed ports on {ports}.",
        "shodan_no_ports": "Shodan associated the asset with {org} without highlighting relevant exposed ports.",
        "shodan_vulns": "The Shodan inventory still cites {vulns} known vulnerabilities tied to the exposed service.",
        "urlscan": "Urlscan connects the artifact to IP {ip} behind the server or edge {server}.",
        "greynoise_mal": "GreyNoise classifies the activity as malicious and consistent with active scanning.",
        "greynoise_benign": "GreyNoise classifies the behavior as benign internet background noise.",
        "abusech": "Abuse.ch lists the indicator in its active database with {confidence}% confidence for threat {threat_type}.",
        "pulsedive": "Pulsedive describes the risk as {risk} with backing from {feeds} intelligence feeds.",
        "confidence": (
            "This assessment was built from {total} active sources, with {risk} risky returns and {clean} non-critical returns."
        ),
        "confidence_geo": "Geolocation is treated as supporting context, not as a standalone verdict factor.",
        "action_high_1": "Handle the target as a potential incident and preserve IOC, ASN/ISP and observed location for immediate correlation.",
        "action_high_2": "Cross-check the infrastructure against Exposure, Watchlist and Dashboard history for recurrence.",
        "action_high_3": "Escalate to focused hunting and containment when the asset belongs to your perimeter or critical chain.",
        "action_suspicious_1": "Keep the target under observation and compare the infrastructure with recent Feed and Notifications events.",
        "action_suspicious_2": "Run a follow-up analysis later to confirm whether the signals persist.",
        "action_suspicious_3": "Promote to an investigation flow when new sources or operational context reinforce the signals.",
        "action_safe_1": "Record the result as a clean baseline without discarding future monitoring.",
        "action_safe_2": "Revalidate the target if infrastructure, geolocation or reputation changes in later queries.",
        "unknown_entity": "an unclassified entity",
        "unknown_location": "an undetermined location",
    },
    "es": {
        "target_types": {"ip": "IP", "domain": "dominio", "hash": "hash"},
        "titles": {
            "executive": "Executive Assessment",
            "infrastructure": "Infrastructure & Geolocation",
            "signals": "Threat Signals",
            "confidence": "Confidence & Coverage",
            "actions": "Recommended Actions",
        },
        "status": {
            "HIGH RISK": "alto riesgo",
            "SUSPICIOUS": "sospechoso",
            "SAFE": "seguro",
            "UNKNOWN": "indeterminado",
        },
        "executive": (
            "El {type} {target} fue clasificado como {status}. "
            "{risk} de {total} fuentes activas devolvieron señales de riesgo, resultando en un threat score de {score}%."
        ),
        "no_sources": "Ninguna fuente activa devolvió evidencia suficiente para sostener una conclusión más fuerte.",
        "geo_sentence": (
            "{source} sitúa la infraestructura en {location}, con atribución principal observada bajo {entity}."
        ),
        "geo_absent": "No se pudo inferir una geolocalización confiable a partir de las fuentes públicas consultadas.",
        "ports": "Existe exposición observable en {ports}.",
        "entity": "El operador o proveedor más fuertemente asociado a este objetivo es {entity}.",
        "vt_bad": "VirusTotal reporta {malicious} motores maliciosos en {total} verificaciones.",
        "vt_good": "VirusTotal no registró motores clasificando este indicador como malicioso.",
        "abuse_bad": "AbuseIPDB informa una confianza de abuso del {score}% con {reports} reportes recientes vinculados a {isp}.",
        "abuse_good": "AbuseIPDB no muestra historial reciente de abuso para la infraestructura observada.",
        "alien": "AlienVault OTX mantiene el indicador en {pulses} pulses de amenaza.",
        "shodan": "Shodan asocia el activo con {org} y observó puertos expuestos en {ports}.",
        "shodan_no_ports": "Shodan asoció el activo con {org} sin destacar puertos expuestos relevantes.",
        "shodan_vulns": "El inventario de Shodan aún cita {vulns} vulnerabilidades conocidas asociadas al servicio expuesto.",
        "urlscan": "Urlscan conecta el artefacto con la IP {ip} detrás del servidor o edge {server}.",
        "greynoise_mal": "GreyNoise clasifica la actividad como maliciosa y consistente con scanning activo.",
        "greynoise_benign": "GreyNoise clasifica el comportamiento como ruido benigno de internet.",
        "abusech": "Abuse.ch lista el indicador en su base activa con {confidence}% de confianza para la amenaza {threat_type}.",
        "pulsedive": "Pulsedive describe el riesgo como {risk} con respaldo de {feeds} feeds de inteligencia.",
        "confidence": (
            "Esta evaluación se construyó con {total} fuentes activas, con {risk} retornos de riesgo y {clean} retornos no críticos."
        ),
        "confidence_geo": "La geolocalización se trata como contexto de apoyo y no como factor aislado de veredicto.",
        "action_high_1": "Tratar el objetivo como un incidente potencial y preservar IOC, ASN/ISP y ubicación observada para correlación inmediata.",
        "action_high_2": "Cruzar la infraestructura con Exposure, Watchlist y el historial del Dashboard para detectar recurrencia.",
        "action_high_3": "Escalar a hunting dirigido y contención cuando el activo pertenezca a tu perímetro o cadena crítica.",
        "action_suspicious_1": "Mantener el objetivo en observación y comparar la infraestructura con eventos recientes de Feed y Notifications.",
        "action_suspicious_2": "Ejecutar un nuevo análisis después para confirmar la persistencia de las señales.",
        "action_suspicious_3": "Promover a investigación cuando nuevas fuentes o el contexto operacional refuercen las señales.",
        "action_safe_1": "Registrar el resultado como baseline limpio sin descartar monitoreo futuro.",
        "action_safe_2": "Revalidar el objetivo si cambian la infraestructura, la geolocalización o la reputación en consultas posteriores.",
        "unknown_entity": "una entidad aún no clasificada",
        "unknown_location": "una ubicación indeterminada",
    },
}

_REPORT_META = {
    "strategy": "heuristic_v2",
    "future_enhancer": {
        "provider": "socc_chat",
        "enabled": False,
        "surface": "site_chat",
    },
}


def _pack(lang: str) -> dict[str, Any]:
    language = (lang or "pt").lower()
    return _PACKS.get(language, _PACKS["pt"])


def _clean_str(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _pick_first(*values: Any) -> str | None:
    for value in values:
        cleaned = _clean_str(value)
        if cleaned:
            return cleaned
    return None


def _country_name(country: Any, code: Any = None) -> str | None:
    if _clean_str(country):
        return str(country).strip()
    country_code = _clean_str(code)
    if not country_code:
        return None
    return COUNTRY_MAP.get(country_code.upper(), country_code.upper())


def _format_location(city: str | None, region: str | None, country: str | None) -> str | None:
    parts = [part for part in [city, region, country] if part]
    if not parts:
        return None
    return ", ".join(parts)


def _extract_shodan_geo(data: dict[str, Any]) -> dict[str, Any]:
    return {
        "source": "Shodan",
        "city": _pick_first(data.get("city")),
        "region": _pick_first(data.get("region_code"), data.get("region_name")),
        "country": _country_name(data.get("country_name"), data.get("country_code")),
        "country_code": _pick_first(data.get("country_code")),
        "org": _pick_first(data.get("org")),
        "isp": _pick_first(data.get("isp")),
        "asn": _pick_first(data.get("asn")),
        "latitude": data.get("latitude"),
        "longitude": data.get("longitude"),
        "ip": _pick_first(data.get("ip_str"), data.get("ip")),
    }


def _extract_greynoise_geo(data: dict[str, Any]) -> dict[str, Any]:
    return {
        "source": "GreyNoise",
        "city": _pick_first(data.get("city")),
        "region": _pick_first(data.get("region")),
        "country": _country_name(data.get("country_name"), data.get("country")),
        "country_code": _pick_first(data.get("country")),
        "org": _pick_first(data.get("organization"), data.get("name")),
        "isp": _pick_first(data.get("spoofable"), data.get("organization")),
        "asn": _pick_first(data.get("asn")),
        "ip": _pick_first(data.get("ip")),
    }


def _extract_abuseipdb_geo(data: dict[str, Any]) -> dict[str, Any]:
    hostnames = data.get("hostnames")
    first_hostname = hostnames[0] if isinstance(hostnames, list) and hostnames else None
    return {
        "source": "AbuseIPDB",
        "city": _pick_first(data.get("city")),
        "region": _pick_first(data.get("state"), data.get("region")),
        "country": _country_name(data.get("countryName"), data.get("countryCode")),
        "country_code": _pick_first(data.get("countryCode")),
        "org": _pick_first(data.get("domain")),
        "isp": _pick_first(data.get("isp"), data.get("usageType")),
        "asn": _pick_first(first_hostname),
        "ip": _pick_first(data.get("ipAddress")),
    }


def _extract_virustotal_geo(data: dict[str, Any]) -> dict[str, Any]:
    attrs = data.get("data", {}).get("attributes", {})
    return {
        "source": "VirusTotal",
        "city": _pick_first(attrs.get("city")),
        "region": _pick_first(attrs.get("region")),
        "country": _country_name(attrs.get("country_name"), attrs.get("country")),
        "country_code": _pick_first(attrs.get("country")),
        "org": _pick_first(attrs.get("as_owner")),
        "isp": _pick_first(attrs.get("as_owner")),
        "asn": _pick_first(attrs.get("asn"), attrs.get("as_number")),
    }


def _extract_urlscan_geo(data: dict[str, Any]) -> dict[str, Any]:
    results_list = data.get("results", [])
    page = results_list[0].get("page", {}) if results_list else {}
    return {
        "source": "Urlscan",
        "city": _pick_first(page.get("city")),
        "region": _pick_first(page.get("region")),
        "country": _country_name(page.get("country_name"), page.get("country")),
        "country_code": _pick_first(page.get("country")),
        "org": _pick_first(page.get("asnname"), page.get("server")),
        "isp": _pick_first(page.get("server")),
        "asn": _pick_first(page.get("asn")),
        "ip": _pick_first(page.get("ip")),
    }


def _extract_ip2location_geo(data: dict[str, Any]) -> dict[str, Any]:
    return {
        "source": "IP2Location",
        "city": _pick_first(data.get("city_name"), data.get("city", {}).get("name") if isinstance(data.get("city"), dict) else None),
        "region": _pick_first(data.get("region_name"), data.get("region", {}).get("name") if isinstance(data.get("region"), dict) else None),
        "country": _country_name(
            data.get("country_name"),
            data.get("country_code"),
        ) or _pick_first(data.get("country", {}).get("name") if isinstance(data.get("country"), dict) else None),
        "country_code": _pick_first(data.get("country_code")),
        "org": _pick_first(data.get("as"), data.get("domain")),
        "isp": _pick_first(data.get("isp")),
        "asn": _pick_first(data.get("asn")),
        "latitude": data.get("latitude"),
        "longitude": data.get("longitude"),
        "ip": _pick_first(data.get("ip")),
    }


def build_geo_summary(target: str, target_type: str, results_data: dict[str, Any]) -> dict[str, Any]:
    candidates: list[dict[str, Any]] = []

    ip2location_data = results_data.get("ip2location")
    if isinstance(ip2location_data, dict) and not ip2location_data.get("_meta_error"):
        candidates.append(_extract_ip2location_geo(ip2location_data))

    shodan_data = results_data.get("shodan")
    if isinstance(shodan_data, dict) and not shodan_data.get("_meta_error"):
        candidates.append(_extract_shodan_geo(shodan_data))

    greynoise_data = results_data.get("greynoise")
    if isinstance(greynoise_data, dict) and not greynoise_data.get("_meta_error"):
        candidates.append(_extract_greynoise_geo(greynoise_data))

    abuse_data = results_data.get("abuseipdb", {}).get("data")
    if isinstance(abuse_data, dict):
        candidates.append(_extract_abuseipdb_geo(abuse_data))

    vt_data = results_data.get("virustotal")
    if isinstance(vt_data, dict):
        candidates.append(_extract_virustotal_geo(vt_data))

    urlscan_data = results_data.get("urlscan")
    if isinstance(urlscan_data, dict) and not urlscan_data.get("_meta_error"):
        candidates.append(_extract_urlscan_geo(urlscan_data))

    useful = [
        candidate for candidate in candidates
        if any(candidate.get(field) for field in ("city", "country", "org", "isp", "asn", "ip"))
    ]
    if not useful:
        return {
            "target": target,
            "target_type": target_type,
            "available": False,
            "source": None,
            "display_location": None,
        }

    primary = useful[0]
    merged: dict[str, Any] = {
        "target": target,
        "target_type": target_type,
        "available": True,
    }
    for field in ("city", "region", "country", "country_code", "org", "isp", "asn", "ip"):
        merged[field] = next((_clean_str(item.get(field)) for item in useful if _clean_str(item.get(field))), None)

    merged["source"] = primary.get("source")
    merged["latitude"] = next((item.get("latitude") for item in useful if item.get("latitude") is not None), None)
    merged["longitude"] = next((item.get("longitude") for item in useful if item.get("longitude") is not None), None)
    merged["display_location"] = _format_location(
        merged.get("city"),
        merged.get("region"),
        merged.get("country"),
    )
    merged["display_entity"] = _pick_first(merged.get("org"), merged.get("isp"), merged.get("asn"))
    merged["resolution_path"] = [item.get("source") for item in useful if item.get("source")]
    return merged


def _score_to_percent(risk_sources: int, total_sources: int) -> int:
    if not total_sources:
        return 0
    return round((risk_sources / total_sources) * 100)


def _provider_signal_lines(results_data: dict[str, Any], lang: str) -> list[str]:
    pack = _pack(lang)
    lines: list[str] = []

    vt_data = results_data.get("virustotal", {})
    if vt_data and not vt_data.get("_meta_error"):
        stats = vt_data.get("data", {}).get("attributes", {}).get("last_analysis_stats", {})
        malicious = stats.get("malicious", 0)
        total = sum(value for value in stats.values() if isinstance(value, int)) or malicious
        if malicious > 0:
          lines.append(pack["vt_bad"].format(malicious=malicious, total=total))
        else:
          lines.append(pack["vt_good"])

    abuse_data = results_data.get("abuseipdb", {}).get("data", {})
    if abuse_data:
        score = abuse_data.get("abuseConfidenceScore", 0)
        reports = abuse_data.get("totalReports", 0)
        isp = _pick_first(abuse_data.get("isp"), abuse_data.get("domain"), pack["unknown_entity"]) or pack["unknown_entity"]
        if score > 0 or reports > 0:
            lines.append(pack["abuse_bad"].format(score=score, reports=reports, isp=isp))
        else:
            lines.append(pack["abuse_good"])

    alien_data = results_data.get("alienvault", {})
    if alien_data and not alien_data.get("_meta_error"):
        pulses = alien_data.get("pulse_info", {}).get("count", 0)
        if pulses > 0:
            lines.append(pack["alien"].format(pulses=pulses))

    shodan_data = results_data.get("shodan", {})
    if shodan_data and not shodan_data.get("_meta_error"):
        org = _pick_first(shodan_data.get("org"), pack["unknown_entity"]) or pack["unknown_entity"]
        ports = shodan_data.get("ports", [])
        if ports:
            lines.append(pack["shodan"].format(org=org, ports=", ".join(map(str, ports[:6]))))
        else:
            lines.append(pack["shodan_no_ports"].format(org=org))
        vulns = shodan_data.get("vulns", [])
        if vulns:
            lines.append(pack["shodan_vulns"].format(vulns=len(vulns)))

    urlscan_data = results_data.get("urlscan", {})
    if urlscan_data and not urlscan_data.get("_meta_error"):
        results_list = urlscan_data.get("results", [])
        page = results_list[0].get("page", {}) if results_list else {}
        if page:
            lines.append(
                pack["urlscan"].format(
                    ip=_pick_first(page.get("ip"), "unknown") or "unknown",
                    server=_pick_first(page.get("server"), "unknown") or "unknown",
                )
            )

    greynoise_data = results_data.get("greynoise", {})
    if greynoise_data and not greynoise_data.get("_meta_error"):
        classification = greynoise_data.get("classification", "")
        if classification == "malicious":
            lines.append(pack["greynoise_mal"])
        elif classification == "benign":
            lines.append(pack["greynoise_benign"])

    abusech_data = results_data.get("abusech", {})
    if abusech_data and not abusech_data.get("_meta_error") and abusech_data.get("query_status") == "ok":
        data_list = abusech_data.get("data", [])
        if data_list:
            first = data_list[0]
            lines.append(
                pack["abusech"].format(
                    confidence=first.get("confidence_level", 0),
                    threat_type=first.get("threat_type", "unknown"),
                )
            )

    pulsedive_data = results_data.get("pulsedive", {})
    if pulsedive_data and not pulsedive_data.get("_meta_error"):
        risk = _pick_first(pulsedive_data.get("risk"))
        if risk:
            feeds = pulsedive_data.get("feeds", [])
            lines.append(pack["pulsedive"].format(risk=str(risk).upper(), feeds=len(feeds) if hasattr(feeds, "__len__") else 0))

    return lines


def generate_analysis_sections(
    target: str,
    target_type: str,
    summary: dict[str, Any],
    results_data: dict[str, Any],
    lang: str = "pt",
    geo_summary: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    pack = _pack(lang)
    geo = geo_summary or build_geo_summary(target, target_type, results_data)

    verdict = summary.get("verdict", "UNKNOWN")
    risk_sources = int(summary.get("risk_sources", 0) or 0)
    total_sources = int(summary.get("total_sources", 0) or 0)
    score = _score_to_percent(risk_sources, total_sources)
    target_label = pack["target_types"].get(target_type.lower(), target_type.upper())
    status_label = pack["status"].get(verdict, pack["status"]["UNKNOWN"])

    sections: list[dict[str, Any]] = [
        {
            "id": "executive_assessment",
            "title": pack["titles"]["executive"],
            "body": [
                pack["executive"].format(
                    type=target_label,
                    target=target,
                    status=status_label,
                    risk=risk_sources,
                    total=total_sources,
                    score=score,
                ),
            ],
        }
    ]

    infra_body: list[str] = []
    if geo.get("available"):
        location = geo.get("display_location") or pack["unknown_location"]
        entity = geo.get("display_entity") or pack["unknown_entity"]
        infra_body.append(
            pack["geo_sentence"].format(
                source=geo.get("source") or "geo resolver",
                location=location,
                entity=entity,
            )
        )
    else:
        infra_body.append(pack["geo_absent"])

    ports = results_data.get("shodan", {}).get("ports", [])
    if ports:
        infra_body.append(pack["ports"].format(ports=", ".join(map(str, ports[:6]))))

    sections.append(
        {
            "id": "infrastructure_geolocation",
            "title": pack["titles"]["infrastructure"],
            "body": [line for line in infra_body if line],
        }
    )

    signal_lines = _provider_signal_lines(results_data, lang)[:3]
    sections.append(
        {
            "id": "threat_signals",
            "title": pack["titles"]["signals"],
            "body": signal_lines or [pack["no_sources"]],
        }
    )

    sections.append(
        {
            "id": "confidence_coverage",
            "title": pack["titles"]["confidence"],
            "body": [
                pack["confidence"].format(
                    total=total_sources,
                    risk=risk_sources,
                    clean=max(total_sources - risk_sources, 0),
                ),
            ],
        }
    )

    if verdict == "HIGH RISK":
        actions = [pack["action_high_1"], pack["action_high_2"]]
    elif verdict == "SUSPICIOUS":
        actions = [pack["action_suspicious_1"], pack["action_suspicious_2"]]
    else:
        actions = [pack["action_safe_1"]]

    sections.append(
        {
            "id": "recommended_actions",
            "title": pack["titles"]["actions"],
            "body": actions,
        }
    )

    for section in sections:
        section["body"] = [line for line in section["body"] if line]

    return sections


def format_report_sections_to_text(sections: list[dict[str, Any]]) -> str:
    parts: list[str] = []
    for section in sections:
        title = _clean_str(section.get("title"))
        body = section.get("body") or []
        if title:
            parts.append(title)
        for line in body:
            cleaned = _clean_str(line)
            if cleaned:
                parts.append(f"• {cleaned}")
        parts.append("")
    return "\n".join(parts).strip()


def generate_heuristic_report(
    target: str,
    target_type: str,
    summary: dict[str, Any],
    results_data: dict[str, Any],
    lang: str = "pt",
) -> list[str]:
    """
    Compatibility wrapper returning plain text lines derived from the
    structured sections used by the v1 UI.
    """
    geo_summary = build_geo_summary(target, target_type, results_data)
    sections = generate_analysis_sections(
        target=target,
        target_type=target_type,
        summary=summary,
        results_data=results_data,
        lang=lang,
        geo_summary=geo_summary,
    )
    lines: list[str] = []
    for section in sections:
        title = _clean_str(section.get("title"))
        if title:
            lines.append(title)
        for line in section.get("body", []):
            cleaned = _clean_str(line)
            if cleaned:
                lines.append(f"• {cleaned}")
    return lines


def format_report_to_markdown(report: list[str]) -> str:
    """
    Compatibility name retained for existing callers.

    The v1 report output is now plain text without Markdown emphasis markers.
    """
    return "\n\n".join(report)


def analysis_meta() -> dict[str, Any]:
    return {
        "report_strategy": _REPORT_META["strategy"],
        "future_enhancer": dict(_REPORT_META["future_enhancer"]),
    }
