from fastapi import FastAPI, HTTPException, Query, Depends, status
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.middleware.cors import CORSMiddleware
import asyncio
from typing import Dict, Any, List
from contextlib import asynccontextmanager
from datetime import datetime, timezone, timedelta
from pydantic import BaseModel

from api_client import ThreatIntelClient
from validators import validate_target, ValidationError
from logging_config import setup_logging, get_logger
from analyzer import generate_heuristic_report, format_report_to_markdown
from db import db_manager
from auth import verify_password, get_password_hash, create_access_token, get_current_user, require_role

logger = get_logger("WebAPI")
setup_logging(level="INFO")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Connect to MongoDB
    await db_manager.connect_db()
    yield
    # Shutdown: Close MongoDB connection
    await db_manager.close_db()

app = FastAPI(
    title="Threat Intelligence API", 
    description="API for scanning IPs, Domains, and Hashes against multiple Threat Intel sources.",
    lifespan=lifespan
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

@app.post("/api/auth/login")
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    db = db_manager.db
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")
        
    user = await db.users.find_one({"username": form_data.username})
    if not user or not verify_password(form_data.password, user["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    if user.get("is_active", True) is False:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user account"
        )
        
    access_token = create_access_token(
        data={"sub": user["username"], "role": user.get("role", "tech")}
    )
    return {"access_token": access_token, "token_type": "bearer"}

@app.get("/api/auth/me")
async def read_users_me(current_user: dict = Depends(get_current_user)):
    return current_user

# --- User Management (Admin Only) ---

class UserCreate(BaseModel):
    username: str
    password: str
    role: str
    name: str

class UserUpdate(BaseModel):
    password: str = None
    role: str = None
    name: str = None
    is_active: bool = None

class UserPreferencesUpdate(BaseModel):
    password: str = None
    preferred_lang: str = None
    avatar_base64: str = None

@app.get("/api/users")
async def list_users(current_user: dict = Depends(require_role(["admin"]))):
    db = db_manager.db
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")
    
    users_cursor = db.users.find({}, {"password_hash": 0, "_id": 0})
    users = await users_cursor.to_list(length=100)
    return users

@app.post("/api/users")
async def create_user(user: UserCreate, current_user: dict = Depends(require_role(["admin"]))):
    db = db_manager.db
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")
        
    existing = await db.users.find_one({"username": user.username})
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")
        
    if user.role not in ["admin", "manager", "tech"]:
        raise HTTPException(status_code=400, detail="Invalid role specified")
        
    new_user = {
        "username": user.username,
        "password_hash": get_password_hash(user.password),
        "role": user.role,
        "name": user.name,
        "preferred_lang": "pt",
        "is_active": True,
        "created_at": datetime.now(timezone.utc)
    }
    
    await db.users.insert_one(new_user)
    return {"status": "success", "message": f"User {user.username} created successfully"}

@app.delete("/api/users/{username}")
async def delete_user(username: str, current_user: dict = Depends(require_role(["admin"]))):
    db = db_manager.db
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")
        
    if current_user["username"] == username:
        raise HTTPException(status_code=400, detail="You cannot delete yourself")
        
    result = await db.users.delete_one({"username": username})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
        
    return {"status": "success", "message": f"User {username} deleted successfully"}

@app.put("/api/users/{username}")
async def update_user(username: str, user_update: UserUpdate, current_user: dict = Depends(require_role(["admin"]))):
    db = db_manager.db
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")
        
    existing = await db.users.find_one({"username": username})
    if not existing:
        raise HTTPException(status_code=404, detail="User not found")
        
    update_data = {}
    if user_update.name is not None:
        update_data["name"] = user_update.name
    if user_update.role is not None:
        if user_update.role not in ["admin", "manager", "tech"]:
            raise HTTPException(status_code=400, detail="Invalid role specified")
        # Prevent self-demotion from admin role
        if current_user["username"] == username and existing.get("role") == "admin" and user_update.role != "admin":
             raise HTTPException(status_code=400, detail="You cannot demote your own admin account")
        update_data["role"] = user_update.role
    if user_update.password is not None and len(user_update.password) >= 6:
        update_data["password_hash"] = get_password_hash(user_update.password)
    if user_update.is_active is not None:
        if current_user["username"] == username and user_update.is_active is False:
             raise HTTPException(status_code=400, detail="You cannot suspend your own account")
        update_data["is_active"] = user_update.is_active
        
    if not update_data:
        return {"status": "success", "message": "No fields to update"}
        
    await db.users.update_one({"username": username}, {"$set": update_data})
    
    return {"status": "success", "message": f"User {username} updated successfully"}

@app.put("/api/users/me")
async def update_my_preferences(prefs: UserPreferencesUpdate, current_user: dict = Depends(get_current_user)):
    db = db_manager.db
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")
        
    username = current_user["username"]
    
    update_data = {}
    if prefs.preferred_lang is not None:
        update_data["preferred_lang"] = prefs.preferred_lang
    if prefs.avatar_base64 is not None:
        update_data["avatar_base64"] = prefs.avatar_base64
    if prefs.password is not None and len(prefs.password) >= 6:
        update_data["password_hash"] = get_password_hash(prefs.password)
        
    if not update_data:
        return {"status": "success", "message": "No fields to update"}
        
    await db.users.update_one({"username": username}, {"$set": update_data})
    
    return {"status": "success", "message": "Preferences updated successfully"}

@app.get("/api/status")
async def get_status(current_user: dict = Depends(get_current_user)):
    """Returns the initialization status of all services based on API keys."""
    return {"status": "ok", "services": client.services}

@app.get("/api/analyze")
async def analyze_target(
    target: str = Query(..., description="IP address, Domain, or File Hash"), 
    lang: str = Query("pt", description="Language (pt, en, es)"),
    current_user: dict = Depends(get_current_user)
):
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

    # Check MongoDB Cache for Recent Scans (last 24 hours)
    if db_manager.db is not None:
        try:
            one_day_ago = datetime.now(timezone.utc) - timedelta(days=1)
            cached_scan = await db_manager.db.scans.find_one({
                "target": sanitized,
                "timestamp": {"$gte": one_day_ago}
            }, sort=[("timestamp", -1)])
            
            if cached_scan and "data" in cached_scan:
                logger.info(f"Returning CACHED result for: {sanitized}")
                return cached_scan["data"]
        except Exception as e:
            logger.error(f"Failed to check MongoDB cache: {e}")
            
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
        
    if client.services['abusech']:
        tasks.append(fetch_service('abusech', client.query_abusech, sanitized))
        
    if client.services['pulsedive']:
        tasks.append(fetch_service('pulsedive', client.query_pulsedive, sanitized))
        
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
        elif svc == 'abusech':
            if data.get('query_status') == 'ok' and isinstance(data.get('data'), list) and len(data['data']) > 0:
                risk_score += 1
        elif svc == 'pulsedive':
            if data.get('risk') in ['high', 'critical']:
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

    # Asynchronously save to MongoDB if connected
    if db_manager.db is not None:
        try:
            document = {
                "target": sanitized,
                "type": target_type,
                "timestamp": datetime.now(timezone.utc),
                "risk_score": risk_score,
                "verdict": results["summary"]["verdict"],
                "data": results
            }
            # Fire and forget insertion so we don't block the user response
            asyncio.create_task(db_manager.db.scans.insert_one(document))
        except Exception as e:
            logger.error(f"Failed to save scan to MongoDB: {e}")

    return results

# --- Manager Dashboard Endpoint ---

@app.get("/api/stats")
async def get_dashboard_stats(current_user: dict = Depends(require_role(["admin", "manager"]))):
    db = db_manager.db
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")
        
    try:
        # Total Scans
        total_scans = await db.scans.count_documents({})
        
        # Verdict Distribution
        verdict_pipeline = [
            {"$group": {"_id": "$verdict", "count": {"$sum": 1}}}
        ]
        verdict_cursor = db.scans.aggregate(verdict_pipeline)
        verdict_distribution = await verdict_cursor.to_list(length=None)
        
        # Transform _id to verdict
        verdict_result = [{"name": item["_id"], "value": item["count"]} for item in verdict_distribution]
        
        # Top 5 most queried targets
        top_targets_pipeline = [
            {"$group": {
                "_id": {"target": "$target", "type": "$type"},
                "count": {"$sum": 1},
                "last_verdict": {"$last": "$verdict"}
            }},
            {"$sort": {"count": -1}},
            {"$limit": 5}
        ]
        targets_cursor = db.scans.aggregate(top_targets_pipeline)
        targets_distribution = await targets_cursor.to_list(length=None)
        
        # Flatten top targets
        top_targets_result = [
            {
                "target": item["_id"]["target"],
                "type": item["_id"]["type"],
                "count": item["count"],
                "verdict": item["last_verdict"]
            }
            for item in targets_distribution
        ]
        
        return {
            "totalScans": total_scans,
            "verdictDistribution": verdict_result,
            "topTargets": top_targets_result
        }
        
    except Exception as e:
        logger.error(f"Failed to aggregate stats from MongoDB: {e}")
        raise HTTPException(status_code=500, detail="Internal DB Aggregation Error")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
