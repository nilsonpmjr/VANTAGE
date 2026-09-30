"""LeafWiki domain service translated from Go to Python for RedMode evidence.

Translates and unifies LeafWiki core subsystems:
- Tree hierarchy & nested sections (internal/core/tree)
- Page move, copy, pin, and position ordering (internal/wiki/pages)
- User favorites and bookmarks (internal/favorites)
- Broken links detection and automatic link refactoring (internal/links)
- Tag indexer and aggregation (internal/tags)
- YAML Frontmatter parser and multi-page bundle import/export (internal/markdown, internal/wiki/importer)
"""

from __future__ import annotations

from datetime import datetime, timezone
import io
import re
from typing import Any
import zipfile

import yaml


_SLUG_CLEAN_RE = re.compile(r"[^a-z0-9_-]+")
_WIKILINK_RE = re.compile(r"\[\[([^\]\n]+)\]\]")
_FRONTMATTER_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n?", re.DOTALL)
_CODE_BLOCK_RE = re.compile(r"(```[\s\S]*?```|`[^`\n]+`)")


def slugify(text: str) -> str:
    """Generate a clean URL-safe slug from a title, mimicking LeafWiki slug service."""
    if not text:
        return "untitled"
    normalized = text.strip().lower()
    cleaned = _SLUG_CLEAN_RE.sub("-", normalized).strip("-")
    return cleaned or "page"


def parse_markdown_frontmatter(content: str) -> tuple[dict[str, Any], str]:
    """Parse YAML frontmatter header and return (metadata_dict, body_markdown)."""
    match = _FRONTMATTER_RE.match(content)
    if not match:
        # Fallback: extract title from first H1 if present
        metadata: dict[str, Any] = {}
        lines = content.splitlines()
        for line in lines:
            stripped = line.strip()
            if stripped.startswith("# "):
                metadata["title"] = stripped[2:].strip()
                break
        return metadata, content

    yaml_block = match.group(1)
    body = content[match.end():]
    try:
        data = yaml.safe_load(yaml_block)
        if isinstance(data, dict):
            return data, body
    except Exception:
        pass
    return {}, content


def dump_markdown_frontmatter(metadata: dict[str, Any], body: str) -> str:
    """Serialize metadata into YAML frontmatter followed by markdown body."""
    clean_meta = {k: v for k, v in metadata.items() if v is not None and v != [] and v != ""}
    if not clean_meta:
        return body
    yaml_header = yaml.safe_dump(clean_meta, allow_unicode=True, sort_keys=False).strip()
    return f"---\n{yaml_header}\n---\n\n{body.lstrip()}"


def calculate_node_path(node_id: str, nodes_by_id: dict[str, dict]) -> str:
    """Recursively calculate the full hierarchical path for a note, mimicking PageNode.CalculatePath()."""
    node = nodes_by_id.get(node_id)
    if not node:
        return ""
    slug = node.get("slug") or slugify(node.get("title", ""))
    parent_id = node.get("parent_id")
    if not parent_id or parent_id not in nodes_by_id:
        return slug
    parent_path = calculate_node_path(parent_id, nodes_by_id)
    return f"{parent_path}/{slug}" if parent_path else slug


def build_tree_hierarchy(
    notes: list[dict],
    user_favorites: set[str] | None = None,
) -> list[dict]:
    """Build nested tree hierarchy from flat list of note dicts.
    
    Each item in `notes` is expected to have:
    - id: str
    - title: str
    - slug: str (optional)
    - parent_id: str | None
    - kind: "page" | "section"
    - position: int
    - pinned: bool
    - phase: str
    - tags: list[str]
    - target_count: int
    - finding_count: int
    - attachment_count: int
    - updated_at: datetime | str
    - created_at: datetime | str
    """
    favs = user_favorites or set()
    nodes_by_id: dict[str, dict] = {}

    # Initialize lookup map with empty children list
    for note in notes:
        n_id = note["id"]
        slug = note.get("slug") or slugify(note.get("title", ""))
        nodes_by_id[n_id] = {
            "id": n_id,
            "title": note.get("title", "Sem título"),
            "slug": slug,
            "parent_id": note.get("parent_id"),
            "kind": note.get("kind", "page"),
            "position": int(note.get("position", 0)),
            "pinned": bool(note.get("pinned", False)),
            "favorite": n_id in favs,
            "phase": note.get("phase", "pre-engagement"),
            "tags": note.get("tags", []),
            "target_count": int(note.get("target_count", 0)),
            "finding_count": int(note.get("finding_count", 0)),
            "attachment_count": int(note.get("attachment_count", 0)),
            "updated_at": note.get("updated_at"),
            "created_at": note.get("created_at"),
            "children": [],
        }

    # Calculate paths
    for n_id, node in nodes_by_id.items():
        node["path"] = calculate_node_path(n_id, nodes_by_id)

    root_nodes: list[dict] = []

    # Assemble hierarchy
    for n_id, node in nodes_by_id.items():
        p_id = node.get("parent_id")
        if p_id and p_id in nodes_by_id and p_id != n_id:
            nodes_by_id[p_id]["children"].append(node)
        else:
            root_nodes.append(node)

    # Sort helper: pinned first, then position asc, then title case-insensitive
    def sort_key(item: dict):
        return (
            not item["pinned"],
            item["position"],
            item["title"].casefold(),
        )

    def sort_subtree(node_list: list[dict]):
        node_list.sort(key=sort_key)
        for child in node_list:
            sort_subtree(child["children"])

    sort_subtree(root_nodes)
    return root_nodes


