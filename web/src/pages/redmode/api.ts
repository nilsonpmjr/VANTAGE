import API_URL from "../../config";

export interface ProjectSummary {
  slug: string;
  display_name: string;
  phase: string;
  status: string;
  responsible: string;
  last_activity_at: string;
}

export interface ProjectDetail extends ProjectSummary {
  members: string[];
  created_at: string;
}

export interface OffensiveHomeSummary {
  generated_at: string;
  resume: (ProjectSummary & {
    active_scope: { id: string; author: string; created_at: string } | null;
  }) | null;
  metrics: {
    active_engagements: number;
    scopes_needing_attention: number;
    high_critical_findings: number;
    activity_7d: number;
  };
  charts: {
    ptes_pipeline: Array<{ phase: string; count: number }>;
    finding_severity: Array<{ severity: string; count: number }>;
    scope_readiness: {
      with_active_scope: number;
      without_active_scope: number;
    };
    activity_30d: Array<{
      date: string;
      evidence: number;
      findings: number;
      scope_publications: number;
      total: number;
    }>;
  };
  attention: Array<ProjectSummary & {
    reasons: Array<{
      kind: "critical_findings" | "missing_scope" | "high_findings";
      count: number;
    }>;
  }>;
  recent_sources: Array<{
    project_slug: string;
    project_display_name: string;
    version_id: string;
    file_id: string;
    filename: string;
    content_type: string;
    size: number;
    author: string;
    published_at: string;
  }>;
}

export interface ProjectActivity {
  type: string;
  author: string;
  subject: string;
  at: string;
}

export interface ScopeRule {
  kind: "ip" | "cidr" | "domain" | "url";
  value: string;
  original_value?: string;
  original_values?: string[];
  category: "client" | "third_party" | "excluded";
  classification?: "declared" | "derived" | "enriched";
  executable?: boolean;
  origin_lines: number[];
  origins: Array<{ source_id: string; line: number; position?: string }>;
  normalized?: ScopeNormalization | null;
}

export interface ScopeNormalization {
  classification: "declared" | "derived" | "enriched";
  kind: "ip" | "cidr" | "domain" | "url" | "asn";
  original: string;
  canonical: string;
  attributes: Record<string, string | number | null>;
  relations: Array<{
    classification: "derived";
    type: string;
    kind: string;
    canonical: string;
    category: ScopeRule["category"];
  }>;
  enrichments: unknown[];
}

export interface ScopeAsset {
  asset_id: string;
  project_slug: string;
  version_id: string;
  kind: "ip" | "cidr" | "domain" | "url" | "asn";
  value: string;
  original_value: string;
  original_values: string[];
  category: ScopeRule["category"];
  classification: "declared" | "derived" | "enriched";
  executable: boolean;
  origins: Array<{ source_id: string; line: number; position?: string }>;
  source_ids: string[];
  normalized: ScopeNormalization | null;
}

export interface ScopeSource {
  source_id: string;
  project_slug: string;
  version_id: string;
  type: "text" | "file";
  name: string;
  mime_type: string;
  size: number;
  sha256: string;
  author: string;
  created_at: string;
  extraction: {
    status: "complete" | "legacy";
    warnings: string[];
    rule_count: number;
    context_count: number;
  };
  original: { available: boolean; file_id: string | null };
  representation: {
    available: boolean;
    materialized: boolean;
    content?: string | null;
    offset?: number;
    limit?: number;
    total_characters?: number | null;
    truncated?: boolean;
  };
}

