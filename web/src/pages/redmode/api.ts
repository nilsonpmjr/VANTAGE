import API_URL from "../../config";

export type ProjectStatus = "active" | "completed" | "archived";

export interface ProjectSummary {
  slug: string;
  display_name: string;
  phase: string;
  status: ProjectStatus;
  responsible: string;
  last_activity_at: string;
  completed_at?: string;
  archived_at?: string;
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
  previous_status?: ProjectStatus;
  new_status?: ProjectStatus;
}

export type ClientIdentityKind = "domain" | "asn";

export interface ClientIdentityConfirmation {
  kind: ClientIdentityKind;
  value: string;
  confirmed_by: string;
  confirmed_at: string;
}

export interface ClientIdentitySuggestionOrigin {
  asset_id: string;
  source_ids: string[];
  classification: "declared" | "derived" | "enriched";
  categories: Array<"client" | "third_party" | "excluded">;
  method: "registrable_domain" | "declared" | "derived_relation" | "enrichment";
  provider?: string | null;
  observed_at?: string | null;
}

export interface ClientIdentitySuggestion {
  kind: ClientIdentityKind;
  value: string;
  confirmed: boolean;
  origins: ClientIdentitySuggestionOrigin[];
}

export interface ProjectIdentity {
  revision: number;
  active_scope_version: string | null;
  confirmed: ClientIdentityConfirmation[];
  suggestions: ClientIdentitySuggestion[];
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
  enrichment: ScopeEnrichment;
}

export type ScopeEnrichmentState =
  | "not_configured"
  | "not_queried"
  | "available"
  | "not_found"
  | "expired"
  | "failed";

export interface ScopeEnrichment {
  state: ScopeEnrichmentState;
  provider?: string | null;
  provider_mode?: "local" | "external" | null;
  queried_at?: string | null;
  expires_at?: string | null;
  asn?: string | null;
  organization?: string | null;
  prefix?: string | null;
  source?: string | null;
  error_code?: string | null;
}

export type EnrichmentPolicyMode = "disabled" | "local_only" | "external_allowed";

