"""
Heuristic report generator for Threat Intelligence Tool.

Generates human-readable analysis reports in PT-BR, EN, and ES based on
aggregated results from multiple threat intelligence APIs.
"""

# ---------------------------------------------------------------------------
# Translation templates (module-level to avoid re-creation on every call)
# ---------------------------------------------------------------------------

_TEMPLATES = {
    "pt": {
        "target_types": {"ip": "IP", "domain": "domínio", "hash": "hash"},
        "header": "Análise do {type}: `{target}`",
        "high_risk": (
            "Este alvo foi classificado como de ALTO RISCO, tendo sido negativado por "
            "{risk} de {total} bases de inteligência consultadas."
        ),
        "suspicious": (
            "Este alvo é considerado SUSPEITO. Foram encontrados indícios de atividade "
            "maliciosa ou registros anômalos em {risk} de {total} fontes."
        ),
        "safe": (
            "A princípio, o alvo parece SEGURO. Nenhuma base principal apontou o alvo "
            "como fonte iminente de risco (0 detectores maliciosos em {total} consultas)."
        ),
        "vt_bad": "- **VirusTotal:** {malicious} motores de antivírus ({malicious}/{total}) reportaram o alvo como malicioso.",
        "vt_good": "- **VirusTotal:** Todos os {undetected} motores reportam este indicador como limpo.",
        "vt_cat": "- **VirusTotal (Categorização):** O domínio é tipicamente categorizado como: {cats}.",
        "vt_dns": "- **VirusTotal (Resolução DNS):** O domínio possui registros apontando para os IPs: {ips}.",
        "abuse_bad": (
            "- **AbuseIPDB:** Grau de confiança de abuso é {score}%, baseado em {reports} "
            "reportes recentes pela comunidade de cibersegurança (Operador ASN/ISP: {isp})."
        ),
        "abuse_good": "- **AbuseIPDB:** Sem queixas recentes de abuso associadas a este IP pertencente a {isp}.",
        "alien": "- **AlienVault OTX:** Indicador presente em {pulses} Pulsos de Ameaça relatados por pesquisadores.",
        "alien_whois_link": "- **AlienVault (WHOIS):** Fonte de registro WHOIS mapeada para este domínio: [Ver no DomainTools]({whois})",
        "alien_whois_text": "- **AlienVault (WHOIS):** Há informações de registro WHOIS mapeadas para este domínio: {whois}...",
        "shodan_org": "- **Shodan:** A organização responsável parece ser {org}.",
        "shodan_ports": " Portas abertas expostas na internet: {ports}.",
        "shodan_vulns": " ALERTA: Existem {vulns} CVEs (Vulnerabilidades Conhecidas) associadas ao serviço escaneado.",
        "urlscan": "- **UrlScan:** O domínio costuma ser hospedado no IP `{ip}` sob a infraestrutura/servidor '{server}'.",
        "grey_mal": "- **GreyNoise:** Identificado ativamente escaneando a internet com intenções maliciosas conhecidas.",
        "grey_ben": "- **GreyNoise:** Identificado como um serviço de background benigno não atrelado a ataques focionais.",
        "abusech_bad": "- **Abuse.ch (ThreatFox):** Indicador listado na base de dados de ameaças ativas (Nível: {confidence}%, Ameaça: {threat_type}).",
        "pulsedive_bad": "- **Pulsedive:** Risco reportado como {risk}. Detectado através de {feeds} feeds de inteligência.",
        "summary_title": "### Resumo das Fontes Técnicas:",
        "unknown_org": "Desconhecida",
        "unknown": "Desconhecido",
    },
    "en": {
        "target_types": {"ip": "IP", "domain": "domain", "hash": "hash"},
        "header": "Analysis of the {type}: `{target}`",
        "high_risk": (
            "This target was classified as HIGH RISK, flagged by "
            "{risk} out of {total} queried intelligence databases."
        ),
        "suspicious": (
            "This target is considered SUSPICIOUS. Anomalous records or malicious activity "
            "indicators were found in {risk} out of {total} sources."
        ),
        "safe": (
            "Initially, the target appears SAFE. No major database flagged it as an imminent "
            "risk source (0 malicious detectors across {total} queries)."
        ),
        "vt_bad": "- **VirusTotal:** {malicious} antivirus engines ({malicious}/{total}) reported the target as malicious.",
        "vt_good": "- **VirusTotal:** All {undetected} engines report this indicator as clean.",
        "vt_cat": "- **VirusTotal (Categorization):** The domain is typically categorized as: {cats}.",
        "vt_dns": "- **VirusTotal (DNS Resolution):** The domain has records pointing to the IPs: {ips}.",
        "abuse_bad": (
            "- **AbuseIPDB:** Abuse confidence score is {score}%, based on {reports} recent "
            "reports by the cybersecurity community (ASN/ISP Operator: {isp})."
        ),
        "abuse_good": "- **AbuseIPDB:** No recent abuse complaints associated with this IP belonging to {isp}.",
        "alien": "- **AlienVault OTX:** Indicator present in {pulses} Threat Pulses reported by researchers.",
        "alien_whois_link": "- **AlienVault (WHOIS):** WHOIS registration source mapped for this domain: [View on DomainTools]({whois})",
        "alien_whois_text": "- **AlienVault (WHOIS):** There is WHOIS registration information mapped for this domain: {whois}...",
        "shodan_org": "- **Shodan:** The responsible organization appears to be {org}.",
        "shodan_ports": " Open ports exposed to the internet: {ports}.",
        "shodan_vulns": " ALERT: There are {vulns} CVEs (Known Vulnerabilities) associated with the scanned service.",
        "urlscan": "- **UrlScan:** The domain is typically hosted on IP `{ip}` under the '{server}' infrastructure/server.",
        "grey_mal": "- **GreyNoise:** Actively identified scanning the internet with known malicious intent.",
        "grey_ben": "- **GreyNoise:** Identified as a benign background service not linked to targeted attacks.",
        "abusech_bad": "- **Abuse.ch (ThreatFox):** Indicator listed in the active threats database (Confidence: {confidence}%, Threat: {threat_type}).",
        "pulsedive_bad": "- **Pulsedive:** Risk reported as {risk}. Found via {feeds} intelligence feeds.",
        "summary_title": "### Technical Sources Summary:",
        "unknown_org": "Unknown",
        "unknown": "Unknown",
    },
    "es": {
        "target_types": {"ip": "IP", "domain": "dominio", "hash": "hash"},
        "header": "Análisis del {type}: `{target}`",
        "high_risk": (
            "Este objetivo fue clasificado como de ALTO RIESGO, habiendo sido marcado negativamente "
            "por {risk} de {total} bases de datos de inteligencia consultadas."
        ),
        "suspicious": (
            "Este objetivo se considera SOSPECHOSO. Se encontraron indicios de actividad maliciosa "
            "o registros anómalos en {risk} de {total} fuentes."
        ),
        "safe": (
            "En principio, el objetivo parece SEGURO. Ninguna base principal señaló el objetivo "
            "como fuente de riesgo inminente (0 detectores maliciosos en {total} consultas)."
        ),
        "vt_bad": "- **VirusTotal:** {malicious} motores antivirus ({malicious}/{total}) reportaron el objetivo como malicioso.",
        "vt_good": "- **VirusTotal:** Todos los {undetected} motores reportan este indicador como limpio.",
        "vt_cat": "- **VirusTotal (Categorización):** El dominio se categoriza típicamente como: {cats}.",
        "vt_dns": "- **VirusTotal (Resolución DNS):** El dominio tiene registros apuntando a las IPs: {ips}.",
        "abuse_bad": (
            "- **AbuseIPDB:** La puntuación de confianza de abuso es del {score}%, basada en "
            "{reports} reportes recientes de la comunidad de ciberseguridad (Operador ASN/ISP: {isp})."
        ),
        "abuse_good": "- **AbuseIPDB:** Sin quejas recientes de abuso asociadas a esta IP perteneciente a {isp}.",
        "alien": "- **AlienVault OTX:** Indicador presente en {pulses} Pulsos de Amenaza reportados por investigadores.",
        "alien_whois_link": "- **AlienVault (WHOIS):** Fuente de registro WHOIS mapeada para este dominio: [Ver en DomainTools]({whois})",
        "alien_whois_text": "- **AlienVault (WHOIS):** Hay información de registro WHOIS mapeada para este dominio: {whois}...",
        "shodan_org": "- **Shodan:** La organización responsable parece ser {org}.",
        "shodan_ports": " Puertos abiertos expuestos en internet: {ports}.",
        "shodan_vulns": " ALERTA: Existen {vulns} CVEs (Vulnerabilidades Conocidas) asociadas al servicio escaneado.",
        "urlscan": "- **UrlScan:** El dominio suele estar alojado en la IP `{ip}` bajo la infraestructura/servidor '{server}'.",
        "grey_mal": "- **GreyNoise:** Identificado activamente escaneando internet con intenciones maliciosas conocidas.",
        "grey_ben": "- **GreyNoise:** Identificado como un servicio de fondo benigno no vinculado a ataques focalizados.",
        "abusech_bad": "- **Abuse.ch (ThreatFox):** Indicador listado en la base de datos de amenazas activas (Nivel: {confidence}%, Amenaza: {threat_type}).",
        "pulsedive_bad": "- **Pulsedive:** Riesgo reportado como {risk}. Encontrado a través de {feeds} feeds de inteligencia.",
        "summary_title": "### Resumen de las Fuentes Técnicas:",
        "unknown_org": "Desconocida",
        "unknown": "Desconocido",
    },
}


