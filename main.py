from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
import asyncio
from typing import Dict, Any

from api_client import ThreatIntelClient
from validators import validate_target, ValidationError
from logging_config import setup_logging, get_logger
from analyzer import generate_heuristic_report, format_report_to_markdown

logger = get_logger("WebAPI")
setup_logging(level="INFO")

app = FastAPI(
    title="Threat Intelligence API", 
    description="API for scanning IPs, Domains, and Hashes against multiple Threat Intel sources."
)

# Configure CORS for the frontend (Vite default is 5173, but we allow all for MVP)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global client initialization
client = ThreatIntelClient()

@app.get("/api/status")
async def get_status():
    """Returns the initialization status of all services based on API keys."""
    return {"status": "ok", "services": client.services}

@app.get("/api/analyze")
async def analyze_target(target: str = Query(..., description="IP address, Domain, or File Hash"), lang: str = Query("pt", description="Language (pt, en, es)")):
    """
    Analyzes a target using all configured Threat Intelligence services.
    Returns aggregated JSON data.
    """
    try:
        validated = validate_target(target)
        sanitized = validated.sanitized
        target_type = validated.target_type
        
        logger.info(f"API Request - Target: {sanitized} ({target_type})")
        
    except ValidationError as e:
        logger.warning(f"Validation error for target '{target}': {e}")
        raise HTTPException(status_code=400, detail=str(e))
        
    results: Dict[str, Any] = {
        "target": sanitized,
        "type": target_type,
        "results": {}
    }
    
    # Since api_client uses synchronous `requests`, we wrap them in asyncio.to_thread 
    # so they don't block the FastAPI event loop during concurrent requests.
    async def fetch_service(service_name: str, func, *args):
        try:
            res = await asyncio.to_thread(func, *args)
            return service_name, res
        except Exception as e:
            logger.error(f"Error fetching {service_name}: {e}")
            return service_name, {"error": str(e)}

    tasks = []
    
    if client.services['virustotal']:
        vt_type = 'file' if target_type == 'hash' else target_type
        tasks.append(fetch_service('virustotal', client.query_virustotal, sanitized, vt_type))
        
    if client.services['alienvault']:
        otx_type = 'file' if target_type == 'hash' else target_type
        tasks.append(fetch_service('alienvault', client.query_alienvault, sanitized, otx_type))
        
    if target_type == 'ip':
        if client.services['abuseipdb']:
            tasks.append(fetch_service('abuseipdb', client.query_abuseipdb, sanitized))
        if client.services['shodan']:
            tasks.append(fetch_service('shodan', client.query_shodan, sanitized))
        if client.services['greynoise']:
            tasks.append(fetch_service('greynoise', client.query_greynoise, sanitized))
        if client.services['blacklistmaster']:
            tasks.append(fetch_service('blacklistmaster', client.query_blacklistmaster, sanitized))
            
    if target_type == 'domain':
        if client.services['urlscan']:
            tasks.append(fetch_service('urlscan', client.query_urlscan, sanitized))
            
    if not tasks:
         logger.warning("No services available for this target type (or no API keys configured).")
         results["results"]["error"] = {"error": "No services configured or compatible with this target type."}
         return results

    # Wait for all API queries to complete
    completed_tasks = await asyncio.gather(*tasks)
    
    for service_name, data in completed_tasks:
        results["results"][service_name] = data
        
    # Analyze Risk overall (basic logic mapped from ReportGenerator)
    risk_score = 0
    total_sources = len(completed_tasks)
    
    for svc, data in completed_tasks:
        if not data or "error" in data or "_meta_error" in data:
            continue
            
        if svc == 'virustotal':
            malicious = data.get('data', {}).get('attributes', {}).get('last_analysis_stats', {}).get('malicious', 0)
            if malicious >= 3: risk_score += 1
        elif svc == 'abuseipdb':
            if data.get('data', {}).get('abuseConfidenceScore', 0) >= 25: risk_score += 1
        elif svc == 'alienvault':
            if data.get('pulse_info', {}).get('count', 0) > 0: risk_score += 1
        elif svc == 'urlscan':
            if data.get('data', {}).get('verdict', {}).get('score', 0) > 0: risk_score += 1
        elif svc == 'greynoise':
             if data.get('classification') == 'malicious': risk_score += 1
        elif svc == 'blacklistmaster':
            if not isinstance(data, dict) or data.get("_meta_msg") != "No content returned":
                risk_score += 1
                
    results["summary"] = {
        "risk_sources": risk_score,
        "total_sources": total_sources,
        "verdict": "HIGH RISK" if risk_score >= 2 else ("SUSPICIOUS" if risk_score == 1 else "SAFE")
    }

    # Generate heuristic report for all supported languages dynamically
    report_lines_pt = generate_heuristic_report(sanitized, target_type, results["summary"], results["results"], lang="pt")
    report_lines_en = generate_heuristic_report(sanitized, target_type, results["summary"], results["results"], lang="en")
    report_lines_es = generate_heuristic_report(sanitized, target_type, results["summary"], results["results"], lang="es")
    
    # Store both the legacy default string and the new multi-language dict
    results["analysis_report"] = format_report_to_markdown(report_lines_pt if lang == 'pt' else (report_lines_en if lang == 'en' else report_lines_es))
    results["analysis_reports"] = {
        "pt": format_report_to_markdown(report_lines_pt),
        "en": format_report_to_markdown(report_lines_en),
        "es": format_report_to_markdown(report_lines_es)
    }

    return results

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