export interface EnrichmentPolicy {
  mode: EnrichmentPolicyMode;
  revision: number;
  updated_by: string | null;
  updated_at: string | null;
  installation: { external_enabled: boolean };
  providers: Array<{
    key: string;
    mode: "local" | "external";
    supported_kinds: ScopeAsset["kind"][];
    compatible: boolean;
  }>;
  configured: boolean;
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

export interface EvidenceAttachment {
  id: string;
  filename: string;
  size: number;
  sha256: string;
  content_type: string;
  created_by?: string | null;
  created_at?: string | null;
}

export type EvidenceReferenceKind = "evidence" | "finding" | "source" | "target";

export interface EvidenceStoredReference {
  kind: EvidenceReferenceKind;
  id: string;
  key: string;
}

export interface EvidenceReference extends EvidenceStoredReference {
  label: string;
  href: string | null;
  broken: boolean;
  context: string;
}

export interface EvidenceBacklink {
  type: "evidence" | "finding";
  id: string;
  label: string;
  href: string;
  context: string;
  author: string;
  updated_at: string;
}

export interface EvidenceLinks {
  outgoing: EvidenceReference[];
  backlinks: EvidenceBacklink[];
}

export type NotebookSearchType =
  | "all"
  | "evidence"
  | "draft"
  | "finding"
  | "source"
  | "target";

export interface NotebookSearchResult {
  type: Exclude<NotebookSearchType, "all">;
  id: string;
  reference: string | null;
  key: string;
  label: string;
  excerpt: string;
  phase: string | null;
  updated_at: string;
  href: string | null;
  private: boolean;
  broken: boolean;
}

export interface EvidenceNoteInput {
  title: string;
  markdown: string;
  phase: string;
  tags: string[];
  targets: string[];
  finding_ids: string[];
  attachment_ids: string[];
}

export interface EvidenceRevision extends EvidenceNoteInput {
  id: string;
  note_id: string;
  project_slug: string;
  number: number;
  previous_revision_id: string | null;
  author: string;
  created_at: string;
  attachments: EvidenceAttachment[];
  references: EvidenceStoredReference[];
}

export interface EvidenceNote extends EvidenceNoteInput {
  id: string;
  project_slug: string;
  origin: "human";
  created_by: string;
  created_at: string;
  updated_at: string;
  attachments: EvidenceAttachment[];
  references: EvidenceStoredReference[];
  revision: Pick<
    EvidenceRevision,
    "id" | "number" | "previous_revision_id" | "author" | "created_at"
  >;
}

export interface EvidenceNoteSummary {
  id: string;
  project_slug: string;
  origin: "human";
  created_by: string;
  created_at: string;
  updated_at: string;
  title: string;
  excerpt: string;
  phase: string;
  tags: string[];
  target_count: number;
  finding_count: number;
  attachment_count: number;
  revision: EvidenceNote["revision"];
}

export interface EvidenceDraft extends EvidenceNoteInput {
  id: string;
  note_id: string;
  project_slug: string;
  author: string;
  version: number;
  base_revision_id: string | null;
  created_at: string;
  updated_at: string;
  attachments: EvidenceAttachment[];
  references: EvidenceStoredReference[];
}

export interface EvidenceDraftSummary {
  note_id: string;
  project_slug: string;
  version: number;
  base_revision_id: string | null;
  updated_at: string;
  title: string;
  excerpt: string;
  phase: string;
  tags: string[];
  attachment_count: number;
  is_new: boolean;
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
  references: EvidenceStoredReference[];
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
  references: EvidenceStoredReference[];
}

export interface FindingDraft extends FindingInput {
  id: string;
  finding_id: string;
  project_slug: string;
  author: string;
  version: number;
  base_revision_id: string | null;
  created_at: string;
  updated_at: string;
  references: EvidenceStoredReference[];
}

export interface FindingDraftSummary {
  finding_id: string;
  project_slug: string;
  version: number;
  base_revision_id: string | null;
  updated_at: string;
  title: string;
  severity: FindingInput["severity"];
  phase: string;
  is_new: boolean;
}

export interface FindingRevisionComparison {
  base_revision_id: string;
  revision_id: string;
  document_diff: string;
  property_changes: Record<string, { before: unknown; after: unknown }>;
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

export async function changeProjectStatus(
  slug: string,
  status: ProjectStatus,
  expectedStatus: ProjectStatus,
): Promise<ProjectDetail> {
  return readResponse(await fetch(`${API_URL}/api/redmode/projects/${encodeURIComponent(slug)}/status`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, expected_status: expectedStatus }),
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

export async function getProjectIdentity(slug: string): Promise<ProjectIdentity> {
  return readResponse(await fetch(`${API_URL}/api/redmode/projects/${encodeURIComponent(slug)}/identity`, {
    credentials: "include",
  }));
}

export async function confirmProjectIdentity(
  slug: string,
  kind: ClientIdentityKind,
  value: string,
  expectedRevision: number,
): Promise<ProjectIdentity> {
  return readResponse(await fetch(`${API_URL}/api/redmode/projects/${encodeURIComponent(slug)}/identity/confirmations`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind, value, expected_revision: expectedRevision }),
  }));
}

export async function removeProjectIdentity(
  slug: string,
  kind: ClientIdentityKind,
  value: string,
  expectedRevision: number,
): Promise<ProjectIdentity> {
  const query = new URLSearchParams({
    kind,
    value,
    expected_revision: String(expectedRevision),
  });
  return readResponse(await fetch(
    `${API_URL}/api/redmode/projects/${encodeURIComponent(slug)}/identity/confirmations?${query}`,
    { method: "DELETE", credentials: "include" },
  ));
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

export async function getEnrichmentPolicy(slug: string): Promise<EnrichmentPolicy> {
  return readResponse(await fetch(
    `${API_URL}/api/redmode/projects/${encodeURIComponent(slug)}/enrichment/policy`,
    { credentials: "include" },
  ));
}

export async function updateEnrichmentPolicy(
  slug: string,
  mode: EnrichmentPolicyMode,
  expectedRevision: number,
): Promise<EnrichmentPolicy> {
  return readResponse(await fetch(
    `${API_URL}/api/redmode/projects/${encodeURIComponent(slug)}/enrichment/policy`,
    {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode, expected_revision: expectedRevision }),
    },
  ));
}

