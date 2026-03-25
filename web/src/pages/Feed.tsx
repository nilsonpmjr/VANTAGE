import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, Download, Filter, RefreshCw, Rss, ShieldAlert } from "lucide-react";
import API_URL from "../config";

type FeedItem = {
  _id: string;
  title: string;
  summary?: string;
  severity?: string;
  source_name?: string;
  source_type?: string;
  tlp?: string;
  published_at?: string;
  sector?: string[];
  tags?: string[];
  data?: {
    link?: string;
  };
};

const PAGE_SIZE = 6;

function severityTone(severity?: string) {
  switch ((severity || "").toLowerCase()) {
    case "critical":
      return { label: "CRITICAL", className: "text-error", badge: "bg-error/10 text-error" };
    case "high":
      return { label: "HIGH", className: "text-error", badge: "bg-error-container/20 text-on-error-container" };
    case "medium":
      return { label: "MEDIUM", className: "text-amber-600", badge: "bg-amber-100 text-amber-700" };
    case "info":
      return { label: "INFO", className: "text-on-surface", badge: "bg-surface-container-high text-on-surface-variant" };
    default:
      return { label: "LOW", className: "text-on-surface", badge: "bg-surface-container-high text-on-surface-variant" };
  }
}

function formatPublishedAt(value?: string) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString("pt-BR");
}