def validate_node_move(
    all_notes_by_id: dict[str, dict],
    note_id: str,
    new_parent_id: str | None,
) -> None:
    """Validate that moving note_id to new_parent_id does not cause a cycle or invalid target."""
    if not new_parent_id:
        return
    if new_parent_id == note_id:
        raise ValueError("cannot_move_node_into_itself")
    if new_parent_id not in all_notes_by_id:
        raise ValueError("target_parent_not_found")

    # Traverse upward from new_parent_id; if we hit note_id, it is a descendant
    current_id: str | None = new_parent_id
    visited = set()
    while current_id:
        if current_id == note_id:
            raise ValueError("cannot_move_node_into_descendant")
        if current_id in visited:
            break
        visited.add(current_id)
        current_node = all_notes_by_id.get(current_id)
        if not current_node:
            break
        current_id = current_node.get("parent_id")


def calculate_reordered_positions(
    siblings: list[dict],
    moving_node_id: str,
    target_position: int | None,
) -> dict[str, int]:
    """Calculate new 0-indexed positions for sibling nodes after insertion."""
    filtered = [s["id"] for s in siblings if s["id"] != moving_node_id]
    if target_position is None or target_position >= len(filtered):
        filtered.append(moving_node_id)
    elif target_position <= 0:
        filtered.insert(0, moving_node_id)
    else:
        filtered.insert(target_position, moving_node_id)

    return {nid: idx for idx, nid in enumerate(filtered)}


def refactor_markdown_links(
    content: str,
    old_title: str,
    new_title: str,
    old_slug: str = "",
    new_slug: str = "",
) -> tuple[str, int]:
    """Refactor wikilinks referencing old_title or old_slug to new_title or new_slug.
    
    Preserves fenced code blocks and inline code blocks (translates MarkdownRefactorEngine).
    """
    if not content:
        return content, 0

    replacements = 0

    # Split content by code blocks to avoid refactoring inside snippets
    tokens = _CODE_BLOCK_RE.split(content)
    rewritten_tokens = []

    old_title_clean = old_title.strip()
    new_title_clean = new_title.strip()

    title_pattern = None
    if old_title_clean and old_title_clean != new_title_clean:
        title_pattern = re.compile(
            r"\[\[\s*" + re.escape(old_title_clean) + r"\s*(\|[^\]\n]*)?\]\]",
            re.IGNORECASE,
        )

    slug_pattern = None
    if old_slug and new_slug and old_slug != new_slug:
        slug_pattern = re.compile(
            r"\[\[\s*" + re.escape(old_slug) + r"\s*(\|[^\]\n]*)?\]\]",
            re.IGNORECASE,
        )

    for token in tokens:
        # Check if token is a code block
        if token.startswith("`"):
            rewritten_tokens.append(token)
            continue

        transformed = token
        if title_pattern:
            def _replace_title(match: re.Match) -> str:
                nonlocal replacements
                replacements += 1
                alias_part = match.group(1) or ""
                return f"[[{new_title_clean}{alias_part}]]"

            transformed = title_pattern.sub(_replace_title, transformed)

        if slug_pattern:
            def _replace_slug(match: re.Match) -> str:
                nonlocal replacements
                replacements += 1
                alias_part = match.group(1) or ""
                return f"[[{new_slug}{alias_part}]]"

            transformed = slug_pattern.sub(_replace_slug, transformed)

        rewritten_tokens.append(transformed)

    return "".join(rewritten_tokens), replacements