export interface ScopeSourceDetail extends ScopeSource {
  representation: ScopeSource["representation"] & {
    content: string | null;
    offset: number;
    limit: number;
    total_characters: number | null;
    truncated: boolean;
  };
  rules: PaginatedResponse<ScopeAsset>;
  assets: PaginatedResponse<ScopeAsset>;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface ScopeFile {
  id: string;
  source_id: string;
  filename: string;
  size: number;
  sha256: string;
}

export interface ScopeVersion {
  id: string;
  project_slug: string;
  author: string;
  created_at: string;
  source: { kind: "text" | "bundle"; text: string; sha256: string; files: ScopeFile[] };
  rules: ScopeRule[];
  context_assets?: ScopeAsset[];
  normalization?: {
    schema_version: number;
    mode: "offline";
    psl_version: string;
    classifications: Array<"declared" | "derived" | "enriched">;
  } | null;
}

export interface ScopeVersionSummary {
  id: string;
  author: string;
  created_at: string;
  rule_count: number;
  source_hash: string;
}

export interface ScopeLimits {
  max_text_characters: number;
  max_files: number;
  max_file_bytes: number;
  extensions: string[];
}

export interface Evidence {
  id: string;
  project_slug: string;
  text: string;
  phase: string;
  target: string | null;
  finding_id: string | null;
  file: { id: string; filename: string; size: number; sha256: string } | null;
  author: string;
  created_at: string;
  origin: "human";
}

export interface EvidenceLimits {
  max_text_characters: number;
  max_file_bytes: number;
}

export interface FindingInput {
  title: string;
  description: string;
  severity: "informational" | "low" | "medium" | "high" | "critical";
  phase: string;
  targets: string[];
  evidence_ids: string[];
}

export interface Finding extends FindingInput {
  id: string;
  project_slug: string;
  origin: "human";
  created_at: string;
  updated_at: string;
  revision: { id: string; number: number; previous_revision_id: string | null; author: string; created_at: string };
}

export interface FindingRevision extends FindingInput {
  id: string;
  finding_id: string;
  project_slug: string;
  number: number;
  previous_revision_id: string | null;
  author: string;
  created_at: string;
}

async function readResponse<T>(response: Response): Promise<T> {
  if (response.ok) return (await response.json()) as T;
  const payload = (await response.json().catch(() => ({}))) as { detail?: string };
  throw new Error(payload.detail || `HTTP ${response.status}`);
}

export async function listProjects(offset = 0, limit = 20): Promise<{ items: ProjectSummary[]; total: number }> {
  return readResponse(await fetch(`${API_URL}/api/redmode/projects?limit=${limit}&offset=${offset}`, { credentials: "include" }));
}

export async function getOffensiveHome(): Promise<OffensiveHomeSummary> {
  return readResponse(await fetch(`${API_URL}/api/redmode/home`, { credentials: "include" }));
}

export async function createProject(slug: string, displayName: string): Promise<ProjectDetail> {
  return readResponse(await fetch(`${API_URL}/api/redmode/projects`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slug, display_name: displayName }),
  }));
}

export async function getProject(slug: string): Promise<ProjectDetail> {
  return readResponse(await fetch(`${API_URL}/api/redmode/projects/${encodeURIComponent(slug)}`, {
    credentials: "include",
  }));
}

export async function rememberEngagement(slug: string): Promise<void> {
  await readResponse(await fetch(`${API_URL}/api/redmode/projects/${encodeURIComponent(slug)}/resume`, {
    method: "PUT",
    credentials: "include",
  }));
}

export async function changeProjectPhase(slug: string, phase: string): Promise<ProjectDetail> {
  return readResponse(await fetch(`${API_URL}/api/redmode/projects/${encodeURIComponent(slug)}/phase`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phase }),
  }));
}

export async function changeProjectMember(slug: string, username: string, add: boolean): Promise<ProjectDetail> {
  return readResponse(await fetch(`${API_URL}/api/redmode/projects/${encodeURIComponent(slug)}/members/${encodeURIComponent(username)}`, {
    method: add ? "PUT" : "DELETE",
    credentials: "include",
  }));
}

export async function listProjectActivity(slug: string): Promise<{ items: ProjectActivity[] }> {
  return readResponse(await fetch(`${API_URL}/api/redmode/projects/${encodeURIComponent(slug)}/activity`, {
    credentials: "include",
  }));
}

export async function publishTextScope(slug: string, text: string): Promise<ScopeVersion> {
  return readResponse(await fetch(`${API_URL}/api/redmode/projects/${encodeURIComponent(slug)}/scope/text`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  }));
}

export async function submitScope(slug: string, text: string, files: File[]): Promise<ScopeVersion> {
  const body = new FormData();
  body.set("text", text);
  for (const file of files) body.append("files", file);
  return readResponse(await fetch(`${API_URL}/api/redmode/projects/${encodeURIComponent(slug)}/scope/submit`, {
    method: "POST",
    credentials: "include",
    body,
  }));
}

export async function getScopeLimits(): Promise<ScopeLimits> {
  return readResponse(await fetch(`${API_URL}/api/redmode/scope/limits`, { credentials: "include" }));
}

export function scopeFileDownloadUrl(slug: string, versionId: string, fileId: string): string {
  return `${API_URL}/api/redmode/projects/${encodeURIComponent(slug)}/scope/versions/${encodeURIComponent(versionId)}/files/${encodeURIComponent(fileId)}`;
}

export async function listScopeSources(
  slug: string,
  versionId: string,
  offset = 0,
  limit = 50,
): Promise<PaginatedResponse<ScopeSource>> {
  const path = `${API_URL}/api/redmode/projects/${encodeURIComponent(slug)}`
    + `/scope/versions/${encodeURIComponent(versionId)}/sources?offset=${offset}&limit=${limit}`;
  return readResponse(await fetch(path, { credentials: "include" }));
}