export async function enrichScopeAsset(
  slug: string,
  versionId: string,
  assetId: string,
): Promise<ScopeAsset> {
  const path = `${API_URL}/api/redmode/projects/${encodeURIComponent(slug)}`
    + `/scope/versions/${encodeURIComponent(versionId)}`
    + `/assets/${encodeURIComponent(assetId)}/enrichment`;
  return readResponse(await fetch(path, { method: "POST", credentials: "include" }));
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

export async function listEvidenceNotes(
  slug: string,
  offset = 0,
  limit = 50,
): Promise<{ items: EvidenceNoteSummary[]; total: number }> {
  const path = `${API_URL}/api/redmode/projects/${encodeURIComponent(slug)}`
    + `/evidence/notes?offset=${offset}&limit=${limit}`;
  return readResponse(await fetch(path, { credentials: "include" }));
}

export async function getEvidenceNote(slug: string, noteId: string): Promise<EvidenceNote> {
  const path = `${API_URL}/api/redmode/projects/${encodeURIComponent(slug)}`
    + `/evidence/notes/${encodeURIComponent(noteId)}`;
  return readResponse(await fetch(path, { credentials: "include" }));
}

export async function resolveEvidenceReferences(
  slug: string,
  markdown: string,
): Promise<{ items: EvidenceReference[] }> {
  const path = `${API_URL}/api/redmode/projects/${encodeURIComponent(slug)}/references/resolve`;
  return readResponse(await fetch(path, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ markdown }),
  }));
}

export async function suggestEvidenceReferences(
  slug: string,
  query: string,
  limit = 12,
): Promise<{ items: NotebookSearchResult[] }> {
  const params = new URLSearchParams({ q: query, limit: String(limit) });
  const path = `${API_URL}/api/redmode/projects/${encodeURIComponent(slug)}`
    + `/references/suggest?${params}`;
  return readResponse(await fetch(path, { credentials: "include" }));
}

export async function getEvidenceLinks(
  slug: string,
  noteId: string,
  revisionId?: string,
): Promise<EvidenceLinks> {
  const query = revisionId
    ? `?${new URLSearchParams({ revision_id: revisionId })}`
    : "";
  const path = `${API_URL}/api/redmode/projects/${encodeURIComponent(slug)}`
    + `/evidence/notes/${encodeURIComponent(noteId)}/links${query}`;
  return readResponse(await fetch(path, { credentials: "include" }));
}

export async function searchEvidenceNotebook(
  slug: string,
  options: {
    q?: string;
    type?: NotebookSearchType;
    phase?: string;
    tag?: string;
    dateFrom?: string;
    dateTo?: string;
    offset?: number;
    limit?: number;
  } = {},
): Promise<{ items: NotebookSearchResult[]; total: number }> {
  const params = new URLSearchParams();
  if (options.q) params.set("q", options.q);
  if (options.type && options.type !== "all") params.set("type", options.type);
  if (options.phase) params.set("phase", options.phase);
  if (options.tag) params.set("tag", options.tag);
  if (options.dateFrom) params.set("date_from", options.dateFrom);
  if (options.dateTo) params.set("date_to", options.dateTo);
  params.set("offset", String(options.offset || 0));
  params.set("limit", String(options.limit || 50));
  const path = `${API_URL}/api/redmode/projects/${encodeURIComponent(slug)}`
    + `/notebook/search?${params}`;
  return readResponse(await fetch(path, { credentials: "include" }));
}

export async function createEvidenceDraft(slug: string): Promise<EvidenceDraft> {
  const path = `${API_URL}/api/redmode/projects/${encodeURIComponent(slug)}/evidence/drafts`;
  return readResponse(await fetch(path, { method: "POST", credentials: "include" }));
}

export async function listEvidenceDrafts(slug: string): Promise<{ items: EvidenceDraftSummary[] }> {
  const path = `${API_URL}/api/redmode/projects/${encodeURIComponent(slug)}/evidence/drafts`;
  return readResponse(await fetch(path, { credentials: "include" }));
}

export async function getEvidenceDraft(slug: string, noteId: string): Promise<EvidenceDraft> {
  const path = `${API_URL}/api/redmode/projects/${encodeURIComponent(slug)}`
    + `/evidence/drafts/${encodeURIComponent(noteId)}`;
  return readResponse(await fetch(path, { credentials: "include" }));
}

export async function saveEvidenceDraft(
  slug: string,
  noteId: string,
  baseRevisionId: string | null,
  expectedVersion: number,
  payload: EvidenceNoteInput,
): Promise<EvidenceDraft> {
  const path = `${API_URL}/api/redmode/projects/${encodeURIComponent(slug)}`
    + `/evidence/drafts/${encodeURIComponent(noteId)}`;
  return readResponse(await fetch(path, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...payload,
      base_revision_id: baseRevisionId,
      expected_version: expectedVersion,
    }),
  }));
}

