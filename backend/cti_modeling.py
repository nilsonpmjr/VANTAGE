"""
Utilities for the initial CTI modeling readiness snapshot.

This first slice is intentionally honest: it exposes the feature pack already
available in the feed runtime and the labeling universe we can work with next,
without pretending a trained model already exists.
"""

from __future__ import annotations

from collections import Counter
from typing import Any


FEATURE_COLUMNS = [
    "family",
    "severity",
    "story_kind",
    "headline_score",
    "topics",
    "source_name",
    "published_at",
]

NEXT_STEPS = [
    "label campaign and incident stories for triage ranking",
    "separate analyst labels from editorial heuristics",
    "evaluate a lightweight prioritization model on RSS stories",
]


def _priority_band(score: int) -> str:
    if score >= 45:
        return "priority_high"
    if score >= 20:
        return "priority_medium"
    return "priority_low"


def build_cti_modeling_snapshot(items: list[dict[str, Any]]) -> dict[str, Any]:
    editorial_items: list[dict[str, Any]] = []
    topic_counter: Counter[str] = Counter()
    story_kind_counter: Counter[str] = Counter()
    family_counter: Counter[str] = Counter()
    priority_counter: Counter[str] = Counter()

    for item in items:
        editorial = item.get("editorial") or item.get("data", {}).get("attributes", {}).get("editorial") or {}
        if not editorial:
            continue

        editorial_items.append(item)

        family = str(item.get("family") or "unknown")
        family_counter[family] += 1

        story_kind = str(editorial.get("story_kind") or "brief")
        story_kind_counter[story_kind] += 1

        for topic in editorial.get("topics") or []:
            topic_counter[str(topic)] += 1

        headline_score = int(editorial.get("headline_score") or 0)
        priority_counter[_priority_band(headline_score)] += 1

    ready_items = len(editorial_items)
    newsworthy_items = sum(
        1
        for item in editorial_items
        if (item.get("editorial") or item.get("data", {}).get("attributes", {}).get("editorial") or {}).get("is_newsworthy")
    )

    return {
        "phase": "feature_pack_ready",
        "objective": "cti_story_prioritization",
        "model_status": "ready_for_labeling",
        "eligible_items": ready_items,
        "newsworthy_items": newsworthy_items,
        "feature_columns": FEATURE_COLUMNS,
        "topic_distribution": [
            {"topic": topic, "count": count}
            for topic, count in topic_counter.most_common(5)
        ],
        "story_kind_distribution": [
            {"story_kind": story_kind, "count": count}
            for story_kind, count in story_kind_counter.most_common()
        ],
        "family_distribution": [
            {"family": family, "count": count}
            for family, count in family_counter.most_common()
        ],
        "priority_bands": {
            "high": priority_counter.get("priority_high", 0),
            "medium": priority_counter.get("priority_medium", 0),
            "low": priority_counter.get("priority_low", 0),
        },
        "next_steps": NEXT_STEPS,
    }
