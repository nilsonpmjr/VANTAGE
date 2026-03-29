import { useEffect, useMemo, useState } from "react";
import { Bookmark, Crosshair, Fingerprint, Search, ShieldCheck, StickyNote, History } from "lucide-react";
import API_URL from "../config";
import { useLanguage } from "../context/LanguageContext";

interface HuntingProvider {
  key: string;
  name: string;
  version?: string;
  artifactTypes: string[];
  providerScope: string[];
  executionProfile?: {
    mode?: string;
    performanceClass?: string;
    riskClass?: string;
  };
  runtimeStatus?: {
    ready?: boolean;
    state?: string;
    recommendedMode?: string;
    preferredMode?: string;
    activeMode?: string | null;
    availableModes?: string[];
    wiredModes?: string[];
    blocker?: string | null;
  };
}

interface HuntingRuntimeCatalog {
  configuredMode?: string;
  modes?: Record<
    string,
    {
      label?: string;
      ready?: boolean;
      wired?: boolean;
      detail?: string;
    }
  >;
}

interface HuntingResultDocument {
  _id?: string;
  provider_key?: string;
  title?: string;
  url?: string;
  platform?: string;
  confidence?: number;
  summary?: string;
  attributes?: Record<string, unknown>;
}

interface HuntingSearchItem {
  provider: HuntingProvider;
  status: string;
  error?: string | null;
  query?: {
    artifact_type?: string;
    query?: string;
  };
  results: HuntingResultDocument[];
}

interface SavedHuntingSearch {
  _id: string;
  name: string;
  artifact_type: string;
  query: string;
  provider_keys: string[];
  created_at: string;
  last_used_at?: string | null;
  use_count: number;
}

interface RecentHuntingSearch {
  search_id: string;
  artifact_type: string;
  query: string;
  timestamp: string;
  providers: string[];
  result_count: number;
}

interface HuntingCaseNote {
  _id: string;
  search_id: string;
  note: string;
  created_at: string;
}

