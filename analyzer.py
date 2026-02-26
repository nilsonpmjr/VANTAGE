def generate_heuristic_report(target: str, target_type: str, summary: dict, results_data: dict) -> list[str]:
    """
    Generates a cold (heuristic) analysis report based on the aggregated intelligence data.
    Returns a list of paragraphs (strings) forming the complete analysis.
    """
    report = []
    
    # Header Analysis
    verdict = summary.get("verdict", "UNKNOWN")
    risk_sources = summary.get("risk_sources", 0)
    total_sources = summary.get("total_sources", 0)
    
    type_pt = {"ip": "IP", "domain": "domínio", "hash": "hash"}.get(target_type.lower(), "alvo")
    report.append(f"**Análise do {type_pt}: `{target}`**")
    
    if verdict == "HIGH RISK":
        report.append(f"Este alvo foi classificado como de ALTO RISCO, tendo sido negativado por {risk_sources} de {total_sources} bases de inteligência consultadas.")
    elif verdict == "SUSPICIOUS":
        report.append(f"Este alvo é considerado SUSPEITO. Foram encontrados indícios de atividade maliciosa ou registros anômalos em {risk_sources} de {total_sources} fontes.")
    else:
        report.append(f"A princípio, o alvo parece SEGURO. Nenhuma base principal apontou o alvo como fonte iminente de risco (0 detectores maliciosos em {total_sources} consultas).")

    # Detailed Source Analysis
    details = []
    
    vt_data = results_data.get('virustotal', {})
    if vt_data and not vt_data.get('error'):
        stats = vt_data.get('data', {}).get('attributes', {}).get('last_analysis_stats', {})
        malicious = stats.get('malicious', 0)
        undetected = stats.get('undetected', 0)
        if malicious > 0:
            details.append(f"- **VirusTotal:** {malicious} motores de antivírus ({malicious}/{malicious+undetected}) reportaram o alvo como malicioso.")
        else:
            details.append(f"- **VirusTotal:** Todos os {undetected} motores reportam este indicador como limpo.")
            
        if target_type == 'domain':
            categories = vt_data.get('data', {}).get('attributes', {}).get('categories', {})
            if categories:
                unique_cats = set(categories.values())
                details.append(f"- **VirusTotal (Categorização):** O domínio é tipicamente categorizado como: {', '.join(unique_cats)}.")
            
            resolutions = vt_data.get('data', {}).get('attributes', {}).get('last_dns_records', [])
            if resolutions:
                ips = [r.get('value') for r in resolutions if r.get('type') in ('A', 'AAAA')]
                if ips:
                    details.append(f"- **VirusTotal (Resolução DNS):** O domínio possui registros apontando para os IPs: {', '.join(ips[:3])}.")
            
    abuse_data = results_data.get('abuseipdb', {})
    if abuse_data and not abuse_data.get('error'):
        score = abuse_data.get('data', {}).get('abuseConfidenceScore', 0)
        reports = abuse_data.get('data', {}).get('totalReports', 0)
        isp = abuse_data.get('data', {}).get('isp', 'N/A')
        if score > 0:
            details.append(f"- **AbuseIPDB:** Grau de confiança de abuso é {score}%, baseado em {reports} reportes recentes pela comunidade de cibersegurança (Operador ASN/ISP: {isp}).")
        elif reports == 0:
             details.append(f"- **AbuseIPDB:** Sem queixas recentes de abuso associadas a este IP pertencente a {isp}.")

    alien_data = results_data.get('alienvault', {})
    if alien_data and not alien_data.get('error'):
         pulses = alien_data.get('pulse_info', {}).get('count', 0)
         if pulses > 0:
             details.append(f"- **AlienVault OTX:** Indicador presente em {pulses} Pulsos de Ameaça relatados por pesquisadores.")
         whois = alien_data.get('whois', '')
         if whois and target_type == 'domain':
             if whois.startswith("http"):
                 details.append(f"- **AlienVault (WHOIS):** Fonte de registro WHOIS mapeada para este domínio: [Ver no DomainTools]({whois})")
             else:
                 details.append(f"- **AlienVault (WHOIS):** Há informações de registro WHOIS mapeadas para este domínio: {whois[:60]}...")
             
    shodan_data = results_data.get('shodan', {})
    if shodan_data and not shodan_data.get('error') and not shodan_data.get('_meta_error'):
         ports = shodan_data.get('ports', [])
         vulns = shodan_data.get('vulns', [])
         org = shodan_data.get('org', 'Desconhecida')
         
         shodan_text = f"- **Shodan:** A organização responsável parece ser {org}."
         if ports:
             shodan_text += f" Portas abertas expostas na internet: {', '.join(map(str, ports))}."
         if vulns:
             shodan_text += f" ALERTA: Existem {len(vulns)} CVEs (Vulnerabilidades Conhecidas) associadas ao serviço escaneado."
         details.append(shodan_text)
         
    urlscan_data = results_data.get('urlscan', {})
    if urlscan_data and not urlscan_data.get('error'):
         page = urlscan_data.get('results', [{}])[0].get('page', {})
         if page:
              server = page.get('server', 'Desconhecido')
              ip = page.get('ip', 'Desconhecido')
              details.append(f"- **UrlScan:** O domínio costuma ser hospedado no IP `{ip}` sob a infraestrutura/servidor '{server}'.")
              
    greynoise_data = results_data.get('greynoise', {})
    if greynoise_data and not greynoise_data.get('error') and not greynoise_data.get('_meta_error'):
        classification = greynoise_data.get('classification', 'unknown')
        if classification == 'malicious':
            details.append("- **GreyNoise:** Identificado ativamente escaneando a internet com intenções maliciosas conhecidas.")
        elif classification == 'benign':
             details.append("- **GreyNoise:** Identificado como um serviço de background benigno não atrelado a ataques focionais.")

    # Only append details if there are any specific insights
    if details:
        report.append("### Resumo das Fontes Técnicas:")
        report.append("\n".join(details))
        
    return report

def format_report_to_markdown(report: list[str]) -> str:
    return "\n\n".join(report)