def _t(key: str, lang: str, **kwargs) -> str:
    """Retrieve and format a translation template."""
    template = _TEMPLATES[lang].get(key, _TEMPLATES["en"].get(key, key))
    return template.format(**kwargs) if kwargs else template


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def generate_heuristic_report(
    target: str,
    target_type: str,
    summary: dict,
    results_data: dict,
    lang: str = "pt",
) -> list:
    """
    Generate a heuristic analysis report from aggregated intelligence data.

    Args:
        target:       The IoC (IP, domain, or hash).
        target_type:  'ip', 'domain', or 'hash'.
        summary:      Dict with keys 'verdict', 'risk_sources', 'total_sources'.
        results_data: Dict of service_name → raw API response dict.
        lang:         Output language ('pt', 'en', 'es').

    Returns:
        List of Markdown-formatted strings forming the report.
    """
    lang = lang.lower()
    if lang not in _TEMPLATES:
        lang = "pt"

    verdict = summary.get("verdict", "UNKNOWN")
    risk_sources = summary.get("risk_sources", 0)
    total_sources = summary.get("total_sources", 0)

    loc = _TEMPLATES[lang]
    report = []

    type_loc = loc["target_types"].get(target_type.lower(), "alvo")
    report.append("**" + _t("header", lang, type=type_loc, target=target) + "**")

    if verdict == "HIGH RISK":
        report.append(_t("high_risk", lang, risk=risk_sources, total=total_sources))
    elif verdict == "SUSPICIOUS":
        report.append(_t("suspicious", lang, risk=risk_sources, total=total_sources))
    else:
        report.append(_t("safe", lang, risk=risk_sources, total=total_sources))

    details = []

    # VirusTotal
    vt_data = results_data.get("virustotal", {})
    if vt_data and not vt_data.get("error"):
        stats = vt_data.get("data", {}).get("attributes", {}).get("last_analysis_stats", {})
        malicious = stats.get("malicious", 0)
        undetected = stats.get("undetected", 0)
        if malicious > 0:
            details.append(_t("vt_bad", lang, malicious=malicious, total=malicious + undetected))
        else:
            details.append(_t("vt_good", lang, undetected=undetected))

        if target_type == "domain":
            categories = vt_data.get("data", {}).get("attributes", {}).get("categories", {})
            if categories:
                details.append(_t("vt_cat", lang, cats=", ".join(set(categories.values()))))
            resolutions = vt_data.get("data", {}).get("attributes", {}).get("last_dns_records", [])
            ips = [r.get("value") for r in resolutions if r.get("type") in ("A", "AAAA")]
            if ips:
                details.append(_t("vt_dns", lang, ips=", ".join(ips[:3])))

    # AbuseIPDB
    abuse_data = results_data.get("abuseipdb", {})
    if abuse_data and not abuse_data.get("error"):
        score = abuse_data.get("data", {}).get("abuseConfidenceScore", 0)
        reports = abuse_data.get("data", {}).get("totalReports", 0)
        isp = abuse_data.get("data", {}).get("isp", "N/A")
        if score > 0:
            details.append(_t("abuse_bad", lang, score=score, reports=reports, isp=isp))
        elif reports == 0:
            details.append(_t("abuse_good", lang, isp=isp))

    # AlienVault OTX
    alien_data = results_data.get("alienvault", {})
    if alien_data and not alien_data.get("error"):
        pulses = alien_data.get("pulse_info", {}).get("count", 0)
        if pulses > 0:
            details.append(_t("alien", lang, pulses=pulses))
        whois = alien_data.get("whois", "")
        if whois and target_type == "domain":
            if whois.startswith("http"):
                details.append(_t("alien_whois_link", lang, whois=whois))
            else:
                details.append(_t("alien_whois_text", lang, whois=whois[:60]))

    # Shodan
    shodan_data = results_data.get("shodan", {})
    if shodan_data and not shodan_data.get("error") and not shodan_data.get("_meta_error"):
        ports = shodan_data.get("ports", [])
        vulns = shodan_data.get("vulns", [])
        org = shodan_data.get("org", loc["unknown_org"])
        shodan_text = _t("shodan_org", lang, org=org)
        if ports:
            shodan_text += _t("shodan_ports", lang, ports=", ".join(map(str, ports)))
        if vulns:
            shodan_text += _t("shodan_vulns", lang, vulns=len(vulns))
        details.append(shodan_text)

    # UrlScan
    urlscan_data = results_data.get("urlscan", {})
    if urlscan_data and not urlscan_data.get("error"):
        page = urlscan_data.get("results", [{}])[0].get("page", {})
        if page:
            server = page.get("server", loc["unknown"])
            ip = page.get("ip", loc["unknown"])
            details.append(_t("urlscan", lang, ip=ip, server=server))

    # GreyNoise
    greynoise_data = results_data.get("greynoise", {})
    if greynoise_data and not greynoise_data.get("error") and not greynoise_data.get("_meta_error"):
        classification = greynoise_data.get("classification", "unknown")
        if classification == "malicious":
            details.append(_t("grey_mal", lang))
        elif classification == "benign":
            details.append(_t("grey_ben", lang))

    # Abuse.ch ThreatFox
    abusech_data = results_data.get("abusech", {})
    if abusech_data and not abusech_data.get("error") and abusech_data.get("query_status") == "ok":
        data_list = abusech_data.get("data", [])
        if data_list:
            first = data_list[0]
            confidence = first.get("confidence_level", 0)
            threat_type = first.get("threat_type", "unknown")
            details.append(_t("abusech_bad", lang, confidence=confidence, threat_type=threat_type))

    # Pulsedive
    pulsedive_data = results_data.get("pulsedive", {})
    if pulsedive_data and not pulsedive_data.get("error") and not pulsedive_data.get("_meta_error"):
        risk = pulsedive_data.get("risk", "none")
        if risk in ["high", "critical"]:
            feeds = pulsedive_data.get("feeds", [])
            details.append(
                _t("pulsedive_bad", lang, risk=risk.upper(), feeds=len(feeds) if hasattr(feeds, "__len__") else 0)
            )

    if details:
        report.append(_t("summary_title", lang))
        report.append("\n".join(details))

    return report


def format_report_to_markdown(report: list) -> str:
    """Join report lines with double newlines for Markdown rendering."""
    return "\n\n".join(report)