function formatTimestamp(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

export default function Hunting() {
  const { t } = useLanguage();
  const [providers, setProviders] = useState<HuntingProvider[]>([]);
  const [runtimeCatalog, setRuntimeCatalog] = useState<HuntingRuntimeCatalog | null>(null);
  const [artifactType, setArtifactType] = useState("username");
  const [query, setQuery] = useState("");
  const [selectedProviderKeys, setSelectedProviderKeys] = useState<string[]>([]);
  const [items, setItems] = useState<HuntingSearchItem[]>([]);
  const [savedSearches, setSavedSearches] = useState<SavedHuntingSearch[]>([]);
  const [recentSearches, setRecentSearches] = useState<RecentHuntingSearch[]>([]);
  const [notes, setNotes] = useState<HuntingCaseNote[]>([]);
  const [searchId, setSearchId] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [loadingProviders, setLoadingProviders] = useState(true);
  const [searching, setSearching] = useState(false);
  const [savingSearch, setSavingSearch] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      try {
        const [providersRes, savedRes, recentRes] = await Promise.all([
          fetch(`${API_URL}/api/hunting/providers`, { credentials: "include" }),
          fetch(`${API_URL}/api/hunting/saved-searches`, { credentials: "include" }),
          fetch(`${API_URL}/api/hunting/recent-searches`, { credentials: "include" }),
        ]);
        if (!providersRes.ok || !savedRes.ok || !recentRes.ok) {
          throw new Error("hunting_bootstrap_failed");
        }
        const providersEnvelope = (await providersRes.json()) as { items: HuntingProvider[]; runtime?: HuntingRuntimeCatalog };
        const savedData = (await savedRes.json()) as { items: SavedHuntingSearch[] };
        const recentData = (await recentRes.json()) as { items: RecentHuntingSearch[] };
        if (cancelled) return;
        const nextProviders = providersEnvelope.items || [];
        setProviders(nextProviders);
        setRuntimeCatalog(providersEnvelope.runtime || null);
        setSavedSearches(savedData.items || []);
        setRecentSearches(recentData.items || []);
        setSelectedProviderKeys(nextProviders.map((provider) => provider.key));
      } catch {
        if (!cancelled) {
          setError("Não foi possível carregar a área de hunting.");
        }
      } finally {
        if (!cancelled) {
          setLoadingProviders(false);
        }
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!searchId) {
      setNotes([]);
      return;
    }
    void loadCaseNotes(searchId);
  }, [searchId]);

  const supportedArtifactTypes = useMemo(() => {
    const set = new Set<string>();
    for (const provider of providers) {
      for (const type of provider.artifactTypes || []) {
        set.add(type);
      }
    }
    return Array.from(set);
  }, [providers]);

  const providerComparison = useMemo(
    () =>
      items.map((item) => {
        const confidences = item.results
          .map((result) => Number(result.confidence || 0))
          .filter((value) => Number.isFinite(value));
        const averageConfidence = confidences.length
          ? Math.round((confidences.reduce((acc, value) => acc + value, 0) / confidences.length) * 100)
          : 0;
        return {
          key: item.provider.key,
          name: item.provider.name,
          status: item.status,
          resultCount: item.results.length,
          averageConfidence,
        };
      }),
    [items],
  );

  const totalResults = useMemo(
    () => items.reduce((acc, item) => acc + item.results.length, 0),
    [items],
  );

  const readyProviderCount = useMemo(
    () => providers.filter((provider) => provider.runtimeStatus?.ready).length,
    [providers],
  );

  const runtimeModes = useMemo(
    () => Object.entries(runtimeCatalog?.modes || {}) as Array<
      [
        string,
        {
          label?: string;
          ready?: boolean;
          wired?: boolean;
          detail?: string;
        },
      ]
    >,
    [runtimeCatalog],
  );

  function formatRuntimeMode(mode?: string | null) {
    if (!mode) return "Unavailable";
    if (mode === "native_local") return "Native local";
    if (mode === "isolated_container") return "Isolated container";
    if (mode === "kali_container") return "Kali container";
    return mode;
  }

  function formatRuntimeBlocker(code?: string | null) {
    switch (code) {
      case "provider_runtime_missing":
        return "The provider is not executable in the current runtime.";
      case "runtime_declared_but_not_wired":
        return "The runtime lane is declared, but the backend has no execution bridge for it yet.";
      case "kali_runtime_required":
        return "This provider requires the optional Kali runtime lane.";
      case "isolated_container_unavailable":
        return "The recommended isolated container lane is not available in this environment.";
      case "recommended_runtime_unavailable":
        return "The recommended runtime lane is unavailable; fallback rules were applied.";
      case "kali_container_unavailable":
        return "The optional Kali runtime lane is unavailable in this environment.";
      default:
        return code || "Runtime unavailable.";
    }
  }

  function formatSourceLabel(provider: HuntingProvider, index: number) {
    const scope = provider.providerScope || [];
    if (scope.includes("identity") && scope.includes("social")) {
      return t("hunting.sourceIdentitySocial", `Identity & social source ${index + 1}`);
    }
    if (scope.includes("identity")) {
      return t("hunting.sourceIdentity", `Identity source ${index + 1}`);
    }
    if (scope.includes("social")) {
      return t("hunting.sourceSocial", `Social source ${index + 1}`);
    }
    return t("hunting.sourceGeneric", `Installed source ${index + 1}`);
  }

  async function refreshSideData() {
    const [savedRes, recentRes] = await Promise.all([
      fetch(`${API_URL}/api/hunting/saved-searches`, { credentials: "include" }),
      fetch(`${API_URL}/api/hunting/recent-searches`, { credentials: "include" }),
    ]);
    if (savedRes.ok) {
      const savedData = (await savedRes.json()) as { items: SavedHuntingSearch[] };
      setSavedSearches(savedData.items || []);
    }
    if (recentRes.ok) {
      const recentData = (await recentRes.json()) as { items: RecentHuntingSearch[] };
      setRecentSearches(recentData.items || []);
    }
  }

  async function loadCaseNotes(nextSearchId: string) {
    try {
      const response = await fetch(`${API_URL}/api/hunting/case-notes?search_id=${encodeURIComponent(nextSearchId)}`, {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("case_notes_load_failed");
      }
      const data = (await response.json()) as { items: HuntingCaseNote[] };
      setNotes(data.items || []);
    } catch {
      setNotes([]);
    }
  }

  async function runSearch(params?: {
    artifactType?: string;
    query?: string;
    providerKeys?: string[];
  }) {
    const nextArtifactType = params?.artifactType || artifactType;
    const nextQuery = params?.query || query;
    const nextProviderKeys = params?.providerKeys || selectedProviderKeys;

    setSearching(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(`${API_URL}/api/hunting/search`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          artifact_type: nextArtifactType,
          query: nextQuery,
          provider_keys: nextProviderKeys,
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || "hunting_search_failed");
      }

      const data = (await response.json()) as {
        search_id: string;
        items: HuntingSearchItem[];
        total_results: number;
      };
      setItems(data.items || []);
      setSearchId(data.search_id || "");
      setNotice(`Busca concluída com ${data.total_results || 0} resultado(s) normalizado(s).`);
      await refreshSideData();
    } catch (err) {
      const detail = err instanceof Error ? err.message : "";
      setError(
        detail.startsWith("unknown_hunting_provider")
          ? "O backend recusou um provider de hunting inesperado."
          : "Não foi possível executar a busca.",
      );
    } finally {
      setSearching(false);
    }
  }

  async function saveCurrentSearch() {
    if (!query.trim()) return;
    setSavingSearch(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`${API_URL}/api/hunting/saved-searches`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${artifactType}:${query}`,
          artifact_type: artifactType,
          query,
          provider_keys: selectedProviderKeys,
        }),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || "saved_hunting_search_failed");
      }
      setNotice("Busca salva para reutilização.");
      await refreshSideData();
    } catch (err) {
      const detail = err instanceof Error ? err.message : "";
      setError(detail || "Não foi possível salvar a busca.");
    } finally {
      setSavingSearch(false);
    }
  }

  async function deleteSavedSearch(savedSearchId: string) {
    setError("");
    setNotice("");
    try {
      const response = await fetch(`${API_URL}/api/hunting/saved-searches/${savedSearchId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("saved_hunting_delete_failed");
      }
      setNotice("Busca salva removida.");
      await refreshSideData();
    } catch {
      setError("Não foi possível remover a busca salva.");
    }
  }

  async function saveCaseNote() {
    if (!searchId || !noteDraft.trim()) return;
    setSavingNote(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`${API_URL}/api/hunting/case-notes`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          search_id: searchId,
          note: noteDraft,
        }),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || "case_note_save_failed");
      }
      setNoteDraft("");
      setNotice("Nota adicionada à busca atual.");
      await loadCaseNotes(searchId);
    } catch (err) {
      const detail = err instanceof Error ? err.message : "";
      setError(detail || "Não foi possível salvar a nota.");
    } finally {
      setSavingNote(false);
    }
  }

  function toggleProvider(providerKey: string) {
    setSelectedProviderKeys((current) => {
      if (current.includes(providerKey)) {
        if (current.length === 1) return current;
        return current.filter((key) => key !== providerKey);
      }
      return [...current, providerKey];
    });
  }

  return (
    <div className="page-frame space-y-8">
      <div className="page-header">
        <div className="page-header-copy">
          <div className="page-eyebrow">{t("hunting.eyebrow", "Analyst")}</div>
          <h1 className="page-heading">{t("hunting.title", "Proactive Threat Hunting")}</h1>
          <p className="page-subheading">
            {t("hunting.subtitle", "Execute buscas por usernames, aliases, e-mails e contas com buscas salvas, comparação por fonte e notas analíticas por pesquisa.")}
          </p>
        </div>
        <div className="summary-strip">
          <div className="summary-pill">
            <ShieldCheck className="h-4 w-4 text-primary" />
            {readyProviderCount}/{providers.length} {t("hunting.sourcesActive", "sources active")}
          </div>
          <div className="summary-pill">{savedSearches.length} {t("hunting.savedSearches", "saved searches")}</div>
          <div className="summary-pill">{notes.length} {t("hunting.notes", "notes")}</div>
        </div>
      </div>

      <div className="page-toolbar">
        <div className="page-toolbar-copy">{t("hunting.actions", "Hunting actions")}</div>
        <div className="page-toolbar-actions">
          <button
            onClick={() => void runSearch()}
            disabled={!query.trim() || searching}
            className="btn btn-primary"
          >
            <Search className="h-4 w-4" />
            {searching ? t("hunting.executing", "Executing") : t("hunting.execute", "Execute Hunting")}
          </button>
          <button
            onClick={() => void saveCurrentSearch()}
            disabled={!query.trim() || savingSearch}
            className="btn btn-outline"
          >
            <Bookmark className="h-4 w-4" />
            {savingSearch ? t("hunting.saving", "Saving") : t("hunting.saveSearch", "Save Search")}
          </button>
        </div>
      </div>

      {(error || notice) && (
        <div className="space-y-3">
          {error && <div className="rounded-sm bg-error/10 px-4 py-3 text-sm text-error">{error}</div>}
          {notice && <div className="rounded-sm bg-primary/10 px-4 py-3 text-sm text-primary">{notice}</div>}
        </div>
      )}

      <div className="page-with-side-rail">
        <div className="page-main-pane grid grid-cols-12 gap-6">
          <div className="col-span-12 lg:col-span-5 space-y-6">
            <div className="surface-section p-6">
              <h3 className="text-xs font-bold uppercase tracking-widest text-on-surface mb-4 flex items-center gap-2">
                <Crosshair className="w-4 h-4 text-primary" />
                {t("hunting.searchDirective", "Search Directive")}
              </h3>
              <div className="space-y-5">
                <label className="block space-y-2">
                  <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-outline">
                    {t("hunting.artifactType", "Artifact Type")}
                  </div>
                  <select
                    value={artifactType}
                    onChange={(event) => setArtifactType(event.target.value)}
                    className="w-full border-0 border-b-2 border-outline bg-surface-container-high px-0 py-3 text-sm text-on-surface outline-none focus:border-primary"
                  >
                    {(supportedArtifactTypes.length ? supportedArtifactTypes : ["username", "alias", "email", "account"]).map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block space-y-2">
                  <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-outline">
                    {t("hunting.query", "Query")}
                  </div>
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={t("hunting.queryPlaceholder", "analyst_01, person@example.com, johndoe")}
                    className="w-full border-0 border-b-2 border-outline bg-surface-container-high px-0 py-3 text-sm text-on-surface outline-none focus:border-primary"
                  />
                </label>
                <div className="space-y-3">
                  <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-outline">
                    {t("hunting.sources", "Sources")}
                  </div>
                  <div className="space-y-3">
                    {providers.map((provider, index) => (
                      <label key={provider.key} className="flex items-center justify-between gap-4 rounded-sm bg-surface-container-low px-4 py-3">
                        <div>
                          <div className="text-sm font-bold text-on-surface">{formatSourceLabel(provider, index)}</div>
                          <div className="mt-1 text-[11px] text-on-surface-variant">
                            {provider.runtimeStatus?.ready
                              ? `Runtime ${formatRuntimeMode(provider.runtimeStatus.activeMode || provider.runtimeStatus.recommendedMode)}`
                              : formatRuntimeBlocker(provider.runtimeStatus?.blocker)}
                          </div>
                        </div>
                        <input
                          type="checkbox"
                          checked={selectedProviderKeys.includes(provider.key)}
                          onChange={() => toggleProvider(provider.key)}
                        />
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="surface-section p-6">
              <h3 className="text-xs font-bold uppercase tracking-widest text-on-surface mb-4 flex items-center gap-2">
                <History className="w-4 h-4 text-primary" />
                {t("hunting.recentSearches", "Recent Searches")}
              </h3>
              <div className="space-y-4">
                {recentSearches.length === 0 ? (
                  <div className="text-sm text-on-surface-variant">{t("hunting.noRecentSearches", "Nenhuma busca recente persistida.")}</div>
                ) : (
                  recentSearches.map((search) => (
                    <button
                      key={search.search_id}
                      type="button"
                      onClick={() => {
                        setArtifactType(search.artifact_type);
                        setQuery(search.query);
                        setSelectedProviderKeys(search.providers.length ? search.providers : selectedProviderKeys);
                        setSearchId(search.search_id);
                        setNotice(`Contexto carregado da busca ${search.search_id}.`);
                      }}
                      className="w-full rounded-sm bg-surface-container-low p-4 text-left"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-bold text-on-surface">{search.query}</div>
                        <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">
                          {search.result_count} {t("hunting.results", "results")}
                        </span>
                      </div>
                      <div className="mt-2 text-[11px] text-on-surface-variant">
                        {search.artifact_type} · {formatTimestamp(search.timestamp)}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="col-span-12 lg:col-span-7">
            <div className="surface-section">
              <div className="surface-section-header">
                <h3 className="text-xs font-bold uppercase tracking-widest text-on-surface">
                  {t("hunting.normalizedResults", "Normalized Results")}
                </h3>
                <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-on-surface-variant">
                  search id {searchId || t("hunting.pending", "pending")}
                </span>
              </div>
              <div className="p-6 space-y-6">
                {items.length === 0 ? (
                  <div className="rounded-sm bg-surface-container-low p-8 text-center text-sm text-on-surface-variant">
                    {t("hunting.noSearchExecuted", "Nenhuma busca executada nesta sessão.")}
                  </div>
                ) : (
                  items.map((item, index) => (
                    <section key={item.provider.key} className="rounded-sm bg-surface-container-low p-5">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-bold text-on-surface">{formatSourceLabel(item.provider, index)}</div>
                          <div className="mt-1 text-[11px] text-on-surface-variant">
                            {item.provider.runtimeStatus?.ready
                              ? `Runtime ${formatRuntimeMode(item.provider.runtimeStatus.activeMode || item.provider.runtimeStatus.recommendedMode)}`
                              : formatRuntimeBlocker(item.provider.runtimeStatus?.blocker)}
                          </div>
                        </div>
                        <span
                          className={`inline-flex items-center whitespace-nowrap rounded-sm px-2 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ${
                            item.status === "ok"
                              ? "bg-primary/10 text-primary"
                              : item.status === "unsupported"
                                ? "bg-warning/10 text-warning"
                                : "bg-error/10 text-error"
                          }`}
                        >
                          {item.status}
                        </span>
                      </div>

                      {item.error && (
                        <div className="mt-4 rounded-sm bg-error/10 px-4 py-3 text-xs text-error">
                          {formatRuntimeBlocker(item.error)}
                        </div>
                      )}

                      <div className="mt-4 grid grid-cols-1 gap-4">
                        {item.results.length === 0 ? (
                          <div className="rounded-sm bg-surface-container-lowest px-4 py-4 text-xs text-on-surface-variant">
                            Nenhum resultado normalizado para esta fonte.
                          </div>
                        ) : (
                          item.results.map((result, index) => (
                            <div key={`${result.url || result.title || "result"}-${index}`} className="rounded-sm bg-surface-container-lowest px-4 py-4">
                              <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                                <div>
                                  <div className="text-sm font-bold text-on-surface">
                                    {result.title || String(result.attributes?.handle || result.platform || "Match")}
                                  </div>
                                  <div className="mt-1 text-[11px] text-on-surface-variant">
                                    {result.platform || String(result.attributes?.site || "Platform not informed")}
                                  </div>
                                </div>
                                <span className="inline-flex items-center whitespace-nowrap rounded-sm bg-primary/10 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-primary">
                                  Confidence {Math.round((result.confidence || 0) * 100)}%
                                </span>
                              </div>
                              <div className="mt-3 text-xs text-on-surface-variant">
                                {result.summary || "No summary provided for this result."}
                              </div>
                              {result.url && (
                                <a
                                  href={result.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="mt-3 inline-flex text-xs font-bold uppercase tracking-[0.16em] text-primary hover:underline"
                                >
                                  Open profile
                                </a>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </section>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="page-side-rail-right space-y-6">
          <div className="surface-section">
            <div className="surface-section-header">
              <h3 className="surface-section-title">Runtime Readiness</h3>
            </div>
            <div className="p-6 space-y-4">
              <div className="rounded-sm bg-surface-container-low px-4 py-4 text-sm text-on-surface">
                Configured mode: <strong>{String(runtimeCatalog?.configuredMode || "auto")}</strong>
              </div>
              {runtimeModes.map(([mode, meta]) => (
                <div key={mode} className="rounded-sm bg-surface-container-low px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-bold text-on-surface">{meta.label || formatRuntimeMode(mode)}</div>
                    <span className={`badge ${meta.wired ? "badge-success" : meta.ready ? "badge-warning" : "badge-outline"}`}>
                      {meta.wired ? "Wired" : meta.ready ? "Declared" : "Off"}
                    </span>
                  </div>
                  <div className="mt-2 text-xs text-on-surface-variant">{meta.detail || "No runtime details available."}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="surface-section">
            <div className="surface-section-header">
              <h3 className="surface-section-title">{t("hunting.sourceComparison", "Source Comparison")}</h3>
            </div>
            <div className="p-6 space-y-4">
              {providerComparison.length === 0 ? (
                <div className="text-sm text-on-surface-variant">
                  {t("hunting.compareSourcesEmpty", "Execute uma busca para comparar status, volume e confiança por fonte.")}
                </div>
              ) : (
                providerComparison.map((provider, index) => (
                  <div key={provider.key} className="rounded-sm bg-surface-container-low px-4 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-bold text-on-surface">{t("hunting.sourceGeneric", `Installed source ${index + 1}`)}</div>
                      <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">
                        {provider.resultCount} {t("hunting.hits", "hits")}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-on-surface-variant">
                      <div>Status: {provider.status}</div>
                      <div>Avg conf: {provider.averageConfidence}%</div>
                    </div>
                  </div>
                ))
              )}
              <div className="rounded-sm bg-surface-container-low px-4 py-4 text-sm text-on-surface">
                {t("hunting.totalNormalizedResults", "Total normalized results")}: <strong>{totalResults}</strong>
              </div>
            </div>
          </div>

          <div className="surface-section">
            <div className="surface-section-header">
              <h3 className="surface-section-title">{t("hunting.savedSearches", "Saved Searches")}</h3>
            </div>
            <div className="p-6 space-y-4">
              {savedSearches.length === 0 ? (
                  <div className="text-sm text-on-surface-variant">{t("hunting.noSavedSearches", "Nenhuma busca salva.")}</div>
              ) : (
                savedSearches.map((saved) => (
                  <div key={saved._id} className="rounded-sm bg-surface-container-low px-4 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-bold text-on-surface">{saved.name}</div>
                        <div className="mt-1 text-[11px] text-on-surface-variant">
                          {saved.artifact_type} · {saved.query}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="text-[10px] font-bold uppercase tracking-[0.16em] text-error"
                        onClick={() => void deleteSavedSearch(saved._id)}
                      >
                        {t("hunting.remove", "Remove")}
                      </button>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-[11px] text-on-surface-variant">
                      <span>Used {saved.use_count}x</span>
                      <span>{formatTimestamp(saved.last_used_at || saved.created_at)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="surface-section">
            <div className="surface-section-header">
              <h3 className="surface-section-title">{t("hunting.notes", "Notes")}</h3>
            </div>
            <div className="p-6 space-y-4">
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-outline">
                {t("hunting.activeSearch", "Active search")}
              </div>
              <div className="rounded-sm bg-surface-container-low px-4 py-3 text-sm text-on-surface">
                {searchId || t("hunting.noSearchSelected", "No search selected yet")}
              </div>
              <label className="block space-y-2">
                <div className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-outline">
                  <StickyNote className="h-4 w-4" />
                  {t("hunting.analystNote", "Analyst note")}
                </div>
                <textarea
                  value={noteDraft}
                  onChange={(event) => setNoteDraft(event.target.value)}
                  className="min-h-28 w-full rounded-sm border border-outline-variant/15 bg-surface-container-low px-4 py-3 text-sm text-on-surface outline-none"
                  placeholder={t("hunting.analystNotePlaceholder", "Capture rationale, escalation context or next analyst step.")}
                />
              </label>
              <button
                type="button"
                onClick={() => void saveCaseNote()}
                disabled={!searchId || !noteDraft.trim() || savingNote}
                className="btn btn-outline w-full"
              >
                {savingNote ? t("hunting.savingNote", "Saving note") : t("hunting.saveNote", "Save note")}
              </button>
              <div className="space-y-3">
                {notes.length === 0 ? (
                  <div className="text-sm text-on-surface-variant">{t("hunting.noNotes", "Nenhuma nota para esta busca.")}</div>
                ) : (
                  notes.map((note) => (
                    <div key={note._id} className="rounded-sm bg-surface-container-low px-4 py-4">
                      <div className="text-sm text-on-surface">{note.note}</div>
                      <div className="mt-2 text-[11px] text-on-surface-variant">{formatTimestamp(note.created_at)}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="surface-section p-6">
            <h3 className="text-xs font-bold uppercase tracking-widest text-on-surface mb-4 flex items-center gap-2">
              <Fingerprint className="w-4 h-4 text-primary" />
              {t("hunting.sourceInventory", "Source Inventory")}
            </h3>
            {loadingProviders ? (
              <div className="text-sm text-on-surface-variant">{t("hunting.loadingSources", "Loading sources")}</div>
            ) : (
              <div className="space-y-4">
                {providers.map((provider) => (
                  <div key={provider.key} className="rounded-sm bg-surface-container-low p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-bold text-on-surface">{provider.name}</div>
                        <div className="mt-1 text-[11px] text-on-surface-variant">{provider.key}</div>
                      </div>
                      <span className="inline-flex items-center whitespace-nowrap rounded-sm bg-primary/10 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-primary">
                        {provider.executionProfile?.mode || "standard"}
                      </span>
                    </div>
                    <div className="mt-3 text-xs text-on-surface-variant">
                      {provider.artifactTypes.join(", ")} · {provider.providerScope.join(", ")}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