def detect_broken_links(
    notes: list[dict],
    known_finding_ids: set[str] | None = None,
) -> list[dict]:
    """Scan notes for broken wikilinks or internal references.
    
    Translates LeafWiki's internal/links/outgoing.go broken link detection.
    """
    findings = known_finding_ids or set()
    known_note_ids = {n["id"] for n in notes}
    known_titles_folded = {n.get("title", "").strip().casefold(): n["id"] for n in notes}
    known_slugs = {n.get("slug", "").strip().casefold(): n["id"] for n in notes}

    broken_links: list[dict] = []

    for note in notes:
        markdown = note.get("markdown", "")
        if not markdown:
            continue

        lines = markdown.splitlines()
        for line_no, line in enumerate(lines, start=1):
            # Exclude code lines
            if line.strip().startswith("```") or line.strip().startswith("`"):
                continue

            for match in _WIKILINK_RE.finditer(line):
                raw_target = match.group(1).strip()
                # Split alias: Target|Alias
                target_base, _, _ = raw_target.partition("|")
                target_base = target_base.strip()

                if not target_base:
                    continue

                is_broken = False
                # Check entity reference format
                if target_base.startswith("evidence:"):
                    evidence_id = target_base[len("evidence:"):]
                    if evidence_id not in known_note_ids:
                        is_broken = True
                elif target_base.startswith("finding:"):
                    f_id = target_base[len("finding:"):]
                    if f_id not in findings:
                        is_broken = True
                elif target_base.startswith(("source:", "target:")):
                    # External scope targets are resolved at runtime
                    is_broken = False
                else:
                    # Wikilink to title or slug
                    folded = target_base.casefold()
                    if (
                        folded not in known_titles_folded
                        and folded not in known_slugs
                        and target_base not in known_note_ids
                    ):
                        is_broken = True

                if is_broken:
                    snippet = line.strip()
                    if len(snippet) > 120:
                        snippet = snippet[:117] + "…"
                    broken_links.append({
                        "from_note_id": note["id"],
                        "from_title": note.get("title", "Sem título"),
                        "target": target_base,
                        "raw_target": raw_target,
                        "snippet": snippet,
                        "line": line_no,
                    })

    return broken_links


def aggregate_tags(notes: list[dict]) -> list[dict]:
    """Aggregate tags across notes, matching LeafWiki's internal/tags/tags_service.go."""
    tag_map: dict[str, list[dict]] = {}

    for note in notes:
        tags = note.get("tags", [])
        for tag in tags:
            tag_clean = tag.strip()
            if not tag_clean:
                continue
            folded = tag_clean.casefold()
            if folded not in tag_map:
                tag_map[folded] = []
            tag_map[folded].append({
                "id": note["id"],
                "title": note.get("title", "Sem título"),
                "phase": note.get("phase", "pre-engagement"),
            })

    result = []
    for tag_key, note_list in tag_map.items():
        result.append({
            "tag": tag_key,
            "count": len(note_list),
            "notes": note_list,
        })

    result.sort(key=lambda item: (-item["count"], item["tag"]))
    return result


def export_bundle_as_zip(
    project_slug: str,
    notes_with_revisions: list[dict],
) -> bytes:
    """Export all project evidence notes as a structured zip archive of Markdown files.
    
    Preserves folders/sections and adds YAML frontmatter to each note file.
    """
    buffer = io.BytesIO()

    # Map paths for notes
    notes_by_id = {n["id"]: n for n in notes_with_revisions}
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for note in notes_with_revisions:
            title = note.get("title", "Sem título")
            body = note.get("markdown", "")
            meta = {
                "id": note["id"],
                "title": title,
                "slug": note.get("slug") or slugify(title),
                "phase": note.get("phase", "pre-engagement"),
                "kind": note.get("kind", "page"),
                "pinned": note.get("pinned", False),
                "tags": note.get("tags", []),
                "targets": note.get("targets", []),
                "finding_ids": note.get("finding_ids", []),
                "created_at": str(note.get("created_at", "")),
                "updated_at": str(note.get("updated_at", "")),
            }

            path = calculate_node_path(note["id"], notes_by_id)
            if not path:
                path = slugify(title)

            # If section, make it an index / README inside that folder
            if note.get("kind") == "section":
                archive_filename = f"{project_slug}/{path}/_section.md"
            else:
                archive_filename = f"{project_slug}/{path}.md"

            content = dump_markdown_frontmatter(meta, body)
            zf.writestr(archive_filename, content.encode("utf-8"))

    buffer.seek(0)
    return buffer.getvalue()
