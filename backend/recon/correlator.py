"""
Recon correlator — builds Attack Surface and extracts Risk Indicators
from a finished recon job's results dict.

Used by:
  - GET /recon/{job_id}  (adds attack_surface + risk_indicators to export payload)
  - ReconPage.jsx frontend (mirrors logic for inline display)
"""

from datetime import datetime, timezone


def correlate(results: dict) -> dict:
    """
    Build structured Attack Surface from module results.

    Args:
        results: dict of {module_name: {status, data, duration_ms, from_cache}}

    Returns:
        {
            "exposed_services": [...],
            "infrastructure": {...},
            "certificates": {...},
            "passive": {...},
            "subdomains": [...],
        }
    """

    def _data(module: str) -> dict | None:
        entry = results.get(module)
        if not entry or entry.get("status") == "error":
            return None
        d = entry.get("data")
        if not d or d.get("error") or d.get("skipped"):
            return None
        return d

    dns = _data("dns")
    whois = _data("whois")
    ssl = _data("ssl")
    web = _data("web")
    ports = _data("ports")
    passive = _data("passive")
    subdomains = _data("subdomains")

    # ── Exposed Services ──────────────────────────────────────────────
    exposed_services = []
    if ports and ports.get("ports"):
        for p in ports["ports"]:
            svc = {
                "port": p.get("port"),
                "protocol": p.get("protocol", "tcp"),
                "service": p.get("service", ""),
                "product": p.get("product", ""),
                "version": p.get("version", ""),
            }
            exposed_services.append(svc)

    if web and web.get("status_code"):
        # Add HTTP/HTTPS as a synthetic service if not already from nmap
        http_ports = {s["port"] for s in exposed_services}
        final_url = web.get("final_url", "")
        port_hint = 443 if final_url.startswith("https") else 80
        if port_hint not in http_ports:
            exposed_services.append({
                "port": port_hint,
                "protocol": "tcp",
                "service": "https" if port_hint == 443 else "http",
                "product": web.get("server", ""),
                "version": "",
            })

    # ── Infrastructure ────────────────────────────────────────────────
    infrastructure = {}
    if dns:
        infrastructure["a_records"] = dns.get("A", [])
        infrastructure["aaaa_records"] = dns.get("AAAA", [])
        infrastructure["mx_records"] = dns.get("MX", [])
        infrastructure["ns_records"] = dns.get("NS", [])
        infrastructure["txt_records"] = dns.get("TXT", [])
    if whois:
        infrastructure["registrar"] = whois.get("registrar")
        infrastructure["registrant_country"] = whois.get("registrant_country")
        infrastructure["creation_date"] = whois.get("creation_date")
        infrastructure["expiration_date"] = whois.get("expiration_date")
        infrastructure["name_servers"] = whois.get("name_servers", [])
        infrastructure["org"] = whois.get("org")
    if web:
        infrastructure["technologies"] = web.get("technologies", [])
        infrastructure["server"] = web.get("server")
        infrastructure["final_url"] = web.get("final_url")
        infrastructure["title"] = web.get("title")

    # ── Certificates ──────────────────────────────────────────────────
    certificates = {}
    if ssl:
        certificates = {
            "subject_cn": ssl.get("subject_cn"),
            "issuer_cn": ssl.get("issuer_cn"),
            "not_after": ssl.get("not_after"),
            "days_until_expiry": ssl.get("days_until_expiry"),
            "is_expired": ssl.get("is_expired", False),
            "is_self_signed": ssl.get("is_self_signed", False),
            "protocol": ssl.get("protocol"),
            "sans": ssl.get("sans", []),
        }

    # ── Passive ───────────────────────────────────────────────────────
    passive_data = {}
    if passive:
        passive_data = {
            "emails": passive.get("emails", []),
            "ips": passive.get("ips", []),
        }

    subs = []
    if subdomains:
        subs = subdomains.get("subdomains", [])
    # Also merge passive subdomains
    if passive:
        for s in passive.get("subdomains", []):
            if s not in subs:
                subs.append(s)

    return {
        "exposed_services": exposed_services,
        "infrastructure": infrastructure,
        "certificates": certificates,
        "passive": passive_data,
        "subdomains": subs,
    }


def extract_risks(results: dict) -> list[dict]:
    """
    Extract risk indicators from module results.

    Returns list of {severity, category, message} dicts.
    """
    risks = []

    def _data(module: str) -> dict | None:
        entry = results.get(module)
        if not entry or entry.get("status") == "error":
            return None
        d = entry.get("data")
        if not d or d.get("error") or d.get("skipped"):
            return None
        return d

    ssl = _data("ssl")
    web = _data("web")
    ports = _data("ports")
    passive = _data("passive")
    subdomains = _data("subdomains")

    # SSL risks
    if ssl:
        if ssl.get("is_expired"):
            risks.append({"severity": "critical", "category": "ssl", "message": "SSL certificate is expired"})
        elif ssl.get("days_until_expiry") is not None and ssl["days_until_expiry"] < 30:
            risks.append({"severity": "high", "category": "ssl",
                          "message": f"SSL certificate expires in {ssl['days_until_expiry']} days"})
        if ssl.get("is_self_signed"):
            risks.append({"severity": "medium", "category": "ssl", "message": "SSL certificate is self-signed"})
        protocol = ssl.get("protocol", "")
        if protocol in ("TLSv1", "TLSv1.0", "TLSv1.1", "SSLv3"):
            risks.append({"severity": "high", "category": "ssl",
                          "message": f"Deprecated TLS protocol in use: {protocol}"})

    # Web / security headers
    if web:
        sec = web.get("security_headers", {})
        missing = [h for h, present in sec.items() if not present]
        if "Strict-Transport-Security" in missing:
            risks.append({"severity": "medium", "category": "web", "message": "Missing HSTS header"})
        if "Content-Security-Policy" in missing:
            risks.append({"severity": "medium", "category": "web", "message": "Missing Content-Security-Policy header"})
        if "X-Frame-Options" in missing:
            risks.append({"severity": "low", "category": "web", "message": "Missing X-Frame-Options header"})
        if web.get("x_powered_by"):
            risks.append({"severity": "low", "category": "web",
                          "message": f"Server technology exposed: {web['x_powered_by']}"})

    # Non-standard open ports
    if ports and ports.get("ports"):
        standard = {21, 22, 23, 25, 53, 80, 110, 143, 443, 587, 993, 995, 3306, 5432, 6379, 8080, 8443}
        for p in ports["ports"]:
            if p.get("port") and p["port"] not in standard:
                risks.append({"severity": "low", "category": "ports",
                               "message": f"Non-standard port open: {p['port']}/{p.get('protocol','tcp')} ({p.get('service','')})"})

    # Passive harvested emails
    if passive and passive.get("emails"):
        count = len(passive["emails"])
        risks.append({"severity": "info", "category": "passive",
                      "message": f"{count} email address(es) found — potential phishing targets"})

    # Large subdomain footprint
    sub_count = len(subdomains.get("subdomains", [])) if subdomains else 0
    if passive:
        sub_count += len(passive.get("subdomains", []))
    if sub_count > 20:
        risks.append({"severity": "info", "category": "subdomains",
                      "message": f"Large attack surface: {sub_count} subdomains discovered"})

    return risks
