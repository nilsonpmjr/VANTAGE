import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Terminal,
  ArrowRight,
  Shield,
  Bug,
  ShieldAlert,
  LineChart,
  Activity,
  Rss,
  type LucideIcon,
} from "lucide-react";
import API_URL from "../config";
import { useLanguage } from "../context/LanguageContext";

type FeedItem = {
  _id: string;
  title: string;
  summary?: string;
  severity?: string;
  source_name?: string;
  source_type?: string;
  published_at?: string;
  tags?: string[];
  data?: {
    link?: string;
  };
};

function severityMeta(level?: string) {
  switch ((level || "").toLowerCase()) {
    case "critical":
      return {
        label: "CRITICAL",
        levelColor: "bg-error text-on-primary",
        Icon: Shield,
      };
    case "high":
      return {
        label: "HIGH",
        levelColor: "bg-error-container text-on-error-container",
        Icon: Bug,
      };
    case "medium":
      return {
        label: "MEDIUM",
        levelColor: "bg-secondary text-white",
        Icon: ShieldAlert,
      };
    default:
      return {
        label: "LOW",
        levelColor: "bg-surface-container-highest text-on-surface-variant",
        Icon: LineChart,
      };
  }
}

function formatRelative(dateStr: string | undefined, t: (key: string, fallback?: string) => string) {
  if (!dateStr) return t("home.recentLabel", "RECENT");
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return t("home.recentLabel", "RECENT");
  const diff = Date.now() - date.getTime();
  const hours = Math.max(1, Math.round(diff / 36e5));
  if (hours < 24) return `${hours} ${t("home.hoursAgo", "HOURS AGO")}`;
  const days = Math.max(1, Math.round(hours / 24));
  return `${days} ${t("home.daysAgo", "DAYS AGO")}`;
}