export async function discardEvidenceDraft(slug: string, noteId: string): Promise<void> {
  const path = `${API_URL}/api/redmode/projects/${encodeURIComponent(slug)}`
    + `/evidence/drafts/${encodeURIComponent(noteId)}`;
  const response = await fetch(path, { method: "DELETE", credentials: "include" });
  if (!response.ok) await readResponse(response);
}

export async function publishEvidenceDraft(
  slug: string,
  noteId: string,
  expectedVersion: number,
): Promise<EvidenceNote> {
  const path = `${API_URL}/api/redmode/projects/${encodeURIComponent(slug)}`
    + `/evidence/drafts/${encodeURIComponent(noteId)}/publish`;
  return readResponse(await fetch(path, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ expected_version: expectedVersion }),
  }));
}

export async function rebaseEvidenceDraft(
  slug: string,
  noteId: string,
  expectedVersion: number,
  currentRevisionId: string,
): Promise<EvidenceDraft> {
  const path = `${API_URL}/api/redmode/projects/${encodeURIComponent(slug)}`
    + `/evidence/drafts/${encodeURIComponent(noteId)}/rebase`;
  return readResponse(await fetch(path, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      expected_version: expectedVersion,
      current_revision_id: currentRevisionId,
    }),
  }));
}

export async function uploadEvidenceDraftAttachments(
  slug: string,
  noteId: string,
  expectedVersion: number,
  files: File[],
): Promise<EvidenceDraft> {
  const body = new FormData();
  body.set("expected_version", String(expectedVersion));
  files.forEach((file) => body.append("files", file));
  const path = `${API_URL}/api/redmode/projects/${encodeURIComponent(slug)}`
    + `/evidence/drafts/${encodeURIComponent(noteId)}/attachments`;
  return readResponse(await fetch(path, {
    method: "POST",
    credentials: "include",
    body,
  }));
}

export async function deleteEvidenceDraftAttachment(
  slug: string,
  noteId: string,
  attachmentId: string,
): Promise<EvidenceDraft> {
  const path = `${API_URL}/api/redmode/projects/${encodeURIComponent(slug)}`
    + `/evidence/drafts/${encodeURIComponent(noteId)}`
    + `/attachments/${encodeURIComponent(attachmentId)}`;
  return readResponse(await fetch(path, { method: "DELETE", credentials: "include" }));
}

export async function createEvidenceNote(
  slug: string,
  payload: EvidenceNoteInput,
): Promise<EvidenceNote> {
  const path = `${API_URL}/api/redmode/projects/${encodeURIComponent(slug)}/evidence/notes`;
  return readResponse(await fetch(path, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }));
}

export async function updateEvidenceNote(
  slug: string,
  noteId: string,
  expectedRevisionId: string,
  payload: EvidenceNoteInput,
): Promise<EvidenceNote> {
  const path = `${API_URL}/api/redmode/projects/${encodeURIComponent(slug)}`
    + `/evidence/notes/${encodeURIComponent(noteId)}`;
  return readResponse(await fetch(path, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, expected_revision_id: expectedRevisionId }),
  }));
}

export async function listEvidenceRevisions(
  slug: string,
  noteId: string,
): Promise<{ items: EvidenceRevision[] }> {
  const path = `${API_URL}/api/redmode/projects/${encodeURIComponent(slug)}`
    + `/evidence/notes/${encodeURIComponent(noteId)}/revisions`;
  return readResponse(await fetch(path, { credentials: "include" }));
}

export async function getEvidenceRevision(
  slug: string,
  noteId: string,
  revisionId: string,
): Promise<EvidenceRevision> {
  const path = `${API_URL}/api/redmode/projects/${encodeURIComponent(slug)}`
    + `/evidence/notes/${encodeURIComponent(noteId)}`
    + `/revisions/${encodeURIComponent(revisionId)}`;
  return readResponse(await fetch(path, { credentials: "include" }));
}

