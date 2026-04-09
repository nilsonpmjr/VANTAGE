from datetime import datetime, timezone
from typing import Any

from bson import ObjectId


async def migrate_shift_handoff_incidents(db) -> dict[str, int]:
    migrated_handoffs = 0
    created_incidents = 0
    reused_incidents = 0

    cursor = db.shift_handoffs.find({}).sort("created_at", -1)
    async for handoff in cursor:
      incidents = list(handoff.get("incidents", []))
      if not incidents:
        continue

      changed = False
      for index, incident in enumerate(incidents):
        incident_id = incident.get("incident_id")
        persistent_doc = None

        if incident_id:
          try:
            persistent_doc = await db.shift_handoff_incidents.find_one({"_id": ObjectId(incident_id)})
          except Exception:
            persistent_doc = None

        if persistent_doc:
          reused_incidents += 1
          continue

        new_incident_id = ObjectId(incident_id) if incident_id else ObjectId()
        now = handoff.get("updated_at") or handoff.get("created_at") or datetime.now(timezone.utc)
        incident_doc: dict[str, Any] = {
          "_id": new_incident_id,
          "handoff_id": handoff["_id"],
          "handoff_shift_date": handoff.get("shift_date", ""),
          "team_members": handoff.get("team_members", []),
          "created_at": handoff.get("created_at", now),
          "created_by": handoff.get("created_by", ""),
          "updated_at": now,
          "updated_by": handoff.get("created_by", ""),
          "resolved_at": now if incident.get("status") == "resolved" else None,
          "resolved_by": handoff.get("created_by", "") if incident.get("status") == "resolved" else "",
          "title": incident.get("title", ""),
          "severity": incident.get("severity", "medium"),
          "status": incident.get("status", "active"),
          "action_needed": incident.get("action_needed", ""),
        }
        await db.shift_handoff_incidents.insert_one(incident_doc)
        incidents[index] = {
          "incident_id": str(new_incident_id),
          "title": incident.get("title", ""),
          "status": incident.get("status", "active"),
          "severity": incident.get("severity", "medium"),
          "action_needed": incident.get("action_needed", ""),
        }
        created_incidents += 1
        changed = True

      if changed:
        await db.shift_handoffs.update_one({"_id": handoff["_id"]}, {"$set": {"incidents": incidents}})
        migrated_handoffs += 1

    return {
      "migrated_handoffs": migrated_handoffs,
      "created_incidents": created_incidents,
      "reused_incidents": reused_incidents,
    }