export default function Home() {
  const { t } = useLanguage();
  const [searchQuery, setSearchQuery] = useState("");
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    let mounted = true;
    fetch(`${API_URL}/api/feed?limit=4&offset=0`, { credentials: "include" })
      .then((response) => (response.ok ? response.json() : { items: [] }))
      .then((payload) => {
        if (!mounted) return;
        setFeedItems(payload.items || []);
      })
      .catch(() => {
        if (!mounted) return;
        setFeedItems([]);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const feedVolume = useMemo(() => feedItems.length, [feedItems]);
  const criticalCount = useMemo(
    () => feedItems.filter((item) => item.severity === "critical").length,
    [feedItems],
  );
  const highCount = useMemo(
    () => feedItems.filter((item) => item.severity === "high").length,
    [feedItems],
  );

  const handleSearch = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (searchQuery.trim()) {
      const sanitized = searchQuery.trim();
      localStorage.setItem("lastSearch", sanitized);
      navigate(`/analyze/${encodeURIComponent(sanitized)}`);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-12 pb-12">
      <section className="flex flex-col items-center justify-center py-16">
        <div className="w-full max-w-3xl space-y-4">
          <div className="flex items-center gap-3 text-on-surface-variant/60 font-mono text-[11px] tracking-widest mb-2 uppercase">
            <span className="text-primary font-bold">{t("home.eyebrowThreat", "threat intelligence")}</span>
            <span>/</span>
            <span>{t("home.eyebrowSearch", "global search")}</span>
          </div>
          <form onSubmit={handleSearch} className="relative group">
            <div className="absolute inset-y-0 left-6 flex items-center pointer-events-none">
              <Terminal className="w-6 h-6 text-primary" />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("home.placeholder", "Enter an IP, domain, or hash")}
              className="w-full h-20 pl-16 pr-32 bg-surface-container-lowest text-on-surface border-none shadow-sm focus:ring-2 focus:ring-primary/20 text-xl font-medium tracking-tight rounded-lg placeholder:text-outline-variant/50 transition-all outline-none"
            />
            <div className="absolute inset-y-0 right-4 flex items-center">
              <button
                type="submit"
                className="px-6 py-2.5 bg-primary text-white text-sm font-bold rounded shadow-sm hover:bg-primary-dim active:scale-95 transition-all"
              >
                {t("home.execute", "EXECUTE")}
              </button>
            </div>
          </form>
          <div className="flex flex-wrap gap-6 mt-4 px-2">
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-on-surface-variant/70 uppercase tracking-wider">
              <span className="text-primary">{t("home.tip", "TIP:")}</span> {t("home.tipCidr", "Use")}{" "}
              <code className="bg-surface-container-high px-1 rounded">cidr:</code>{" "}
              {t("home.tipCidrTail", "for range searches")}
            </div>
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-on-surface-variant/70 uppercase tracking-wider">
              <span className="text-primary">{t("home.tip", "TIP:")}</span> {t("home.tipTag", "Prefix with")}{" "}
              <code className="bg-surface-container-high px-1 rounded">tag:</code>{" "}
              {t("home.tipTagTail", "for labels")}
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-6">
        <div className="flex items-center justify-between border-b border-outline-variant/20 pb-4">
          <div className="space-y-1">
            <h2 className="text-xl font-extrabold tracking-tighter uppercase text-on-surface">
              {t("home.recentIntel", "Recent Intelligence")}
            </h2>
            <p className="text-[11px] font-medium text-on-surface-variant uppercase tracking-[0.2em]">
              {t("home.liveFeed", "Live threat feed indexed from the VANTAGE backend")}
            </p>
          </div>
          <button
            onClick={() => navigate("/feed")}
            className="flex items-center gap-2 text-primary font-bold text-xs uppercase hover:underline"
          >
            {t("home.feedArchive", "View Feed Archive")}
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {feedItems.length > 0 ? (
            feedItems.map((item) => {
              const { label, levelColor, Icon } = severityMeta(item.severity);
              return (
                <div key={item._id}>
                  <FeedCard
                    level={label}
                    levelColor={levelColor}
                    icon={Icon}
                    title={item.title}
                    source={(item.source_name || item.source_type || "VANTAGE").toUpperCase()}
                    time={formatRelative(item.published_at, t)}
                    desc={item.summary || t("home.noSummary", "No summary available for this feed item.")}
                    tags={item.tags?.slice(0, 3) || [`#${(item.source_type || "intel").toUpperCase()}`]}
                    onClick={() => {
                      if (item.data?.link) {
                        window.open(item.data.link, "_blank", "noopener");
                      }
                    }}
                  />
                </div>
              );
            })
          ) : (
            <div className="md:col-span-2 bg-surface-container-lowest p-8 rounded shadow-sm text-on-surface-variant flex items-center gap-4">
              <Rss className="w-5 h-5 text-primary" />
              {t("home.noFeedItems", "No recent feed items were returned by the backend.")}
            </div>
          )}
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 surface-section p-6">
          <div className="flex items-center gap-2 mb-2">
            <Activity className="w-4 h-4 text-primary" />
            <h4 className="text-[11px] font-bold uppercase tracking-widest text-on-surface">
              {t("home.feedDistribution", "Feed Distribution Snapshot")}
            </h4>
          </div>
          <p className="mb-4 text-xs text-on-surface-variant">
            {t("home.informationalOnly", "Passive health readout for the current intelligence sample. This panel is informational only.")}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <NodeStatus name="AMER-EAST" value="99.98%" color="bg-emerald-500" />
            <NodeStatus name="EMEA-CENTRAL" value="99.42%" color="bg-emerald-500" />
            <NodeStatus name="APAC-SOUTH" value="97.81%" color="bg-amber-500" width="80%" />
            <NodeStatus name="LATAM-WEST" value="100.0%" color="bg-emerald-500" />
          </div>
        </div>

        <div className="surface-section overflow-hidden">
          <div className="surface-section-header">
            <div>
              <h3 className="surface-section-title">Feed Summary</h3>
              <p className="mt-1 text-[10px] font-medium uppercase tracking-widest text-on-surface-variant">
                {t("home.currentSampleOnly", "Current sample only")}
              </p>
            </div>
            <Shield className="h-5 w-5 text-primary/70" />
          </div>
          <div className="space-y-4 p-6">
            <div>
              <div className="text-3xl font-black tracking-tighter text-on-surface">{feedVolume}</div>
              <div className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">
                {t("home.totalLoaded", "TOTAL ITEMS LOADED")}
              </div>
            </div>
            <div className="space-y-3">
              <SummaryMeter label={t("home.criticalItems", "CRITICAL ITEMS")} value={criticalCount} />
              <SummaryMeter label={t("home.elevatedItems", "ELEVATED ITEMS")} value={highCount} />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

type FeedCardProps = {
  level: string;
  levelColor: string;
  icon: LucideIcon;
  title: string;
  source: string;
  time: string;
  desc: string;
  tags: string[];
  onClick?: () => void;
};

function FeedCard({
  level,
  levelColor,
  icon: Icon,
  title,
  source,
  time,
  desc,
  tags,
  onClick,
}: FeedCardProps) {
  const accentClass =
    level === "CRITICAL"
      ? "card-accent-error"
      : level === "HIGH"
        ? "card-accent-warning"
        : level === "MEDIUM"
          ? "card-accent-primary"
          : "card-accent-secondary";

  return (
    <div
      className={`card card-accent-left ${accentClass} p-6 flex flex-col gap-4 relative overflow-hidden ${
        onClick ? "card-hover cursor-pointer" : ""
      }`}
      onClick={onClick}
    >
      <div className="absolute top-0 right-0 p-3">
        <span
          className={`badge ${
            level === "CRITICAL"
              ? "badge-error"
              : level === "HIGH"
                ? "badge-warning"
                : level === "MEDIUM"
                  ? "badge-primary"
                  : "badge-neutral"
          }`}
        >
          {level}
        </span>
      </div>
      <div className="flex items-start gap-4">
        <div className="p-3 bg-surface-container-high rounded text-on-surface-variant">
          <Icon className="w-5 h-5" />
        </div>
        <div className="space-y-1 pr-16">
          <h3 className={`font-bold text-on-surface leading-tight text-base ${onClick ? "group-hover:text-primary transition-colors" : ""}`}>
            {title}
          </h3>
          <div className="flex items-center gap-3 text-[11px] font-bold uppercase tracking-wider text-on-surface-variant/60">
            <span className="text-on-surface-variant">{source}</span>
            <span className="w-1 h-1 rounded-full bg-outline-variant"></span>
            <span>{time}</span>
          </div>
        </div>
      </div>
      <p className="text-sm text-on-surface-variant leading-relaxed line-clamp-2 pl-[3.75rem]">
        {desc}
      </p>
      <div className="mt-2 pl-[3.75rem] flex flex-wrap gap-2">
        {tags.map((tag) => (
          <span key={tag} className="badge badge-neutral">
            {tag}
          </span>
        ))}
      </div>
    </div>
  );
}

function SummaryMeter({ label, value }: { label: string; value: number }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-[11px] font-bold text-on-surface">
        <span>{label}</span>
        <span>{value}</span>
      </div>
      <div className="h-1 rounded-full bg-surface-container-high">
        <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(10, value * 20)}%` }} />
      </div>
    </div>
  );
}

function NodeStatus({
  name,
  value,
  color,
  width = "100%",
}: {
  name: string;
  value: string;
  color: string;
  width?: string;
}) {
  return (
    <div className="bg-surface-container-lowest rounded-sm p-4 space-y-3 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-on-surface-variant">{name}</span>
        <span className="text-sm font-black text-on-surface">{value}</span>
      </div>
      <div className="w-full h-1.5 bg-surface-container rounded-full overflow-hidden">
        <div className={`${color} h-full`} style={{ width }} />
      </div>
    </div>
  );
}