export function evidenceAttachmentDownloadUrl(
  slug: string,
  noteId: string,
  attachmentId: string,
  inline = false,
): string {
  const path = `${API_URL}/api/redmode/projects/${encodeURIComponent(slug)}`
    + `/evidence/notes/${encodeURIComponent(noteId)}`
    + `/attachments/${encodeURIComponent(attachmentId)}`;
  return inline ? `${path}?inline=true` : path;
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

export async function listFindings(
  slug: string,
  offset = 0,
  limit = 50,
  filters: { q?: string; severity?: string; phase?: string } = {},
): Promise<{ items: Finding[]; total: number }> {
  const params = new URLSearchParams({ offset: String(offset), limit: String(limit) });
  if (filters.q) params.set("q", filters.q);
  if (filters.severity) params.set("severity", filters.severity);
  if (filters.phase) params.set("phase", filters.phase);
  return readResponse(await fetch(`${API_URL}/api/redmode/projects/${encodeURIComponent(slug)}/findings?${params}`, { credentials: "include" }));
}

export async function getFinding(slug: string, findingId: string): Promise<Finding> {
  return readResponse(await fetch(`${API_URL}/api/redmode/projects/${encodeURIComponent(slug)}/findings/${encodeURIComponent(findingId)}`, { credentials: "include" }));
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

export async function compareFindingRevisions(
  slug: string,
  findingId: string,
  baseRevisionId: string,
  revisionId: string,
): Promise<FindingRevisionComparison> {
  const query = new URLSearchParams({ base_revision_id: baseRevisionId, revision_id: revisionId });
  const path = `${API_URL}/api/redmode/projects/${encodeURIComponent(slug)}`
    + `/findings/${encodeURIComponent(findingId)}/revisions/compare?${query}`;
  return readResponse(await fetch(path, { credentials: "include" }));
}

export async function getFindingLinks(
  slug: string,
  findingId: string,
  revisionId?: string,
): Promise<EvidenceLinks> {
  const query = revisionId ? `?${new URLSearchParams({ revision_id: revisionId })}` : "";
  const path = `${API_URL}/api/redmode/projects/${encodeURIComponent(slug)}`
    + `/findings/${encodeURIComponent(findingId)}/links${query}`;
  return readResponse(await fetch(path, { credentials: "include" }));
}

export async function getReferenceBacklinks(slug: string, key: string): Promise<{ items: EvidenceBacklink[] }> {
  const query = new URLSearchParams({ key });
  const path = `${API_URL}/api/redmode/projects/${encodeURIComponent(slug)}/references/backlinks?${query}`;
  return readResponse(await fetch(path, { credentials: "include" }));
}

export async function createFindingDraft(slug: string): Promise<FindingDraft> {
  const path = `${API_URL}/api/redmode/projects/${encodeURIComponent(slug)}/finding-drafts`;
  return readResponse(await fetch(path, { method: "POST", credentials: "include" }));
}

export async function listFindingDrafts(slug: string): Promise<{ items: FindingDraftSummary[] }> {
  const path = `${API_URL}/api/redmode/projects/${encodeURIComponent(slug)}/finding-drafts`;
  return readResponse(await fetch(path, { credentials: "include" }));
}

export async function getFindingDraft(slug: string, findingId: string): Promise<FindingDraft> {
  const path = `${API_URL}/api/redmode/projects/${encodeURIComponent(slug)}`
    + `/finding-drafts/${encodeURIComponent(findingId)}`;
  return readResponse(await fetch(path, { credentials: "include" }));
}

export async function saveFindingDraft(
  slug: string,
  findingId: string,
  baseRevisionId: string | null,
  expectedVersion: number,
  payload: FindingInput,
): Promise<FindingDraft> {
  const path = `${API_URL}/api/redmode/projects/${encodeURIComponent(slug)}`
    + `/finding-drafts/${encodeURIComponent(findingId)}`;
  return readResponse(await fetch(path, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, base_revision_id: baseRevisionId, expected_version: expectedVersion }),
  }));
}

export async function discardFindingDraft(slug: string, findingId: string): Promise<void> {
  const path = `${API_URL}/api/redmode/projects/${encodeURIComponent(slug)}`
    + `/finding-drafts/${encodeURIComponent(findingId)}`;
  const response = await fetch(path, { method: "DELETE", credentials: "include" });
  if (!response.ok) await readResponse(response);
}

export async function publishFindingDraft(slug: string, findingId: string, expectedVersion: number): Promise<Finding> {
  const path = `${API_URL}/api/redmode/projects/${encodeURIComponent(slug)}`
    + `/finding-drafts/${encodeURIComponent(findingId)}/publish`;
  return readResponse(await fetch(path, {
    method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ expected_version: expectedVersion }),
  }));
}

export async function rebaseFindingDraft(
  slug: string,
  findingId: string,
  expectedVersion: number,
  currentRevisionId: string,
): Promise<FindingDraft> {
  const path = `${API_URL}/api/redmode/projects/${encodeURIComponent(slug)}`
    + `/finding-drafts/${encodeURIComponent(findingId)}/rebase`;
  return readResponse(await fetch(path, {
    method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ expected_version: expectedVersion, current_revision_id: currentRevisionId }),
  }));
}