export default function Feed() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState<FeedItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(Number(searchParams.get("page") || 1));
  const [severity, setSeverity] = useState(searchParams.get("severity") || "all");
  const [sourceType, setSourceType] = useState(searchParams.get("source_type") || "all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const fetchFeed = useCallback(async (targetPage = page, isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String((targetPage - 1) * PAGE_SIZE),
      });
      if (severity !== "all") params.set("severity", severity);
      if (sourceType !== "all") params.set("source_type", sourceType);

      const response = await fetch(`${API_URL}/api/feed?${params.toString()}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("feed_fetch_failed");
      const data = await response.json();
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch {
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [page, severity, sourceType]);

  useEffect(() => {
    void fetchFeed(page);
  }, [fetchFeed, page]);

  useEffect(() => {
    const nextPage = Number(searchParams.get("page") || 1);
    const nextSeverity = searchParams.get("severity") || "all";
    const nextSourceType = searchParams.get("source_type") || "all";
    setPage(Number.isFinite(nextPage) && nextPage > 0 ? nextPage : 1);
    setSeverity(nextSeverity);
    setSourceType(nextSourceType);
  }, [searchParams]);

  function syncSearchParams(nextPage: number, nextSeverity: string, nextSourceType: string) {
    const next = new URLSearchParams();
    if (nextPage > 1) next.set("page", String(nextPage));
    if (nextSeverity !== "all") next.set("severity", nextSeverity);
    if (nextSourceType !== "all") next.set("source_type", nextSourceType);
    setSearchParams(next, { replace: true });
  }

  const featured = useMemo(
    () => items.find((item) => item.severity === "critical" || item.severity === "high") || items[0],
    [items],
  );

  const criticalCount = useMemo(() => items.filter((item) => item.severity === "critical").length, [items]);
  const linkedCount = useMemo(() => items.filter((item) => item.data?.link).length, [items]);

  return (
    <div className="page-frame">
      <div className="page-header">
        <div className="page-header-copy">
          <div className="page-eyebrow">Threat Feed</div>
          <h1 className="mt-4 text-3xl font-extrabold tracking-tighter text-on-surface">
            Threat Intelligence Feed
          </h1>
        </div>
      </div>

      <div className="page-toolbar mb-8">
        <div className="page-toolbar-copy">Feed actions</div>
        <div className="page-toolbar-actions">
          <button
            onClick={() => fetchFeed(page, true)}
            className="btn btn-outline"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button className="btn btn-primary">
            <Download className="w-4 h-4" />
            Export Report
          </button>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6 mb-8">
        <div className="col-span-12 lg:col-span-8 bg-surface-container-lowest p-6 shadow-sm border-l-4 border-error relative overflow-hidden rounded-sm">
          <div className="relative z-10">
            <span className="text-error font-bold text-[10px] uppercase tracking-[0.2em] mb-4 block">
              Urgent Directive
            </span>
            <h2 className="text-xl font-bold mb-3 tracking-tight leading-tight max-w-xl">
              {featured?.title || "No feed items available in the current selection."}
            </h2>
            <p className="text-on-surface-variant text-sm mb-6 max-w-2xl leading-relaxed">
              {featured?.summary || "Adjust the filters or refresh the feed to ingest recent intelligence from the configured sources."}
            </p>
            <div className="flex items-center gap-6 flex-wrap">
              <div className="flex flex-col">
                <span className="text-[10px] text-on-surface-variant font-bold uppercase">Severity</span>
                <span className={`text-sm font-semibold ${severityTone(featured?.severity).className}`}>
                  {severityTone(featured?.severity).label}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] text-on-surface-variant font-bold uppercase">Source</span>
                <span className="text-sm font-semibold">{featured?.source_name || featured?.source_type || "VANTAGE"}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] text-on-surface-variant font-bold uppercase">TLP</span>
                <span className="text-sm font-semibold text-error">{(featured?.tlp || "white").toUpperCase()}</span>
              </div>
            </div>
          </div>
          <ShieldAlert className="absolute -right-4 -bottom-4 w-40 h-40 opacity-[0.03] rotate-12 text-on-surface" />
        </div>
        <div className="col-span-12 lg:col-span-4 flex flex-col gap-4">
          <div className="flex-1 bg-surface-container-lowest p-4 flex flex-col justify-between shadow-sm rounded-sm">
            <span className="text-[10px] text-on-surface-variant font-bold uppercase tracking-widest">
              Feed Volume (page)
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black tracking-tighter">{items.length}</span>
              <span className="text-xs text-emerald-500 font-bold">of {total}</span>
            </div>
          </div>
          <div className="flex-1 bg-surface-container-lowest p-4 flex flex-col justify-between shadow-sm rounded-sm">
            <span className="text-[10px] text-on-surface-variant font-bold uppercase tracking-widest">
              High Priority Linked Items
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black tracking-tighter">{criticalCount}</span>
              <span className="text-xs text-error font-bold">{linkedCount} external refs</span>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-surface-container-low p-3 mb-6 flex flex-wrap items-center justify-between gap-4 rounded-sm">
        <div className="flex items-center gap-3 flex-wrap">
          <Filter className="w-4 h-4 text-on-surface-variant" />
          <select
            value={severity}
            onChange={(e) => {
              syncSearchParams(1, e.target.value, sourceType);
            }}
            className="px-3 py-2 bg-surface-container-lowest border border-outline-variant/30 rounded-sm text-xs font-semibold text-on-surface"
          >
            <option value="all">All Severities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
            <option value="info">Info</option>
          </select>
          <select
            value={sourceType}
            onChange={(e) => {
              syncSearchParams(1, severity, e.target.value);
            }}
            className="px-3 py-2 bg-surface-container-lowest border border-outline-variant/30 rounded-sm text-xs font-semibold text-on-surface"
          >
            <option value="all">All Sources</option>
            <option value="rss">RSS</option>
            <option value="misp">MISP</option>
          </select>
        </div>
        <div className="flex items-center gap-2 text-on-surface-variant">
          <span className="text-[11px] font-bold uppercase tracking-widest">Showing:</span>
          <span className="text-xs font-medium text-on-surface">{items.length} items</span>
        </div>
      </div>

      {loading ? (
        <div className="bg-surface-container-lowest rounded-sm shadow-sm p-8 text-sm text-on-surface-variant">
          Loading threat feed...
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {items.map((item) => {
            const tone = severityTone(item.severity);
            return (
              <article
                key={item._id}
                className={`bg-surface-container-lowest p-5 shadow-sm hover:shadow-md transition-shadow group rounded-sm flex flex-col ${item.severity === "critical" ? "border-l-4 border-error" : ""}`}
              >
                <div className="flex justify-between items-start mb-4 gap-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-surface-container-high flex items-center justify-center rounded">
                      <Rss className="w-4 h-4 text-on-surface-variant" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xs font-bold tracking-tight">{item.source_name || item.source_type || "VANTAGE"}</span>
                      <span className="text-[10px] text-outline uppercase font-semibold">
                        Source / {(item.source_type || "intel").toUpperCase()}
                      </span>
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 text-[9px] font-black uppercase tracking-widest rounded ${tone.badge}`}>
                    TLP: {(item.tlp || "white").toUpperCase()}
                  </span>
                </div>
                <h3 className="text-base font-bold mb-2 group-hover:text-primary transition-colors tracking-tight">
                  {item.title}
                </h3>
                <p className="text-on-surface-variant text-xs leading-relaxed mb-4 line-clamp-3">
                  {item.summary || "No summary available for this feed item."}
                </p>
                <div className="flex items-center justify-between mt-auto pt-4 border-t border-surface-container-low gap-3">
                  <div className="flex items-center gap-4 flex-wrap">
                    <div className="flex flex-col">
                      <span className="text-[9px] uppercase font-bold text-on-surface-variant">Posted</span>
                      <span className="text-[11px] font-semibold">{formatPublishedAt(item.published_at)}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[9px] uppercase font-bold text-on-surface-variant">Severity</span>
                      <span className={`text-[11px] font-semibold ${tone.className}`}>{tone.label}</span>
                    </div>
                  </div>
                  <div className="flex gap-1 flex-wrap justify-end">
                    {(item.tags || []).slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        className="px-1.5 py-0.5 bg-surface-container-high text-on-surface-variant text-[9px] font-bold rounded"
                      >
                        {tag.toUpperCase()}
                      </span>
                    ))}
                  </div>
                </div>
                {item.data?.link && (
                  <button
                    onClick={() => window.open(item.data?.link, "_blank", "noopener")}
                    className="mt-4 text-left text-xs font-bold uppercase tracking-widest text-primary hover:underline"
                  >
                    Open source reference
                  </button>
                )}
              </article>
            );
          })}
        </div>
      )}

      <div className="bg-surface-container-low px-6 py-3 border-t border-surface-container flex items-center justify-between mt-6 rounded-sm">
        <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">
          Page {page} of {totalPages}
        </span>
        <div className="flex gap-1 items-center">
          <button
            onClick={() => syncSearchParams(Math.max(1, page - 1), severity, sourceType)}
            disabled={page === 1}
            className="p-1 text-outline hover:text-on-surface disabled:opacity-30"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          {Array.from({ length: Math.min(totalPages, 5) }, (_, index) => {
            const pageNumber = index + 1;
            return (
              <button
                key={pageNumber}
                onClick={() => syncSearchParams(pageNumber, severity, sourceType)}
                className={`p-1 font-medium text-xs px-2 ${pageNumber === page ? "text-on-surface font-bold underline underline-offset-4" : "text-on-surface-variant hover:text-on-surface"}`}
              >
                {pageNumber}
              </button>
            );
          })}
          <button
            onClick={() => syncSearchParams(Math.min(totalPages, page + 1), severity, sourceType)}
            disabled={page === totalPages}
            className="p-1 text-outline hover:text-on-surface disabled:opacity-30"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