export async function getScopeSource(
  slug: string,
  versionId: string,
  sourceId: string,
  options: { contentOffset?: number; contentLimit?: number; assetOffset?: number; assetLimit?: number } = {},
): Promise<ScopeSourceDetail> {
  const query = new URLSearchParams({
    content_offset: String(options.contentOffset || 0),
    content_limit: String(options.contentLimit || 20000),
    rule_offset: String(options.assetOffset || 0),
    rule_limit: String(options.assetLimit || 50),
  });
  const path = `${API_URL}/api/redmode/projects/${encodeURIComponent(slug)}`
    + `/scope/versions/${encodeURIComponent(versionId)}/sources/${encodeURIComponent(sourceId)}`;
  return readResponse(await fetch(`${path}?${query}`, { credentials: "include" }));
}

export interface ScopeAssetQuery {
  q?: string;
  kind?: ScopeAsset["kind"];
  category?: ScopeRule["category"];
  source_id?: string;
  sort_by?: "canonical" | "kind" | "category";
  direction?: "asc" | "desc";
  offset?: number;
  limit?: number;
}

export interface ScopeAssetPage extends PaginatedResponse<ScopeAsset> {
  totals: {
    by_kind: Record<ScopeAsset["kind"], number>;
    by_category: Record<ScopeRule["category"], number>;
  };
}

export async function listScopeAssets(
  slug: string,
  versionId: string,
  options: ScopeAssetQuery = {},
): Promise<ScopeAssetPage> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(options)) {
    if (value !== undefined && value !== "") query.set(key, String(value));
  }
  const path = `${API_URL}/api/redmode/projects/${encodeURIComponent(slug)}`
    + `/scope/versions/${encodeURIComponent(versionId)}/assets`;
  return readResponse(await fetch(`${path}?${query}`, { credentials: "include" }));
}

export async function getActiveScope(slug: string): Promise<ScopeVersion> {
  return readResponse(await fetch(`${API_URL}/api/redmode/projects/${encodeURIComponent(slug)}/scope/active`, {
    credentials: "include",
  }));
}

export async function listScopeVersions(slug: string): Promise<{ items: ScopeVersionSummary[] }> {
  return readResponse(await fetch(`${API_URL}/api/redmode/projects/${encodeURIComponent(slug)}/scope/versions`, {
    credentials: "include",
  }));
}

export async function getScopeVersion(slug: string, versionId: string): Promise<ScopeVersion> {
  return readResponse(await fetch(`${API_URL}/api/redmode/projects/${encodeURIComponent(slug)}/scope/versions/${encodeURIComponent(versionId)}`, {
    credentials: "include",
  }));
}

export async function getEvidenceLimits(): Promise<EvidenceLimits> {
  return readResponse(await fetch(`${API_URL}/api/redmode/evidence/limits`, { credentials: "include" }));
}

export async function listEvidence(slug: string, offset = 0, limit = 50): Promise<{ items: Evidence[]; total: number }> {
  return readResponse(await fetch(`${API_URL}/api/redmode/projects/${encodeURIComponent(slug)}/evidence?offset=${offset}&limit=${limit}`, { credentials: "include" }));
}

export async function addEvidence(slug: string, fields: { text: string; phase: string; target: string; finding_id: string; file: File | null }): Promise<Evidence> {
  const body = new FormData();
  body.set("text", fields.text);
  body.set("phase", fields.phase);
  body.set("target", fields.target);
  body.set("finding_id", fields.finding_id);
  if (fields.file) body.set("file", fields.file);
  return readResponse(await fetch(`${API_URL}/api/redmode/projects/${encodeURIComponent(slug)}/evidence`, {
    method: "POST", credentials: "include", body,
  }));
}

export function evidenceFileDownloadUrl(slug: string, evidenceId: string): string {
  return `${API_URL}/api/redmode/projects/${encodeURIComponent(slug)}/evidence/${encodeURIComponent(evidenceId)}/file`;
}

export async function listFindings(slug: string, offset = 0, limit = 50): Promise<{ items: Finding[]; total: number }> {
  return readResponse(await fetch(`${API_URL}/api/redmode/projects/${encodeURIComponent(slug)}/findings?offset=${offset}&limit=${limit}`, { credentials: "include" }));
}

export async function createFinding(slug: string, payload: FindingInput): Promise<Finding> {
  return readResponse(await fetch(`${API_URL}/api/redmode/projects/${encodeURIComponent(slug)}/findings`, {
    method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  }));
}

export async function updateFinding(slug: string, findingId: string, expectedRevisionId: string, payload: FindingInput): Promise<Finding> {
  return readResponse(await fetch(`${API_URL}/api/redmode/projects/${encodeURIComponent(slug)}/findings/${encodeURIComponent(findingId)}`, {
    method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, expected_revision_id: expectedRevisionId }),
  }));
}

export async function listFindingRevisions(slug: string, findingId: string): Promise<{ items: FindingRevision[] }> {
  return readResponse(await fetch(`${API_URL}/api/redmode/projects/${encodeURIComponent(slug)}/findings/${encodeURIComponent(findingId)}/revisions`, { credentials: "include" }));
}
