import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  AlignLeft,
  BookOpen,
  Check,
  ChevronsUpDown,
  Clock3,
  Copy,
  Download,
  FileText,
  Filter,
  Folder,
  FolderOpen,
  GitCompare,
  History,
  Image,
  Keyboard,
  Link2,
  Loader2,
  Move,
  Paperclip,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Pin,
  Plus,
  RotateCcw,
  Search,
  Send,
  SlidersHorizontal,
  Star,
  Table2,
  Tag,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { MarkdownContent, MarkdownEditor } from "../../components/markdown";
import {
  extractTocEntries,
  EvidenceTocPanel,
  EvidenceQuickSwitcher,
  EvidenceShortcutsModal,
  EvidenceTableDialog,
  EvidenceLinkDialog,
  EvidenceRevisionDiffModal,
  EvidenceAssetManagerModal,
  EvidenceTreeView,
  EvidenceSectionModal,
  EvidenceMoveModal,
  EvidenceImportModal,
  EvidenceBrokenLinksPanel,
  type TocEntry,
  type QuickSwitcherItem,
  type LinkTargetSuggestion,
} from "./evidence";
import {
  addEvidenceFavorite,
  copyEvidenceNote,
  createEvidenceDraft,
  createEvidenceSection,
  deleteEvidenceDraftAttachment,
  discardEvidenceDraft,
  evidenceAttachmentDownloadUrl,
  getBrokenEvidenceLinks,
  getEvidenceBundleExportUrl,
  getEvidenceDraft,
  getEvidenceLinks,
  getEvidenceNote,
  getEvidenceNoteExportUrl,
  getEvidenceTags,
  getEvidenceTree,
  importEvidenceNote,
  listEvidenceDrafts,
  listEvidenceFavorites,
  listEvidenceNotes,
  listEvidenceRevisions,
  listFindings,
  moveEvidenceNote,
  pinEvidenceNote,
  publishEvidenceDraft,
  rebaseEvidenceDraft,
  removeEvidenceFavorite,
  resolveEvidenceReferences,
  saveEvidenceDraft,
  searchEvidenceNotebook,
  suggestEvidenceReferences,
  uploadEvidenceDraftAttachments,
  type EvidenceAttachment,
  type EvidenceBrokenLink,
  type EvidenceDraft,
  type EvidenceDraftSummary,
  type EvidenceLinks,
  type EvidenceNote,
  type EvidenceNoteInput,
  type EvidenceNoteSummary,
  type EvidenceRevision,
  type EvidenceReference,
  type EvidenceTreeNode,
  type Finding,
  type NotebookSearchResult,
  type NotebookSearchType,
} from "./api";

export const ptesPhases = [
  ["pre-engagement", "Pré-engajamento"],
  ["reconnaissance", "Reconhecimento"],
  ["threat-modeling", "Modelagem de ameaças"],
  ["vulnerability-analysis", "Análise de vulnerabilidades"],
  ["exploitation", "Exploração"],
  ["post-exploitation", "Pós-exploração"],
  ["reporting", "Relatório"],
] as const;

export function phaseLabel(phase: string): string {
  return ptesPhases.find(([key]) => key === phase)?.[1] ?? phase;
}

const NOTE_PAGE_SIZE = 30;
const NEW_NOTE_TOKEN = "new";
const PANEL_PREFERENCES_KEY = "vantage:redmode:evidence-panel-preferences";
const PINNED_NOTES_KEY_PREFIX = "vantage:redmode:evidence-pinned";
const OPEN_TABS_KEY_PREFIX = "vantage:redmode:evidence-open-tabs";
const EXPLORER_MIN_WIDTH = 240;
const EXPLORER_MAX_WIDTH = 440;
const EXPLORER_DEFAULT_WIDTH = 300;
const PROPERTIES_MIN_WIDTH = 256;
const PROPERTIES_MAX_WIDTH = 480;
const PROPERTIES_DEFAULT_WIDTH = 320;
const PANEL_KEYBOARD_STEP = 16;

const searchTypeLabels: Record<NotebookSearchType, string> = {
  all: "Todos os tipos",
  evidence: "Evidências",
  draft: "Meus rascunhos",
  finding: "Findings",
  source: "Fontes",
  target: "Alvos",
};

type MobilePane = "notes" | "document" | "properties";
type LeftPanelView = "explorer" | "tree" | "search";
type RightPanelView = "properties" | "links" | "attachments" | "history" | "toc" | "broken_links";

interface EvidenceForm {
  title: string;
  markdown: string;
  phase: string;
  tags: string;
  targets: string;
  findingIds: string[];
  attachmentIds: string[];
}

interface OpenNoteTab {
  id: string;
  title: string;
}

function emptyForm(): EvidenceForm {
  return {
    title: "",
    markdown: "",
    phase: "pre-engagement",
    tags: "",
    targets: "",
    findingIds: [],
    attachmentIds: [],
  };
}

function noteToForm(note: EvidenceNote): EvidenceForm {
  return {
    title: note.title,
    markdown: note.markdown,
    phase: note.phase,
    tags: note.tags.join(", "),
    targets: note.targets.join("\n"),
    findingIds: note.finding_ids,
    attachmentIds: note.attachment_ids,
  };
}

function draftToForm(draft: EvidenceDraft): EvidenceForm {
  return {
    title: draft.title,
    markdown: draft.markdown,
    phase: draft.phase,
    tags: draft.tags.join(", "),
    targets: draft.targets.join("\n"),
    findingIds: draft.finding_ids,
    attachmentIds: draft.attachment_ids,
  };
}

function uniqueList(values: string[], caseInsensitive = false): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = caseInsensitive ? value.toLocaleLowerCase("pt-BR") : value;
    if (!value || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function formPayload(form: EvidenceForm): EvidenceNoteInput {
  return {
    title: form.title.trim(),
    markdown: form.markdown,
    phase: form.phase,
    tags: uniqueList(
      form.tags.split(/[,\n]/).map((value) => value.trim()).filter(Boolean),
      true,
    ),
    targets: uniqueList(form.targets.split(/\r?\n/).map((value) => value.trim()).filter(Boolean)),
    finding_ids: uniqueList(form.findingIds),
    attachment_ids: uniqueList(form.attachmentIds),
  };
}

function noteSummary(note: EvidenceNote): EvidenceNoteSummary {
  const excerpt = note.markdown
    .replace(/<[^>]*>/g, " ")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^[\s#>*+\-\d.)]+/gm, "")
    .replace(/[`*_~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return {
    id: note.id,
    project_slug: note.project_slug,
    origin: note.origin,
    created_by: note.created_by,
    created_at: note.created_at,
    updated_at: note.updated_at,
    title: note.title,
    excerpt: excerpt.length > 240 ? `${excerpt.slice(0, 237).trim()}...` : excerpt,
    phase: note.phase,
    tags: note.tags,
    target_count: note.targets.length,
    finding_count: note.finding_ids.length,
    attachment_count: note.attachment_ids.length,
    revision: note.revision,
  };
}

function draftSummary(draft: EvidenceDraft): EvidenceDraftSummary {
  const excerpt = noteSummary({
    ...draft,
    id: draft.note_id,
    origin: "human",
    created_by: draft.author,
    revision: {
      id: draft.base_revision_id || "",
      number: 0,
      previous_revision_id: null,
      author: draft.author,
      created_at: draft.updated_at,
    },
  }).excerpt;
  return {
    note_id: draft.note_id,
    project_slug: draft.project_slug,
    version: draft.version,
    base_revision_id: draft.base_revision_id,
    updated_at: draft.updated_at,
    title: draft.title,
    excerpt,
    phase: draft.phase,
    tags: draft.tags,
    attachment_count: draft.attachment_ids.length,
    is_new: draft.base_revision_id === null,
  };
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString("pt-BR");
}

function sortNotes(items: EvidenceNoteSummary[]): EvidenceNoteSummary[] {
  return [...items].sort((left, right) => (
    new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime()
  ));
}

function isFormEqual(left: EvidenceForm | null, right: EvidenceForm): boolean {
  return Boolean(left) && JSON.stringify(left) === JSON.stringify(right);
}

interface PanelPreferences {
  explorerOpen: boolean;
  propertiesOpen: boolean;
  explorerWidth: number;
  propertiesWidth: number;
  leftPanelView: LeftPanelView;
  rightPanelView: RightPanelView;
}

type ResizingPanel = "explorer" | "properties";

function clampPanelWidth(value: unknown, minimum: number, maximum: number, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(maximum, Math.max(minimum, value))
    : fallback;
}

function readPanelPreferences(): PanelPreferences {
  const defaults: PanelPreferences = {
    explorerOpen: true,
    propertiesOpen: true,
    explorerWidth: EXPLORER_DEFAULT_WIDTH,
    propertiesWidth: PROPERTIES_DEFAULT_WIDTH,
    leftPanelView: "explorer",
    rightPanelView: "properties",
  };
  try {
    const stored = window.localStorage.getItem(PANEL_PREFERENCES_KEY);
    if (!stored) return defaults;
    const parsed = JSON.parse(stored) as Partial<PanelPreferences>;
    return {
      explorerOpen: parsed.explorerOpen !== false,
      propertiesOpen: parsed.propertiesOpen !== false,
      explorerWidth: clampPanelWidth(
        parsed.explorerWidth,
        EXPLORER_MIN_WIDTH,
        EXPLORER_MAX_WIDTH,
        EXPLORER_DEFAULT_WIDTH,
      ),
      propertiesWidth: clampPanelWidth(
        parsed.propertiesWidth,
        PROPERTIES_MIN_WIDTH,
        PROPERTIES_MAX_WIDTH,
        PROPERTIES_DEFAULT_WIDTH,
      ),
      leftPanelView: (parsed.leftPanelView === "search" || parsed.leftPanelView === "tree") ? parsed.leftPanelView : "explorer",
      rightPanelView: (
        parsed.rightPanelView === "links"
        || parsed.rightPanelView === "attachments"
        || parsed.rightPanelView === "history"
        || parsed.rightPanelView === "toc"
        || parsed.rightPanelView === "broken_links"
      ) ? parsed.rightPanelView : "properties",
    };
  } catch {
    return defaults;
  }
}

function readPinnedNoteIds(slug: string): string[] {
  try {
    const stored = window.localStorage.getItem(`${PINNED_NOTES_KEY_PREFIX}:${slug}`);
    const parsed = stored ? JSON.parse(stored) : [];
    return Array.isArray(parsed)
      ? uniqueList(parsed.filter((value): value is string => typeof value === "string"))
      : [];
  } catch {
    return [];
  }
}

function readOpenNoteTabs(slug: string): OpenNoteTab[] {
  try {
    const stored = window.localStorage.getItem(`${OPEN_TABS_KEY_PREFIX}:${slug}`);
    const parsed = stored ? JSON.parse(stored) : [];
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    return parsed.flatMap((item): OpenNoteTab[] => {
      if (
        !item
        || typeof item !== "object"
        || typeof item.id !== "string"
        || typeof item.title !== "string"
        || seen.has(item.id)
      ) return [];
      seen.add(item.id);
      return [{ id: item.id, title: item.title || "Nota sem título" }];
    }).slice(0, 12);
  } catch {
    return [];
  }
}

function ShortcutHint({ children }: { children: ReactNode }) {
  return <kbd className="rounded-sm border border-outline-variant/30 bg-surface px-1.5 py-0.5 font-mono text-[10px] text-on-surface-variant">{children}</kbd>;
}

export default function EvidencePanel({
  slug,
  findingRefresh,
  readOnly = false,
  onAdded,
}: {
  slug: string;
  findingRefresh: number;
  readOnly?: boolean;
  onAdded?: () => void;
}) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedToken = searchParams.get("note") || "";
  const query = searchParams.get("q") || "";
  const phaseFilter = searchParams.get("phase") || "all";
  const tagFilter = searchParams.get("tag") || "all";
  const requestedResultType = searchParams.get("type") || "all";
  const resultType: NotebookSearchType = Object.prototype.hasOwnProperty.call(
    searchTypeLabels,
    requestedResultType,
  ) ? requestedResultType as NotebookSearchType : "all";
  const dateFrom = searchParams.get("from") || "";
  const dateTo = searchParams.get("to") || "";
  const searchActive = Boolean(
    query.trim()
    || resultType !== "all"
    || phaseFilter !== "all"
    || tagFilter !== "all"
    || dateFrom
    || dateTo,
  );

  const [notes, setNotes] = useState<EvidenceNoteSummary[]>([]);
  const [drafts, setDrafts] = useState<EvidenceDraftSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loadedCount, setLoadedCount] = useState(0);
  const [listLoading, setListLoading] = useState(true);
  const [listLoadingMore, setListLoadingMore] = useState(false);
  const [listError, setListError] = useState("");
  const [listReload, setListReload] = useState(0);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [findingsError, setFindingsError] = useState("");
  const [searchResults, setSearchResults] = useState<NotebookSearchResult[]>([]);
  const [searchTotal, setSearchTotal] = useState(0);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");

  const [selected, setSelected] = useState<EvidenceNote | null>(null);
  const [draft, setDraft] = useState<EvidenceDraft | null>(null);
  const [form, setForm] = useState<EvidenceForm>(emptyForm);
  const [baseline, setBaseline] = useState<EvidenceForm | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error" | "conflict">("idle");
  const [conflicts, setConflicts] = useState<Set<string>>(new Set());
  const [remoteConflict, setRemoteConflict] = useState<EvidenceNote | null>(null);
  const [revisions, setRevisions] = useState<EvidenceRevision[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [viewedRevision, setViewedRevision] = useState<EvidenceRevision | null>(null);
  const [resolvedReferences, setResolvedReferences] = useState<EvidenceReference[]>([]);
  const [referenceLinks, setReferenceLinks] = useState<EvidenceLinks>({ outgoing: [], backlinks: [] });
  const [linksLoading, setLinksLoading] = useState(false);
  const initialPanelPreferences = useMemo(readPanelPreferences, []);
  const [explorerOpen, setExplorerOpen] = useState(initialPanelPreferences.explorerOpen);
  const [propertiesOpen, setPropertiesOpen] = useState(initialPanelPreferences.propertiesOpen);
  const [explorerWidth, setExplorerWidth] = useState(initialPanelPreferences.explorerWidth);
  const [propertiesWidth, setPropertiesWidth] = useState(initialPanelPreferences.propertiesWidth);
  const [leftPanelView, setLeftPanelView] = useState<LeftPanelView>(
    searchActive ? "search" : initialPanelPreferences.leftPanelView,
  );
  const [rightPanelView, setRightPanelView] = useState<RightPanelView>(initialPanelPreferences.rightPanelView);
  const [pinnedNoteIds, setPinnedNoteIds] = useState<string[]>(() => readPinnedNoteIds(slug));
  const [openNoteTabs, setOpenNoteTabs] = useState<OpenNoteTab[]>(() => readOpenNoteTabs(slug));
  const [quickSwitcherOpen, setQuickSwitcherOpen] = useState(false);
  const [quickSwitcherQuery, setQuickSwitcherQuery] = useState("");
  const [quickSwitcherIndex, setQuickSwitcherIndex] = useState(0);
  const [resizingPanel, setResizingPanel] = useState<ResizingPanel | null>(null);
  const [mobilePane, setMobilePane] = useState<MobilePane>(selectedToken ? "document" : "notes");
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [tableDialogOpen, setTableDialogOpen] = useState(false);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [diffRevision, setDiffRevision] = useState<EvidenceRevision | null>(null);
  const [assetManagerOpen, setAssetManagerOpen] = useState(false);
  const [treeData, setTreeData] = useState<EvidenceTreeNode[]>([]);
  const [treeLoading, setTreeLoading] = useState(false);
  const [brokenLinks, setBrokenLinks] = useState<EvidenceBrokenLink[]>([]);
  const [brokenLinksLoading, setBrokenLinksLoading] = useState(false);
  const [isSectionModalOpen, setIsSectionModalOpen] = useState(false);
  const [sectionParentId, setSectionParentId] = useState<string | null>(null);
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const [movingNode, setMovingNode] = useState<EvidenceTreeNode | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  const searchRef = useRef<HTMLInputElement>(null);
  const quickSwitcherRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const documentRef = useRef<HTMLDivElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const resizeStartRef = useRef({ clientX: 0, width: 0 });
  const pinnedSlugRef = useRef(slug);
  const tabsSlugRef = useRef(slug);

  const dirty = baseline !== null && !isFormEqual(baseline, form);
  const displayedMarkdown = viewedRevision?.markdown ?? form.markdown;
  const tocEntries = useMemo(
    () => extractTocEntries(displayedMarkdown),
    [displayedMarkdown],
  );

  function handleSelectTocEntry(entry: TocEntry) {
    if (documentRef.current) {
      const headings = Array.from(documentRef.current.querySelectorAll("h1, h2, h3"));
      const match = headings.find((h) => (h.textContent || "").toLowerCase().includes(entry.text.toLowerCase()));
      if (match) {
        match.scrollIntoView({ behavior: "smooth", block: "start" });
        match.classList.add("ring-2", "ring-primary", "ring-offset-2");
        setTimeout(() => match.classList.remove("ring-2", "ring-primary", "ring-offset-2"), 1500);
      }
    }
  }

  function insertTextAtCaret(snippet: string) {
    setForm((current) => {
      const md = current.markdown;
      const separator = md.length > 0 && !md.endsWith("\n") ? "\n\n" : "";
      return {
        ...current,
        markdown: `${md}${separator}${snippet}`,
      };
    });
  }

  function handleRestoreRevisionToDraft(rev: EvidenceRevision) {
    setForm((current) => ({
      ...current,
      markdown: rev.markdown,
    }));
    setViewedRevision(null);
  }

  async function handleSearchLinkSuggestions(q: string): Promise<LinkTargetSuggestion[]> {
    const results = await suggestEvidenceReferences(slug, q);
    return results.items.map((item) => ({
      key: item.key,
      label: item.label,
      type: (item.type === "evidence" || item.type === "finding" || item.type === "target" || item.type === "source")
        ? item.type
        : "evidence",
      reference: item.key,
    }));
  }
  const allTags = useMemo(() => Array.from(new Set(notes.flatMap((note) => note.tags)))
    .sort((left, right) => left.localeCompare(right, "pt-BR")), [notes]);
  const unpublishedDrafts = useMemo(() => drafts.filter((item) => (
    item.is_new
    && !notes.some((note) => note.id === item.note_id)
  )), [drafts, notes]);
  const pinnedNotes = useMemo(() => notes.filter((note) => pinnedNoteIds.includes(note.id)), [notes, pinnedNoteIds]);
  const recentNotes = useMemo(() => notes.filter((note) => !pinnedNoteIds.includes(note.id)), [notes, pinnedNoteIds]);
  const quickSwitcherItems = useMemo(() => {
    const byId = new Map<string, { id: string; title: string; context: string }>();
    notes.forEach((note) => byId.set(note.id, {
      id: note.id,
      title: note.title,
      context: `${phaseLabel(note.phase)} · ${note.tags.map((tag) => `#${tag}`).join(" ")}`,
    }));
    drafts.forEach((item) => byId.set(item.note_id, {
      id: item.note_id,
      title: item.title || "Nota sem título",
      context: `${item.is_new ? "Rascunho privado" : "Rascunho"} · ${phaseLabel(item.phase)}`,
    }));
    const needle = quickSwitcherQuery.trim().toLocaleLowerCase("pt-BR");
    return Array.from(byId.values())
      .filter((item) => !needle || `${item.title} ${item.context}`.toLocaleLowerCase("pt-BR").includes(needle))
      .slice(0, 12);
  }, [drafts, notes, quickSwitcherQuery]);

  useEffect(() => {
    try {
      window.localStorage.setItem(PANEL_PREFERENCES_KEY, JSON.stringify({
        explorerOpen,
        propertiesOpen,
        explorerWidth,
        propertiesWidth,
        leftPanelView,
        rightPanelView,
      }));
    } catch {
      // The workspace remains usable when browser storage is unavailable.
    }
  }, [explorerOpen, explorerWidth, leftPanelView, propertiesOpen, propertiesWidth, rightPanelView]);

  useEffect(() => {
    if (pinnedSlugRef.current !== slug) {
      pinnedSlugRef.current = slug;
      setPinnedNoteIds(readPinnedNoteIds(slug));
      return;
    }
    try {
      window.localStorage.setItem(
        `${PINNED_NOTES_KEY_PREFIX}:${slug}`,
        JSON.stringify(pinnedNoteIds),
      );
    } catch {
      // Pinning is an optional local convenience.
    }
  }, [pinnedNoteIds, slug]);

  useEffect(() => {
    if (tabsSlugRef.current !== slug) {
      tabsSlugRef.current = slug;
      setOpenNoteTabs(readOpenNoteTabs(slug));
      return;
    }
    try {
      window.localStorage.setItem(
        `${OPEN_TABS_KEY_PREFIX}:${slug}`,
        JSON.stringify(openNoteTabs),
      );
    } catch {
      // Open tabs remain available for the current session when storage is unavailable.
    }
  }, [openNoteTabs, slug]);

  useEffect(() => {
    if (!selectedToken || selectedToken === NEW_NOTE_TOKEN) return;
    const loadedDraft = draft?.note_id === selectedToken ? draft : null;
    const loadedNote = selected?.id === selectedToken ? selected : null;
    const draftItem = drafts.find((item) => item.note_id === selectedToken);
    const noteItem = notes.find((item) => item.id === selectedToken);
    const title = loadedDraft?.title
      || loadedNote?.title
      || draftItem?.title
      || noteItem?.title
      || "Nota sem título";
    setOpenNoteTabs((current) => {
      const existing = current.find((item) => item.id === selectedToken);
      if (existing?.title === title) return current;
      if (existing) return current.map((item) => item.id === selectedToken ? { ...item, title } : item);
      return [...current, { id: selectedToken, title }].slice(-12);
    });
  }, [draft, drafts, notes, selected, selectedToken]);

  useEffect(() => {
    if (!quickSwitcherOpen) return;
    setQuickSwitcherIndex(0);
    window.requestAnimationFrame(() => quickSwitcherRef.current?.focus());
  }, [quickSwitcherOpen, quickSwitcherQuery]);

  useEffect(() => {
    if (searchActive) setLeftPanelView("search");
  }, [searchActive]);

  useEffect(() => {
    if (!resizingPanel) return undefined;

    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    function handlePointerMove(event: PointerEvent) {
      const delta = event.clientX - resizeStartRef.current.clientX;
      if (resizingPanel === "explorer") {
        setExplorerWidth(clampPanelWidth(
          resizeStartRef.current.width + delta,
          EXPLORER_MIN_WIDTH,
          EXPLORER_MAX_WIDTH,
          EXPLORER_DEFAULT_WIDTH,
        ));
      } else {
        setPropertiesWidth(clampPanelWidth(
          resizeStartRef.current.width - delta,
          PROPERTIES_MIN_WIDTH,
          PROPERTIES_MAX_WIDTH,
          PROPERTIES_DEFAULT_WIDTH,
        ));
      }
    }

    function stopResizing() {
      setResizingPanel(null);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopResizing);
    window.addEventListener("pointercancel", stopResizing);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopResizing);
      window.removeEventListener("pointercancel", stopResizing);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
    };
  }, [resizingPanel]);

  function startPanelResize(event: ReactPointerEvent<HTMLDivElement>, panel: ResizingPanel) {
    event.preventDefault();
    resizeStartRef.current = {
      clientX: event.clientX,
      width: panel === "explorer" ? explorerWidth : propertiesWidth,
    };
    setResizingPanel(panel);
  }

  function resizePanelWithKeyboard(
    event: ReactKeyboardEvent<HTMLDivElement>,
    panel: ResizingPanel,
  ) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const change = event.key === "ArrowRight" ? PANEL_KEYBOARD_STEP : -PANEL_KEYBOARD_STEP;
    if (panel === "explorer") {
      setExplorerWidth((current) => clampPanelWidth(
        current + change,
        EXPLORER_MIN_WIDTH,
        EXPLORER_MAX_WIDTH,
        EXPLORER_DEFAULT_WIDTH,
      ));
    } else {
      setPropertiesWidth((current) => clampPanelWidth(
        current + change,
        PROPERTIES_MIN_WIDTH,
        PROPERTIES_MAX_WIDTH,
        PROPERTIES_DEFAULT_WIDTH,
      ));
    }
  }

  function togglePinnedNote(noteId: string) {
    setPinnedNoteIds((current) => current.includes(noteId)
      ? current.filter((id) => id !== noteId)
      : [...current, noteId]);
  }

  function openQuickSwitcher() {
    setQuickSwitcherQuery("");
    setQuickSwitcherIndex(0);
    setQuickSwitcherOpen(true);
  }

  function chooseQuickSwitcherItem(noteId: string) {
    if (noteId !== selectedToken && !confirmDiscard()) return;
    setQuickSwitcherOpen(false);
    setMobilePane("document");
    if (noteId !== selectedToken) updateLocation("note", noteId, false);
    else focusDocument();
  }

  function closeNoteTab(noteId: string) {
    const index = openNoteTabs.findIndex((item) => item.id === noteId);
    if (index < 0 || (noteId === selectedToken && !confirmDiscard())) return;
    const nextTabs = openNoteTabs.filter((item) => item.id !== noteId);
    setOpenNoteTabs(nextTabs);
    if (noteId !== selectedToken) return;
    const fallback = nextTabs[Math.min(index, nextTabs.length - 1)];
    updateLocation("note", fallback?.id, false);
    if (!fallback) setMobilePane("notes");
  }

  function quickSwitcherKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      setQuickSwitcherOpen(false);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (quickSwitcherItems.length === 0) return;
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setQuickSwitcherIndex((current) => (
        current + direction + quickSwitcherItems.length
      ) % quickSwitcherItems.length);
      return;
    }
    if (event.key === "Enter" && quickSwitcherItems[quickSwitcherIndex]) {
      event.preventDefault();
      chooseQuickSwitcherItem(quickSwitcherItems[quickSwitcherIndex].id);
    }
  }

  function updateLocation(
    key: "note" | "q" | "phase" | "tag" | "type" | "from" | "to",
    value?: string,
    replace = true,
  ) {
    const next = new URLSearchParams(searchParams);
    if (value && value !== "all") next.set(key, value);
    else next.delete(key);
    setSearchParams(next, { replace });
  }

  function clearSearchFilters() {
    const next = new URLSearchParams(searchParams);
    ["q", "phase", "tag", "type", "from", "to"].forEach((key) => next.delete(key));
    setSearchParams(next, { replace: true });
    window.requestAnimationFrame(() => searchRef.current?.focus());
  }

  function confirmDiscard(): boolean {
    return !dirty || window.confirm("Descartar as alterações ainda não confirmadas pelo servidor?");
  }

  function focusDocument() {
    window.requestAnimationFrame(() => {
      documentRef.current?.querySelector<HTMLTextAreaElement>("textarea")?.focus();
    });
  }

  function chooseNote(noteId: string) {
    if (noteId === selectedToken || !confirmDiscard()) return;
    setMobilePane("document");
    updateLocation("note", noteId, false);
  }

  async function startNewNote() {
    if (readOnly) return;
    if (selectedToken === NEW_NOTE_TOKEN) {
      setMobilePane("document");
      titleRef.current?.focus();
      return;
    }
    if (!confirmDiscard() || creating) return;
    setCreating(true);
    setSaveError("");
    try {
      const created = await createEvidenceDraft(slug);
      const next = draftToForm(created);
      setDraft(created);
      setSelected(null);
      setForm(next);
      setBaseline(next);
      setDrafts((current) => [
        draftSummary(created),
        ...current.filter((item) => item.note_id !== created.note_id),
      ]);
      setSaveStatus("saved");
      setMobilePane("document");
      updateLocation("note", created.note_id, false);
      window.requestAnimationFrame(() => titleRef.current?.focus());
    } catch {
      setSaveError("Não foi possível iniciar um novo rascunho.");
    } finally {
      setCreating(false);
    }
  }

  useEffect(() => {
    let active = true;
    setListLoading(true);
    setListError("");
    Promise.all([
      listEvidenceNotes(slug, 0, NOTE_PAGE_SIZE),
      listEvidenceDrafts(slug),
    ])
      .then(([result, draftResult]) => {
        if (!active) return;
        setNotes((current) => sortNotes([
          ...result.items,
          ...current.filter((note) => (
            note.id === selectedToken
            && note.project_slug === slug
            && !result.items.some((loaded) => loaded.id === note.id)
          )),
        ]));
        setTotal(result.total);
        setLoadedCount(result.items.length);
        setDrafts(draftResult.items);
      })
      .catch(() => {
        if (active) setListError("Não foi possível carregar o caderno de evidências.");
      })
      .finally(() => { if (active) setListLoading(false); });
    return () => { active = false; };
  }, [listReload, slug]);

  useEffect(() => {
    let active = true;
    setFindingsError("");
    listFindings(slug, 0, 100)
      .then((result) => { if (active) setFindings(result.items); })
      .catch(() => { if (active) setFindingsError("Não foi possível carregar os findings relacionados."); });
    return () => { active = false; };
  }, [findingRefresh, slug]);

  const loadTree = useCallback(async () => {
    setTreeLoading(true);
    try {
      const res = await getEvidenceTree(slug);
      setTreeData(res.tree);
    } catch {
      // ignore
    } finally {
      setTreeLoading(false);
    }
  }, [slug]);

  const loadBrokenLinks = useCallback(async () => {
    setBrokenLinksLoading(true);
    try {
      const res = await getBrokenEvidenceLinks(slug);
      setBrokenLinks(res.broken_links);
    } catch {
      // ignore
    } finally {
      setBrokenLinksLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    void loadTree();
    void loadBrokenLinks();
  }, [listReload, loadTree, loadBrokenLinks]);

  const handleTogglePin = async (noteId: string, pinned: boolean) => {
    try {
      await pinEvidenceNote(slug, noteId, pinned);
      setListReload((c) => c + 1);
    } catch {
      // ignore
    }
  };

  const handleToggleFavorite = async (noteId: string, favorited: boolean) => {
    try {
      if (favorited) {
        await addEvidenceFavorite(slug, noteId);
      } else {
        await removeEvidenceFavorite(slug, noteId);
      }
      void loadTree();
    } catch {
      // ignore
    }
  };

  const handleCreateSectionSubmit = async (title: string, phase: string, parentId?: string | null) => {
    await createEvidenceSection(slug, { title, phase, parent_id: parentId });
    setListReload((c) => c + 1);
  };

  const handleMoveSubmit = async (nodeId: string, targetParentId: string | null) => {
    await moveEvidenceNote(slug, nodeId, { parent_id: targetParentId });
    setListReload((c) => c + 1);
  };

  const handleCopyNote = async (node: EvidenceTreeNode) => {
    try {
      const copied = await copyEvidenceNote(slug, node.id, {
        new_title: `${node.title} (Cópia)`,
      });
      setListReload((c) => c + 1);
      chooseNote(copied.id);
    } catch {
      // ignore
    }
  };

  const handleImportSubmit = async (filename: string, content: string) => {
    const imported = await importEvidenceNote(slug, {
      filename,
      content,
      parent_id: sectionParentId,
    });
    setListReload((c) => c + 1);
    chooseNote(imported.id);
  };

  const handleExportSingleNote = (noteId: string) => {
    const url = getEvidenceNoteExportUrl(slug, noteId);
    window.open(url, "_blank");
  };

  const handleExportBundle = () => {
    const url = getEvidenceBundleExportUrl(slug);
    window.open(url, "_blank");
  };

  useEffect(() => {
    if (!searchActive) {
      setSearchResults([]);
      setSearchTotal(0);
      setSearchLoading(false);
      setSearchError("");
      return;
    }
    let active = true;
    setSearchLoading(true);
    setSearchError("");
    const timer = window.setTimeout(() => {
      void searchEvidenceNotebook(slug, {
        q: query.trim() || undefined,
        type: resultType,
        phase: phaseFilter === "all" ? undefined : phaseFilter,
        tag: tagFilter === "all" ? undefined : tagFilter,
        dateFrom: dateFrom ? `${dateFrom}T00:00:00.000Z` : undefined,
        dateTo: dateTo ? `${dateTo}T23:59:59.999Z` : undefined,
        limit: 100,
      })
        .then((result) => {
          if (!active) return;
          setSearchResults(result.items);
          setSearchTotal(result.total);
        })
        .catch(() => {
          if (active) setSearchError("Não foi possível pesquisar o caderno.");
        })
        .finally(() => { if (active) setSearchLoading(false); });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [dateFrom, dateTo, phaseFilter, query, resultType, searchActive, slug, tagFilter]);

  useEffect(() => {
    if (!selectedToken || selectedToken === NEW_NOTE_TOKEN) {
      setResolvedReferences([]);
      return;
    }
    let active = true;
    const timer = window.setTimeout(() => {
      void resolveEvidenceReferences(slug, displayedMarkdown)
        .then((result) => { if (active) setResolvedReferences(result.items); })
        .catch(() => { if (active) setResolvedReferences([]); });
    }, 180);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [displayedMarkdown, selectedToken, slug]);

  useEffect(() => {
    if (!selected?.id) {
      setReferenceLinks({ outgoing: [], backlinks: [] });
      setLinksLoading(false);
      return;
    }
    let active = true;
    setLinksLoading(true);
    void getEvidenceLinks(slug, selected.id, viewedRevision?.id)
      .then((result) => { if (active) setReferenceLinks(result); })
      .catch(() => { if (active) setReferenceLinks({ outgoing: [], backlinks: [] }); })
      .finally(() => { if (active) setLinksLoading(false); });
    return () => { active = false; };
  }, [selected?.id, selected?.revision.id, slug, viewedRevision?.id]);

  const searchReferences = useCallback(async (referenceQuery: string) => {
    const result = await suggestEvidenceReferences(slug, referenceQuery);
    return result.items
      .filter((item) => item.reference && !item.broken)
      .map((item) => ({
        key: item.key,
        label: item.label,
        reference: item.reference as string,
        type: searchTypeLabels[item.type],
        excerpt: item.excerpt,
      }));
  }, [slug]);

  useEffect(() => {
    setSaveError("");
    setDetailError("");
    setRemoteConflict(null);
    setViewedRevision(null);
    setResolvedReferences([]);
    setReferenceLinks({ outgoing: [], backlinks: [] });
    if (!selectedToken) {
      setDetailLoading(false);
      setSelected(null);
      setDraft(null);
      setBaseline(null);
      setForm(emptyForm());
      setRevisions([]);
      setSaveStatus("idle");
      return;
    }
    if (selectedToken === NEW_NOTE_TOKEN) {
      setDetailLoading(true);
      return;
    }
    let active = true;
    setDetailLoading(true);
    Promise.allSettled([
      getEvidenceNote(slug, selectedToken),
      getEvidenceDraft(slug, selectedToken),
    ])
      .then(([noteResult, draftResult]) => {
        if (!active) return;
        const note = noteResult.status === "fulfilled" ? noteResult.value : null;
        const privateDraft = draftResult.status === "fulfilled" ? draftResult.value : null;
        if (!note && !privateDraft) {
          const reasons = [noteResult, draftResult]
            .filter((result) => result.status === "rejected")
            .map((result) => result.status === "rejected" && result.reason instanceof Error
              ? result.reason.message
              : "");
          setSelected(null);
          setDraft(null);
          setBaseline(null);
          setDetailError(reasons.every((reason) => reason.includes("not_found"))
            ? "Esta nota não existe mais ou não está acessível."
            : "Não foi possível abrir esta nota.");
          return;
        }
        const next = privateDraft ? draftToForm(privateDraft) : noteToForm(note as EvidenceNote);
        setSelected(note);
        setDraft(privateDraft);
        setForm(next);
        setBaseline(next);
        setSaveStatus(privateDraft ? "saved" : "idle");
        if (privateDraft) {
          setDrafts((current) => [
            draftSummary(privateDraft),
            ...current.filter((item) => item.note_id !== privateDraft.note_id),
          ]);
        }
        if (note) {
          setNotes((current) => current.some((item) => item.id === note.id)
            ? current
            : sortNotes([noteSummary(note), ...current]));
          if (privateDraft && privateDraft.base_revision_id !== note.revision.id) {
            setConflicts((current) => new Set(current).add(note.id));
            setRemoteConflict(note);
            setSaveStatus("conflict");
          }
        }
      })
      .finally(() => { if (active) setDetailLoading(false); });
    return () => { active = false; };
  }, [selectedToken, slug]);

  useEffect(() => {
    if (!selected?.id) {
      setRevisions([]);
      return;
    }
    let active = true;
    setHistoryLoading(true);
    listEvidenceRevisions(slug, selected.id)
      .then((result) => { if (active) setRevisions(result.items); })
      .catch(() => { if (active) setRevisions([]); })
      .finally(() => { if (active) setHistoryLoading(false); });
    return () => { active = false; };
  }, [selected?.id, selected?.revision.id, slug]);

  useEffect(() => {
    function warnBeforeUnload(event: BeforeUnloadEvent) {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [dirty]);

  async function loadMore() {
    setListLoadingMore(true);
    setListError("");
    try {
      const result = await listEvidenceNotes(slug, loadedCount, NOTE_PAGE_SIZE);
      setNotes((current) => sortNotes([
        ...current,
        ...result.items.filter((note) => !current.some((existing) => existing.id === note.id)),
      ]));
      setTotal(result.total);
      setLoadedCount((current) => current + result.items.length);
    } catch {
      setListError("Não foi possível carregar mais notas.");
    } finally {
      setListLoadingMore(false);
    }
  }

  const saveDraftNow = useCallback(async (force = false): Promise<EvidenceDraft | null> => {
    if (readOnly || !selectedToken || selectedToken === NEW_NOTE_TOKEN || saving || (publishing && !force)) return draft;
    if (!dirty && !force) return draft;
    const submitted = form;
    const payload = formPayload(submitted);
    const baseRevisionId = draft?.base_revision_id ?? selected?.revision.id ?? null;
    setSaving(true);
    setSaveStatus("saving");
    setSaveError("");
    try {
      const saved = await saveEvidenceDraft(
        slug,
        selectedToken,
        baseRevisionId,
        draft?.version ?? 0,
        payload,
      );
      setDraft(saved);
      setBaseline(submitted);
      setDrafts((current) => [
        draftSummary(saved),
        ...current.filter((item) => item.note_id !== saved.note_id),
      ]);
      setSaveStatus("saved");
      setConflicts((current) => {
        const next = new Set(current);
        next.delete(saved.note_id);
        return next;
      });
      return saved;
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : "";
      if (reason === "evidence_draft_conflict") {
        setConflicts((current) => new Set(current).add(selectedToken));
        setSaveStatus("conflict");
        setSaveError("A revisão publicada mudou. Seu texto local e o último rascunho confirmado foram preservados.");
        try {
          setRemoteConflict(await getEvidenceNote(slug, selectedToken));
        } catch {
          setRemoteConflict(null);
        }
      } else if (reason === "evidence_draft_changed_retry") {
        setSaveStatus("error");
        setSaveError("O rascunho mudou em outra aba. Reabra a nota antes de continuar.");
      } else if (reason === "finding_not_in_project") {
        setSaveStatus("error");
        setSaveError("Um finding selecionado não pertence mais a este engagement.");
      } else {
        setSaveStatus("error");
        setSaveError("Falha no autosave. O conteúdo continua no editor; tente salvar novamente.");
      }
      throw cause;
    } finally {
      setSaving(false);
    }
  }, [dirty, draft, form, publishing, readOnly, saving, selected, selectedToken, slug]);

  useEffect(() => {
    if (readOnly || !dirty || saving || publishing || uploading || conflicts.has(selectedToken) || viewedRevision) return;
    const timer = window.setTimeout(() => {
      void saveDraftNow().catch(() => undefined);
    }, 900);
    return () => window.clearTimeout(timer);
  }, [conflicts, dirty, publishing, readOnly, saveDraftNow, saving, selectedToken, uploading, viewedRevision]);

  async function publishDraft() {
    if (readOnly || !selectedToken || publishing || saving) return;
    if (!form.title.trim()) {
      setSaveError("Informe um título antes de publicar a nota.");
      titleRef.current?.focus();
      return;
    }
    setPublishing(true);
    setSaveError("");
    try {
      const ready = dirty || !draft ? await saveDraftNow(true) : draft;
      if (!ready) throw new Error("evidence_draft_not_found");
      const published = await publishEvidenceDraft(slug, selectedToken, ready.version);
      const next = noteToForm(published);
      const wasNew = selected === null;
      setSelected(published);
      setDraft(null);
      setForm(next);
      setBaseline(next);
      setDrafts((current) => current.filter((item) => item.note_id !== published.id));
      setNotes((current) => sortNotes([
        noteSummary(published),
        ...current.filter((item) => item.id !== published.id),
      ]));
      if (wasNew) {
        setTotal((current) => current + 1);
        setLoadedCount((current) => current + 1);
      }
      setSaveStatus("idle");
      setRemoteConflict(null);
      setConflicts((current) => {
        const nextConflicts = new Set(current);
        nextConflicts.delete(published.id);
        return nextConflicts;
      });
      onAdded?.();
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : "";
      if (reason === "evidence_draft_conflict") {
        setConflicts((current) => new Set(current).add(selectedToken));
        setSaveStatus("conflict");
        setSaveError("Outra revisão foi publicada antes desta. Compare as versões para decidir como continuar.");
        try {
          setRemoteConflict(await getEvidenceNote(slug, selectedToken));
        } catch {
          setRemoteConflict(null);
        }
      } else if (
        reason.includes("reference_not_in_project")
        || reason.startsWith("invalid_reference")
        || reason === "too_many_evidence_references"
      ) {
        setSaveError("Revise as referências internas: uma delas não existe neste engagement ou está incompleta.");
      } else if (!saveError) {
        setSaveError("Não foi possível publicar. O rascunho continua privado e preservado.");
      }
    } finally {
      setPublishing(false);
    }
  }

  async function discardDraftAndReload() {
    if (readOnly) return;
    if (!draft || !window.confirm("Descartar este rascunho privado? Anexos ainda não publicados também serão removidos.")) return;
    setDetailLoading(true);
    try {
      await discardEvidenceDraft(slug, draft.note_id);
      setDrafts((current) => current.filter((item) => item.note_id !== draft.note_id));
      setDraft(null);
      setRemoteConflict(null);
      setConflicts((current) => {
        const next = new Set(current);
        next.delete(draft.note_id);
        return next;
      });
      if (selected) {
        const remote = await getEvidenceNote(slug, selected.id);
        const next = noteToForm(remote);
        setSelected(remote);
        setForm(next);
        setBaseline(next);
        setNotes((current) => sortNotes([noteSummary(remote), ...current.filter((item) => item.id !== remote.id)]));
      } else {
        setForm(emptyForm());
        setBaseline(null);
        updateLocation("note");
      }
      setSaveStatus("idle");
    } catch {
      setSaveError("Não foi possível descartar o rascunho.");
    } finally {
      setDetailLoading(false);
    }
  }

  async function reapplyDraft() {
    if (readOnly || !draft || !remoteConflict) return;
    setSaving(true);
    try {
      const rebased = await rebaseEvidenceDraft(
        slug,
        draft.note_id,
        draft.version,
        remoteConflict.revision.id,
      );
      setDraft(rebased);
      setBaseline(draftToForm(rebased));
      setSelected(remoteConflict);
      setRemoteConflict(null);
      setConflicts((current) => {
        const next = new Set(current);
        next.delete(rebased.note_id);
        return next;
      });
      setSaveStatus("saved");
      setSaveError("");
    } catch {
      setSaveError("A revisão remota mudou novamente. Atualize a comparação antes de reaplicar.");
    } finally {
      setSaving(false);
    }
  }

  async function copyDraftMarkdown() {
    try {
      await navigator.clipboard.writeText(form.markdown);
      setSaveError("");
    } catch {
      setSaveError("Não foi possível copiar o Markdown para a área de transferência.");
    }
  }

  async function uploadAttachments(files: File[]) {
    if (readOnly || !selectedToken || !files.length || uploading) return;
    setUploading(true);
    setSaveError("");
    try {
      const ready = dirty || !draft ? await saveDraftNow(true) : draft;
      if (!ready) throw new Error("evidence_draft_not_found");
      const uploaded = await uploadEvidenceDraftAttachments(
        slug,
        selectedToken,
        ready.version,
        files,
      );
      const nextBaseline = draftToForm(uploaded);
      setDraft(uploaded);
      setBaseline(nextBaseline);
      setForm((current) => ({ ...current, attachmentIds: uploaded.attachment_ids }));
      setDrafts((current) => [draftSummary(uploaded), ...current.filter((item) => item.note_id !== uploaded.note_id)]);
      setSaveStatus("saved");
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : "";
      setSaveError(reason === "evidence_file_too_large"
        ? "Um dos arquivos excede o limite permitido."
        : "Não foi possível enviar os anexos. O rascunho foi preservado.");
    } finally {
      setUploading(false);
      if (uploadRef.current) uploadRef.current.value = "";
    }
  }

  async function removeDraftAttachment(attachmentId: string) {
    if (readOnly || !draft || uploading) return;
    setUploading(true);
    try {
      const ready = dirty ? await saveDraftNow(true) : draft;
      if (!ready) throw new Error("evidence_draft_not_found");
      const updated = await deleteEvidenceDraftAttachment(slug, ready.note_id, attachmentId);
      const next = draftToForm(updated);
      setDraft(updated);
      setForm(next);
      setBaseline(next);
      setDrafts((current) => [draftSummary(updated), ...current.filter((item) => item.note_id !== updated.note_id)]);
    } catch {
      setSaveError("Não foi possível excluir o anexo do rascunho.");
    } finally {
      setUploading(false);
    }
  }

  function insertAttachmentReference(attachment: EvidenceAttachment, asImage: boolean) {
    const url = evidenceAttachmentDownloadUrl(slug, selectedToken, attachment.id, asImage);
    const reference = asImage
      ? `![${attachment.filename}](${url})`
      : `[${attachment.filename}](${url})`;
    setViewedRevision(null);
    setForm((current) => ({
      ...current,
      markdown: `${current.markdown}${current.markdown.trim() ? "\n\n" : ""}${reference}`,
    }));
    focusDocument();
  }

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if (event.defaultPrevented || !(event.metaKey || event.ctrlKey)) return;
      const key = event.key.toLocaleLowerCase("pt-BR");
      if (key === "n" && !readOnly) {
        event.preventDefault();
        void startNewNote();
      } else if (key === "k") {
        event.preventDefault();
        setLeftPanelView("search");
        setMobilePane("notes");
        window.requestAnimationFrame(() => searchRef.current?.focus());
      } else if (key === "o") {
        event.preventDefault();
        openQuickSwitcher();
      } else if (key === "p" && event.shiftKey) {
        event.preventDefault();
        setPropertiesOpen((current) => {
          const next = !current;
          if (next) setMobilePane("properties");
          else focusDocument();
          return next;
        });
      } else if (key === "s" && !readOnly && selectedToken && dirty) {
        event.preventDefault();
        void saveDraftNow().catch(() => undefined);
      } else if (key === "/" || event.key === "?") {
        event.preventDefault();
        setShortcutsOpen((current) => !current);
      }
    }
    function handleAltShortcut(event: KeyboardEvent) {
      if (event.defaultPrevented || !event.altKey || event.ctrlKey || event.metaKey) return;
      if (/^[1-9]$/.test(event.key)) {
        const tabIndex = parseInt(event.key, 10) - 1;
        if (tabIndex < openNoteTabs.length) {
          event.preventDefault();
          chooseNote(openNoteTabs[tabIndex].id);
        }
      } else if (event.key.toLowerCase() === "w" && selectedToken) {
        event.preventDefault();
        closeNoteTab(selectedToken);
      }
    }
    window.addEventListener("keydown", handleShortcut);
    window.addEventListener("keydown", handleAltShortcut);
    return () => {
      window.removeEventListener("keydown", handleShortcut);
      window.removeEventListener("keydown", handleAltShortcut);
    };
  }, [closeNoteTab, dirty, openNoteTabs, readOnly, saveDraftNow, selectedToken]);

  function openSearchResult(result: NotebookSearchResult) {
    if (result.type === "evidence" || result.type === "draft") {
      chooseNote(result.id);
      return;
    }
    if (result.href && confirmDiscard()) navigate(result.href);
  }

  function openReference(href: string | null) {
    if (href && confirmDiscard()) navigate(href);
  }

  const visibleAttachments = draft?.attachments ?? selected?.attachments ?? [];
  const saveStatusText = saveStatus === "saving"
    ? "Salvando rascunho..."
    : saveStatus === "saved"
      ? "Rascunho salvo"
      : saveStatus === "error"
        ? "Erro no autosave"
        : saveStatus === "conflict"
          ? "Conflito com revisão publicada"
          : draft
            ? "Rascunho privado"
            : "Sem rascunho";

  function renderDraftRows(items: EvidenceDraftSummary[]) {
    return (
      <ul className="divide-y divide-outline-variant/20" aria-label="Rascunhos ainda não publicados">
        {items.map((item) => (
          <li key={item.note_id}>
            <button
              type="button"
              aria-current={selectedToken === item.note_id ? "page" : undefined}
              className={`w-full border-l-2 p-3 text-left transition focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-primary ${selectedToken === item.note_id ? "border-l-primary bg-primary/10" : "border-l-warning bg-warning/5 hover:bg-warning/10"}`}
              onClick={() => chooseNote(item.note_id)}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-semibold text-on-surface">{item.title || "Nota sem título"}</span>
                <span className="badge badge-warning">Rascunho privado</span>
              </span>
              {item.excerpt && <span className="mt-1 line-clamp-2 block text-xs text-on-surface-variant">{item.excerpt}</span>}
              <span className="mt-2 block text-[11px] text-on-surface-variant">Ainda não publicado · salvo em {formatDate(item.updated_at)}</span>
            </button>
          </li>
        ))}
      </ul>
    );
  }

  function renderNoteRows(items: EvidenceNoteSummary[], label: string) {
    return (
      <ul className="divide-y divide-outline-variant/20" aria-label={label}>
        {items.map((note) => {
          const active = selectedToken === note.id;
          const conflicted = conflicts.has(note.id);
          const hasDraft = drafts.some((item) => item.note_id === note.id);
          const pinned = pinnedNoteIds.includes(note.id);
          const titleId = `evidence-note-title-${note.id}`;
          return (
            <li key={note.id} className="relative">
              <button
                type="button"
                aria-current={active ? "page" : undefined}
                onClick={() => chooseNote(note.id)}
                className={`w-full border-l-2 p-3 pr-10 text-left transition focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-primary ${active ? "border-l-primary bg-primary/10" : "border-l-transparent bg-transparent hover:bg-surface-container"}`}
              >
                <span className="flex items-start justify-between gap-2">
                  <span id={titleId} className="min-w-0 flex-1 truncate text-sm font-semibold text-on-surface">{note.title}</span>
                  {(conflicted || hasDraft) && (
                    <span className="badge badge-warning shrink-0">{conflicted ? "Conflito" : "Rascunho privado"}</span>
                  )}
                </span>
                {note.excerpt && <span className="mt-1 line-clamp-2 block text-xs leading-5 text-on-surface-variant">{note.excerpt}</span>}
                <span className="mt-2 block text-[11px] text-on-surface-variant">
                  {phaseLabel(note.phase)} · {note.revision.author} · rev. {note.revision.number}
                </span>
                <span className="mt-1 block text-[11px] text-on-surface-variant">Atualizada em {formatDate(note.updated_at)}</span>
                {note.tags.length > 0 && (
                  <span className="mt-2 flex flex-wrap gap-1">
                    {note.tags.slice(0, 4).map((tag) => <span key={tag} className="rounded-sm bg-surface-container-high px-1.5 py-0.5 text-[10px] text-on-surface-variant">#{tag}</span>)}
                    {note.tags.length > 4 && <span className="text-[10px] text-on-surface-variant">+{note.tags.length - 4}</span>}
                  </span>
                )}
              </button>
              <button
                type="button"
                aria-label={pinned ? "Desafixar nota" : "Fixar nota"}
                aria-describedby={titleId}
                aria-pressed={pinned}
                title={pinned ? "Remover dos fixados" : "Adicionar aos fixados"}
                className={`absolute bottom-2 right-2 rounded-sm p-1.5 focus-visible:outline-2 focus-visible:outline-primary ${pinned ? "text-primary" : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"}`}
                onClick={() => togglePinnedNote(note.id)}
              >
                <Star className={`h-3.5 w-3.5 ${pinned ? "fill-current" : ""}`} />
              </button>
            </li>
          );
        })}
      </ul>
    );
  }

  const noteList = (
    <aside className={`${mobilePane === "notes" ? "flex" : "hidden"} relative min-h-[34rem] flex-col border-r border-outline-variant/20 bg-surface-container-low/60 ${explorerOpen ? "lg:flex" : "lg:hidden"} lg:min-h-0`} aria-label="Navegação das notas">
      <div className="space-y-3 border-b border-outline-variant/20 p-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Caderno de evidências</p>
            <p className="mt-1 text-xs text-on-surface-variant">
              {total} publicada{total === 1 ? "" : "s"} · {drafts.length} rascunho{drafts.length === 1 ? "" : "s"} privado{drafts.length === 1 ? "" : "s"}
            </p>
          </div>
          {!readOnly && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="btn btn-primary px-2.5 py-1 text-xs"
                disabled={creating}
                onClick={() => void startNewNote()}
                title="Nova nota (Ctrl+N)"
              >
                {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Nova
              </button>
              <button
                type="button"
                className="btn btn-outline px-2 py-1 text-xs"
                onClick={() => {
                  setSectionParentId(null);
                  setIsSectionModalOpen(true);
                }}
                title="Nova pasta / seção"
              >
                <Folder className="h-3.5 w-3.5 text-amber-400" />
              </button>
              <button
                type="button"
                className="btn btn-outline px-2 py-1 text-xs"
                onClick={() => setIsImportModalOpen(true)}
                title="Importar Markdown (.md)"
              >
                <Upload className="h-3.5 w-3.5 text-primary" />
              </button>
              <button
                type="button"
                className="btn btn-outline px-2 py-1 text-xs"
                onClick={handleExportBundle}
                title="Exportar Caderno completo (.zip)"
              >
                <Download className="h-3.5 w-3.5 text-slate-300" />
              </button>
            </div>
          )}
          <button
            type="button"
            className="hidden rounded-sm p-2 text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface focus-visible:outline-2 focus-visible:outline-primary lg:inline-flex"
            aria-label="Fechar explorador"
            title="Fechar explorador"
            onClick={() => {
              setExplorerOpen(false);
              focusDocument();
            }}
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-3 rounded-sm bg-surface p-1" role="tablist" aria-label="Modo do painel esquerdo">
          <button
            type="button"
            role="tab"
            aria-selected={leftPanelView === "tree"}
            className={`inline-flex items-center justify-center gap-1.5 rounded-sm px-2 py-1.5 text-xs font-bold focus-visible:outline-2 focus-visible:outline-primary ${leftPanelView === "tree" ? "bg-surface-container-high text-on-surface" : "text-on-surface-variant hover:text-on-surface"}`}
            onClick={() => setLeftPanelView("tree")}
          >
            <Folder className="h-3.5 w-3.5 text-amber-400" /> Árvore
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={leftPanelView === "explorer"}
            className={`inline-flex items-center justify-center gap-1.5 rounded-sm px-2 py-1.5 text-xs font-bold focus-visible:outline-2 focus-visible:outline-primary ${leftPanelView === "explorer" ? "bg-surface-container-high text-on-surface" : "text-on-surface-variant hover:text-on-surface"}`}
            onClick={() => setLeftPanelView("explorer")}
          >
            <BookOpen className="h-3.5 w-3.5" /> Explorar
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={leftPanelView === "search"}
            className={`inline-flex items-center justify-center gap-1.5 rounded-sm px-2 py-1.5 text-xs font-bold focus-visible:outline-2 focus-visible:outline-primary ${leftPanelView === "search" ? "bg-surface-container-high text-on-surface" : "text-on-surface-variant hover:text-on-surface"}`}
            onClick={() => {
              setLeftPanelView("search");
              window.requestAnimationFrame(() => searchRef.current?.focus());
            }}
          >
            <Search className="h-3.5 w-3.5" /> Buscar
          </button>
        </div>

        {leftPanelView === "search" && (
          <>
            <label className="relative block">
              <span className="sr-only">Buscar notas</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant" />
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(event) => updateLocation("q", event.target.value)}
                placeholder="Buscar notas, findings, fontes e alvos"
                className="w-full rounded-sm border border-outline-variant/30 bg-surface py-2 pl-9 pr-3 text-sm text-on-surface focus-visible:outline-2 focus-visible:outline-primary"
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label>
                <span className="sr-only">Filtrar notas por fase</span>
                <select value={phaseFilter} onChange={(event) => updateLocation("phase", event.target.value)} className="w-full rounded-sm border border-outline-variant/30 bg-surface px-2 py-2 text-xs text-on-surface">
                  <option value="all">Todas as fases</option>
                  {ptesPhases.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </select>
              </label>
              <label>
                <span className="sr-only">Filtrar por tipo</span>
                <select value={resultType} onChange={(event) => updateLocation("type", event.target.value)} className="w-full rounded-sm border border-outline-variant/30 bg-surface px-2 py-2 text-xs text-on-surface">
                  {Object.entries(searchTypeLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </select>
              </label>
              <label>
                <span className="sr-only">Filtrar notas por tag</span>
                <select value={tagFilter} onChange={(event) => updateLocation("tag", event.target.value)} className="w-full rounded-sm border border-outline-variant/30 bg-surface px-2 py-2 text-xs text-on-surface">
                  <option value="all">Todas as tags</option>
                  {tagFilter !== "all" && !allTags.includes(tagFilter) && <option value={tagFilter}>{tagFilter}</option>}
                  {allTags.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
                </select>
              </label>
              <label className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
                Desde
                <input type="date" value={dateFrom} onChange={(event) => updateLocation("from", event.target.value)} className="mt-1 w-full rounded-sm border border-outline-variant/30 bg-surface px-2 py-1.5 text-xs font-normal normal-case tracking-normal text-on-surface" />
              </label>
              <label className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
                Até
                <input type="date" value={dateTo} onChange={(event) => updateLocation("to", event.target.value)} className="mt-1 w-full rounded-sm border border-outline-variant/30 bg-surface px-2 py-1.5 text-xs font-normal normal-case tracking-normal text-on-surface" />
              </label>
              {searchActive && (
                <button type="button" className="rounded-sm px-2 py-1.5 text-xs font-bold text-primary hover:bg-primary/10" onClick={clearSearchFilters}>Limpar filtros</button>
              )}
            </div>
          </>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {leftPanelView === "tree" ? (
          <EvidenceTreeView
            tree={treeData}
            selectedNoteId={selectedToken}
            onSelectNote={(noteId) => chooseNote(noteId)}
            onCreateNote={(parentId) => {
              setSectionParentId(parentId ?? null);
              void startNewNote();
            }}
            onCreateSection={(parentId) => {
              setSectionParentId(parentId ?? null);
              setIsSectionModalOpen(true);
            }}
            onTogglePin={handleTogglePin}
            onToggleFavorite={handleToggleFavorite}
            onMoveNote={(node) => {
              setMovingNode(node);
              setIsMoveModalOpen(true);
            }}
            onCopyNote={handleCopyNote}
            onExportNote={handleExportSingleNote}
          />
        ) : leftPanelView === "search" ? (
          !searchActive ? (
            <div className="p-5 text-center">
              <Search className="mx-auto h-6 w-6 text-on-surface-variant" />
              <p className="mt-3 text-sm font-semibold text-on-surface">Busque no engagement</p>
              <p className="mt-1 text-xs leading-5 text-on-surface-variant">Notas, rascunhos, findings, fontes e alvos aparecem juntos, identificados pelo tipo.</p>
            </div>
          ) : searchLoading ? (
            <p className="flex items-center gap-2 p-3 text-sm text-on-surface-variant"><Loader2 className="h-4 w-4 animate-spin" /> Pesquisando o engagement...</p>
          ) : searchError ? (
            <p className="p-3 text-sm text-error" role="alert">{searchError}</p>
          ) : searchResults.length === 0 ? (
            <div className="p-4 text-center">
              <Search className="mx-auto h-6 w-6 text-on-surface-variant" />
              <p className="mt-3 text-sm font-semibold text-on-surface">Nenhum resultado encontrado</p>
              <p className="mt-1 text-xs text-on-surface-variant">Ajuste o termo, o tipo, a fase ou o período.</p>
            </div>
          ) : (
            <>
              <p className="border-b border-outline-variant/20 px-3 py-2 text-[11px] text-on-surface-variant">{searchTotal} resultado{searchTotal === 1 ? "" : "s"} no engagement</p>
              <ul className="divide-y divide-outline-variant/20" aria-label="Resultados da pesquisa">
                {searchResults.map((result) => (
                  <li key={`${result.type}-${result.id}`}>
                    <button type="button" className="w-full border-l-2 border-l-transparent bg-transparent p-3 text-left transition hover:bg-surface-container focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-primary" onClick={() => openSearchResult(result)}>
                      <span className="flex items-start justify-between gap-2">
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-on-surface">{result.label}</span>
                        <span className={`badge shrink-0 ${result.private ? "badge-warning" : "badge-neutral"}`}>{result.private ? "Rascunho privado" : searchTypeLabels[result.type]}</span>
                      </span>
                      {result.excerpt && <span className="mt-1 line-clamp-2 block text-xs leading-5 text-on-surface-variant">{result.excerpt}</span>}
                      <span className="mt-2 block text-[11px] text-on-surface-variant">{result.phase ? `${phaseLabel(result.phase)} · ` : ""}{formatDate(result.updated_at)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )
        ) : listLoading ? (
          <p className="flex items-center gap-2 p-3 text-sm text-on-surface-variant"><Loader2 className="h-4 w-4 animate-spin" /> Carregando notas...</p>
        ) : listError && notes.length === 0 ? (
          <div className="p-3 text-sm">
            <p className="text-error" role="alert">{listError}</p>
            <button type="button" className="mt-3 font-semibold text-primary hover:underline" onClick={() => setListReload((value) => value + 1)}>Tentar novamente</button>
          </div>
        ) : notes.length === 0 && unpublishedDrafts.length === 0 ? (
          <div className="p-4 text-center">
            <BookOpen className="mx-auto h-6 w-6 text-on-surface-variant" />
            <p className="mt-3 text-sm font-semibold text-on-surface">Nenhuma nota publicada</p>
            <p className="mt-1 text-xs text-on-surface-variant">Crie a primeira nota do engagement.</p>
          </div>
        ) : (
          <>
            {unpublishedDrafts.length > 0 && (
              <section className="border-b border-outline-variant/20" aria-labelledby="evidence-private-drafts">
                <p id="evidence-private-drafts" className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Rascunhos privados · {unpublishedDrafts.length}</p>
                {renderDraftRows(unpublishedDrafts)}
              </section>
            )}
            {pinnedNotes.length > 0 && (
              <section className="border-b border-outline-variant/20" aria-labelledby="evidence-pinned-notes">
                <p id="evidence-pinned-notes" className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Fixadas · {pinnedNotes.length}</p>
                {renderNoteRows(pinnedNotes, "Notas fixadas")}
              </section>
            )}
            {recentNotes.length > 0 && (
              <section aria-labelledby="evidence-recent-notes">
                <p id="evidence-recent-notes" className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Recentes</p>
                {renderNoteRows(recentNotes, "Notas recentes")}
              </section>
            )}
            {listError && notes.length > 0 && <p className="p-3 text-xs text-error" role="alert">{listError}</p>}
            {notes.length < total && (
              <button type="button" className="w-full rounded-sm px-3 py-2 text-xs font-bold text-primary hover:bg-primary/10" disabled={listLoadingMore} onClick={() => void loadMore()}>
                {listLoadingMore ? "Carregando..." : `Carregar mais · ${notes.length} de ${total}`}
              </button>
            )}
          </>
        )}
      </div>
      <div className="hidden border-t border-outline-variant/20 px-3 py-2 text-[10px] text-on-surface-variant xl:flex xl:flex-wrap xl:gap-2">
        <ShortcutHint>Ctrl+N</ShortcutHint> nova <ShortcutHint>Ctrl+K</ShortcutHint> busca <ShortcutHint>Ctrl+O</ShortcutHint> abrir
      </div>
      <div
        role="separator"
        aria-label="Redimensionar explorador"
        aria-orientation="vertical"
        aria-valuemin={EXPLORER_MIN_WIDTH}
        aria-valuemax={EXPLORER_MAX_WIDTH}
        aria-valuenow={Math.round(explorerWidth)}
        aria-valuetext={`${Math.round(explorerWidth)} pixels de largura`}
        tabIndex={0}
        className={`group absolute inset-y-0 -right-1 z-20 hidden w-2 cursor-col-resize touch-none focus-visible:outline-2 focus-visible:outline-primary lg:block ${resizingPanel === "explorer" ? "bg-primary/10" : ""}`}
        onPointerDown={(event) => startPanelResize(event, "explorer")}
        onKeyDown={(event) => resizePanelWithKeyboard(event, "explorer")}
      >
        <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-transparent transition group-hover:bg-primary/50 group-focus-visible:bg-primary" />
      </div>
    </aside>
  );

  const documentTabs = openNoteTabs.length > 0 && (
    <div className="hidden min-w-0 items-stretch border-b border-outline-variant/20 bg-surface-container-low lg:flex">
      <div className="flex min-w-0 flex-1 overflow-x-auto" role="tablist" aria-label="Documentos abertos">
        {openNoteTabs.map((tab) => {
          const active = tab.id === selectedToken;
          return (
            <div key={tab.id} className={`flex max-w-60 shrink-0 items-center border-r border-outline-variant/20 ${active ? "bg-surface" : "bg-transparent"}`}>
              <button
                type="button"
                role="tab"
                aria-selected={active}
                className={`flex min-w-0 items-center gap-2 px-3 py-2 text-xs focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-primary ${active ? "font-bold text-on-surface" : "text-on-surface-variant hover:text-on-surface"}`}
                onClick={() => chooseNote(tab.id)}
              >
                {active && dirty && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-warning" title="Alterações locais" />}
                <span className="truncate">{tab.title}</span>
              </button>
              <button
                type="button"
                className="mr-1 rounded-sm p-1 text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface focus-visible:outline-2 focus-visible:outline-primary"
                aria-label={`Fechar aba ${tab.title}`}
                onClick={() => closeNoteTab(tab.id)}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          );
        })}
      </div>
      <button
        type="button"
        className="inline-flex shrink-0 items-center gap-1.5 border-l border-outline-variant/20 px-3 text-xs font-semibold text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface focus-visible:outline-2 focus-visible:outline-primary"
        onClick={openQuickSwitcher}
        title="Alternador rápido (Ctrl+O)"
      >
        <ChevronsUpDown className="h-3.5 w-3.5" /> Abrir
      </button>
    </div>
  );

  const documentPanel = (
    <main ref={documentRef} className={`${mobilePane === "document" ? "flex" : "hidden"} relative min-w-0 flex-col bg-surface lg:flex`} aria-label="Documento da evidência">
      {documentTabs}
      {!explorerOpen && (!selectedToken || detailLoading || detailError) && (
        <button
          type="button"
          className="btn btn-ghost absolute left-3 top-3 z-10 hidden px-2 lg:inline-flex"
          aria-label="Abrir explorador"
          title="Abrir explorador"
          onClick={() => setExplorerOpen(true)}
        >
          <PanelLeftOpen className="h-4 w-4" />
        </button>
      )}
      {!selectedToken ? (
        <div className="grid min-h-[34rem] flex-1 place-items-center p-8 text-center lg:min-h-0">
          <div>
            <FileText className="mx-auto h-9 w-9 text-on-surface-variant" />
            <h3 className="mt-4 text-base font-bold text-on-surface">Selecione uma nota</h3>
            <p className="mt-2 max-w-sm text-sm text-on-surface-variant">Abra uma nota do caderno ou crie um rascunho privado. Só a ação Publicar altera o histórico da equipe.</p>
            <button type="button" className="btn btn-primary mt-5" onClick={() => void startNewNote()}><Plus className="h-4 w-4" /> Criar rascunho</button>
          </div>
        </div>
      ) : detailLoading ? (
        <p className="flex min-h-[34rem] items-center justify-center gap-2 text-sm text-on-surface-variant"><Loader2 className="h-4 w-4 animate-spin" /> Abrindo nota...</p>
      ) : detailError ? (
        <div className="grid min-h-[34rem] place-items-center p-6 text-center">
          <div>
            <AlertTriangle className="mx-auto h-7 w-7 text-error" />
            <p className="mt-3 text-sm text-error" role="alert">{detailError}</p>
            <button type="button" className="mt-3 font-semibold text-primary hover:underline" onClick={() => updateLocation("note")}>Voltar à lista</button>
          </div>
        </div>
      ) : (
        <>
          <div className="border-b border-outline-variant/20 bg-surface-container-lowest px-4 py-3 sm:px-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
              <label className="min-w-0 flex-1">
                <span className="sr-only">Título da nota</span>
                <input
                  ref={titleRef}
                  value={viewedRevision?.title ?? form.title}
                  maxLength={200}
                  onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                  disabled={readOnly || Boolean(viewedRevision)}
                  placeholder="Título da evidência"
                  className="w-full border-0 bg-transparent text-xl font-bold tracking-tight text-on-surface outline-none placeholder:text-on-surface-variant/50 focus-visible:ring-2 focus-visible:ring-primary"
                />
              </label>
              <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
                {!explorerOpen && (
                  <button
                    type="button"
                    className="btn btn-ghost hidden px-2 lg:inline-flex"
                    aria-label="Abrir explorador"
                    title="Abrir explorador"
                    onClick={() => setExplorerOpen(true)}
                  >
                    <PanelLeftOpen className="h-4 w-4" />
                  </button>
                )}
                {!readOnly && (
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={publishing || saving || Boolean(viewedRevision) || conflicts.has(selectedToken) || !form.title.trim()}
                    onClick={() => void publishDraft()}
                  >
                    {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Publicar
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-ghost hidden px-2 lg:inline-flex"
                  aria-label={propertiesOpen ? "Fechar propriedades" : "Abrir propriedades"}
                  title={`${propertiesOpen ? "Fechar" : "Abrir"} propriedades (Ctrl+Shift+P)`}
                  onClick={() => {
                    setPropertiesOpen((current) => !current);
                    if (propertiesOpen) focusDocument();
                  }}
                >
                  {propertiesOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-on-surface-variant">
              <span className={`badge ${draft || conflicts.has(selectedToken) ? "badge-warning" : "badge-neutral"}`}>
                {viewedRevision
                  ? `Histórico · revisão ${viewedRevision.number}`
                  : conflicts.has(selectedToken)
                    ? "Conflito de edição"
                    : draft
                      ? selected ? `Rascunho sobre revisão ${selected.revision.number}` : "Rascunho ainda não publicado"
                      : `Publicada · revisão ${selected?.revision.number || 1}`}
              </span>
              {!viewedRevision && (
                <span className={`inline-flex items-center gap-1 ${saveStatus === "error" || saveStatus === "conflict" ? "text-error" : ""}`} aria-live="polite">
                  {saveStatus === "saving" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : saveStatus === "saved" ? <Check className="h-3.5 w-3.5" /> : <Clock3 className="h-3.5 w-3.5" />}
                  {saveStatusText}
                </span>
              )}
              {viewedRevision
                ? <span>por {viewedRevision.author} em {formatDate(viewedRevision.created_at)}</span>
                : selected && <span>· última publicação por {selected.revision.author}</span>}
            </div>

            {/* Barra de Ações Rápidas LeafWiki */}
            <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-outline-variant/15 pt-2">
              <div className="flex flex-wrap items-center gap-1">
                <button
                  type="button"
                  className="btn btn-outline py-1 px-2.5 text-xs flex items-center gap-1.5"
                  onClick={() => setTableDialogOpen(true)}
                  title="Inserir tabela Markdown"
                  disabled={readOnly || Boolean(viewedRevision)}
                >
                  <Table2 className="h-3.5 w-3.5 text-primary" />
                  <span>Tabela</span>
                </button>
                <button
                  type="button"
                  className="btn btn-outline py-1 px-2.5 text-xs flex items-center gap-1.5"
                  onClick={() => setLinkDialogOpen(true)}
                  title="Inserir link interno ou externo"
                  disabled={readOnly || Boolean(viewedRevision)}
                >
                  <Link2 className="h-3.5 w-3.5 text-primary" />
                  <span>Link</span>
                </button>
                <button
                  type="button"
                  className="btn btn-outline py-1 px-2.5 text-xs flex items-center gap-1.5"
                  onClick={() => setAssetManagerOpen(true)}
                  title="Gerenciar e inserir anexos"
                >
                  <Image className="h-3.5 w-3.5 text-primary" />
                  <span>Anexos ({visibleAttachments.length})</span>
                </button>
                <button
                  type="button"
                  className="btn btn-outline py-1 px-2.5 text-xs flex items-center gap-1.5"
                  onClick={() => {
                    setRightPanelView("toc");
                    setPropertiesOpen(true);
                  }}
                  title="Exibir sumário no painel de contexto"
                >
                  <AlignLeft className="h-3.5 w-3.5 text-primary" />
                  <span>Sumário</span>
                  {tocEntries.length > 0 && (
                    <span className="badge badge-neutral text-[9px] py-0 px-1">{tocEntries.length}</span>
                  )}
                </button>
              </div>

              <button
                type="button"
                className="btn btn-ghost py-1 px-2 text-xs text-on-surface-variant hover:text-on-surface flex items-center gap-1.5"
                onClick={() => setShortcutsOpen(true)}
                title="Atalhos de teclado (Ctrl+/ ou ?)"
              >
                <Keyboard className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Atalhos (?)</span>
              </button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
            {viewedRevision ? (
              <section className="rounded-sm border border-outline-variant/30 bg-surface-container-lowest" aria-label={`Revisão ${viewedRevision.number}`}>
                <div className="flex items-center justify-between gap-3 border-b border-outline-variant/20 px-4 py-3">
                  <div>
                    <p className="text-sm font-bold text-on-surface">Revisão imutável {viewedRevision.number}</p>
                    <p className="text-xs text-on-surface-variant">{viewedRevision.author} · {formatDate(viewedRevision.created_at)}</p>
                  </div>
                  <button type="button" className="btn btn-ghost" onClick={() => setViewedRevision(null)}><RotateCcw className="h-4 w-4" /> Voltar ao rascunho</button>
                </div>
                <MarkdownContent markdown={viewedRevision.markdown} references={resolvedReferences} className="p-5" />
              </section>
            ) : (
              <MarkdownEditor
                value={form.markdown}
                persistedValue={baseline?.markdown || ""}
                additionalDirty={dirty}
                onChange={(markdown) => setForm((current) => ({ ...current, markdown }))}
                onPersist={async () => { await saveDraftNow(); }}
                persistLabel="Salvar rascunho"
                error={saveError}
                disabled={readOnly || publishing}
                label="Nota de evidência"
                placeholder="Registre observações, comandos, saídas, tabelas e próximos passos em Markdown..."
                maxLength={100_000}
                initialMode="split"
                references={resolvedReferences}
                onReferenceSearch={searchReferences}
              />
            )}
            {conflicts.has(selectedToken) && !viewedRevision && (
              <section className="mt-3 rounded-sm border border-warning/40 bg-warning/10 p-4 text-sm text-on-surface" aria-label="Comparação do conflito">
                <div className="flex items-center gap-2 font-bold"><GitCompare className="h-4 w-4" /> Compare antes de continuar</div>
                <p className="mt-1 text-xs text-on-surface-variant">Nenhum merge foi aplicado. O rascunho privado e a revisão atual continuam separados.</p>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <div className="min-w-0 rounded-sm bg-surface p-3"><p className="mb-2 text-xs font-bold uppercase tracking-wider text-on-surface-variant">Meu rascunho</p><pre className="max-h-48 overflow-auto whitespace-pre-wrap text-xs">{form.markdown || "(vazio)"}</pre></div>
                  <div className="min-w-0 rounded-sm bg-surface p-3"><p className="mb-2 text-xs font-bold uppercase tracking-wider text-on-surface-variant">Revisão publicada atual</p><pre className="max-h-48 overflow-auto whitespace-pre-wrap text-xs">{remoteConflict?.markdown || "Carregando comparação..."}</pre></div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" className="btn btn-ghost" onClick={() => void copyDraftMarkdown()}><Copy className="h-4 w-4" /> Copiar meu texto</button>
                  <button type="button" className="btn btn-ghost" onClick={() => void discardDraftAndReload()}><Trash2 className="h-4 w-4" /> Descartar rascunho</button>
                  <button type="button" className="btn btn-primary" disabled={!remoteConflict || saving} onClick={() => void reapplyDraft()}><RotateCcw className="h-4 w-4" /> Reaplicar manualmente</button>
                </div>
              </section>
            )}
          </div>
        </>
      )}
    </main>
  );

  const propertiesPanel = (
    <aside className={`${propertiesOpen && mobilePane === "properties" ? "flex" : "hidden"} relative min-h-[34rem] flex-col border-l border-outline-variant/20 bg-surface-container-low/60 ${propertiesOpen ? "lg:flex lg:min-h-0" : "lg:hidden"}`} aria-label="Contexto da nota">
      <div className="flex items-center justify-between border-b border-outline-variant/20 px-4 py-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Contexto</p>
          <p className="mt-1 text-xs text-on-surface-variant">Dados e relações da nota</p>
        </div>
        <button
          type="button"
          className="rounded-sm p-2 text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface focus-visible:outline-2 focus-visible:outline-primary"
          aria-label="Fechar propriedades"
          onClick={() => {
            setPropertiesOpen(false);
            setMobilePane("document");
            focusDocument();
          }}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-6 gap-1 border-b border-outline-variant/20 bg-surface p-1" role="tablist" aria-label="Seções do contexto">
        {([
          ["properties", "Dados", SlidersHorizontal],
          ["links", "Links", Link2],
          ["attachments", "Anexos", Paperclip],
          ["history", "Histórico", History],
          ["toc", "Sumário", AlignLeft],
          ["broken_links", "Quebrados", AlertTriangle],
        ] as Array<[RightPanelView, string, typeof SlidersHorizontal]>).map(([view, label, Icon]) => (
          <button
            key={view}
            type="button"
            role="tab"
            aria-selected={rightPanelView === view}
            className={`inline-flex min-w-0 flex-col items-center gap-1 rounded-sm px-1 py-1.5 text-[10px] font-bold focus-visible:outline-2 focus-visible:outline-primary ${rightPanelView === view ? "bg-surface-container-high text-on-surface" : "text-on-surface-variant hover:text-on-surface"}`}
            onClick={() => setRightPanelView(view)}
          >
            <div className="relative">
              <Icon className="h-3.5 w-3.5" />
              {view === "broken_links" && brokenLinks.length > 0 && (
                <span className="absolute -top-1.5 -right-2.5 bg-amber-500 text-slate-950 font-extrabold text-[8px] px-1 rounded-full">
                  {brokenLinks.length}
                </span>
              )}
            </div>
            <span className="truncate">{label}</span>
          </button>
        ))}
      </div>
      {!selectedToken || detailLoading || detailError ? (
        <p className="p-4 text-sm text-on-surface-variant">Abra uma nota para consultar e editar suas propriedades.</p>
      ) : (
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
          {rightPanelView === "properties" && (<>
            <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant">
            Fase PTES
            <select
              value={form.phase}
              disabled={readOnly || Boolean(viewedRevision) || publishing}
              onChange={(event) => setForm((current) => ({ ...current, phase: event.target.value }))}
              className="mt-2 w-full rounded-sm border border-outline-variant/30 bg-surface px-3 py-2 text-sm font-medium normal-case tracking-normal text-on-surface"
            >
              {ptesPhases.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </label>

          <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant">
            <span className="flex items-center gap-2"><Tag className="h-3.5 w-3.5" /> Tags</span>
            <input
              value={form.tags}
              disabled={readOnly || Boolean(viewedRevision) || publishing}
              onChange={(event) => setForm((current) => ({ ...current, tags: event.target.value }))}
              placeholder="recon, web, validação"
              className="mt-2 w-full rounded-sm border border-outline-variant/30 bg-surface px-3 py-2 text-sm font-normal normal-case tracking-normal text-on-surface"
            />
            <span className="mt-1 block text-[11px] font-normal normal-case tracking-normal">Separe por vírgula.</span>
          </label>

          <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant">
            Alvos relacionados
            <textarea
              value={form.targets}
              disabled={readOnly || Boolean(viewedRevision) || publishing}
              onChange={(event) => setForm((current) => ({ ...current, targets: event.target.value }))}
              placeholder="Um alvo por linha"
              className="mt-2 min-h-24 w-full rounded-sm border border-outline-variant/30 bg-surface px-3 py-2 font-mono text-sm font-normal normal-case tracking-normal text-on-surface"
            />
          </label>

          <fieldset disabled={readOnly}>
            <legend className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Findings relacionados</legend>
            {findingsError ? (
              <p className="mt-2 text-xs text-error" role="alert">{findingsError}</p>
            ) : findings.length === 0 ? (
              <p className="mt-2 text-xs text-on-surface-variant">Nenhum finding disponível.</p>
            ) : (
              <div className="mt-2 max-h-44 space-y-2 overflow-y-auto rounded-sm border border-outline-variant/20 bg-surface p-2">
                {findings.map((finding) => (
                  <label key={finding.id} className="flex items-start gap-2 rounded-sm px-2 py-1.5 text-sm text-on-surface hover:bg-surface-container-low">
                    <input
                      type="checkbox"
                      disabled={readOnly || Boolean(viewedRevision) || publishing}
                      className="mt-0.5 accent-primary"
                      checked={form.findingIds.includes(finding.id)}
                      onChange={(event) => setForm((current) => ({
                        ...current,
                        findingIds: event.target.checked
                          ? [...current.findingIds, finding.id]
                          : current.findingIds.filter((id) => id !== finding.id),
                      }))}
                    />
                    <span>{finding.title}<span className="mt-0.5 block text-[11px] text-on-surface-variant">{phaseLabel(finding.phase)}</span></span>
                  </label>
                ))}
              </div>
            )}
            </fieldset>

            {draft && !readOnly && !viewedRevision && (
              <button type="button" className="inline-flex items-center gap-2 text-xs font-bold text-error hover:underline" onClick={() => void discardDraftAndReload()}>
                <Trash2 className="h-3.5 w-3.5" /> Descartar rascunho privado
              </button>
            )}

            <dl className="space-y-3 border-t border-outline-variant/20 pt-4 text-xs">
              <div><dt className="font-bold uppercase tracking-wider text-on-surface-variant">Autoria</dt><dd className="mt-1 text-on-surface">{draft?.author || selected?.created_by || "Você"}{draft ? " · rascunho privado" : ""}</dd></div>
              {selected && <>
                <div><dt className="font-bold uppercase tracking-wider text-on-surface-variant">Criada</dt><dd className="mt-1 text-on-surface">{formatDate(selected.created_at)}</dd></div>
                <div><dt className="font-bold uppercase tracking-wider text-on-surface-variant">Atualizada</dt><dd className="mt-1 text-on-surface">{formatDate(selected.updated_at)}</dd></div>
                <div><dt className="font-bold uppercase tracking-wider text-on-surface-variant">Identificador</dt><dd className="mt-1 break-all font-mono text-on-surface">{selected.id}</dd></div>
              </>}
            </dl>
          </>)}

          {rightPanelView === "links" && <section aria-label="Referências internas">
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-on-surface-variant"><Link2 className="h-3.5 w-3.5" /> Referências</p>
            <p className="mt-1 text-[11px] text-on-surface-variant">Digite <code>[[</code> no editor para ligar uma evidência, finding, fonte ou alvo.</p>
            {linksLoading && resolvedReferences.length === 0 ? (
              <p className="mt-2 flex items-center gap-2 text-xs text-on-surface-variant"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Resolvendo links...</p>
            ) : resolvedReferences.length === 0 ? (
              <p className="mt-2 text-xs text-on-surface-variant">Nenhuma referência de saída.</p>
            ) : (
              <ul className="mt-2 space-y-2" aria-label="Referências de saída">
                {resolvedReferences.map((reference) => (
                  <li key={reference.key} className="rounded-sm border border-outline-variant/20 bg-surface p-2">
                    <button
                      type="button"
                      disabled={!reference.href}
                      onClick={() => openReference(reference.href)}
                      className={`block w-full text-left text-xs font-semibold ${reference.broken ? "cursor-not-allowed text-error" : "text-primary hover:underline"}`}
                    >
                      {reference.label}
                    </button>
                    <span className="mt-1 block text-[10px] uppercase tracking-wider text-on-surface-variant">{reference.kind}</span>
                    {reference.context && <span className="mt-1 line-clamp-2 block text-[11px] text-on-surface-variant">{reference.context}</span>}
                  </li>
                ))}
              </ul>
            )}

            {selected && (
              <div className="mt-4">
                <p className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">Mencionada por</p>
                {linksLoading ? (
                  <p className="mt-2 flex items-center gap-2 text-xs text-on-surface-variant"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando backlinks...</p>
                ) : referenceLinks.backlinks.length === 0 ? (
                  <p className="mt-2 text-xs text-on-surface-variant">Nenhuma nota publicada aponta para esta evidência.</p>
                ) : (
                  <ul className="mt-2 space-y-2" aria-label="Backlinks desta evidência">
                    {referenceLinks.backlinks.map((backlink) => (
                      <li key={backlink.id} className="rounded-sm border border-outline-variant/20 bg-surface p-2">
                        <button type="button" className="text-left text-xs font-semibold text-primary hover:underline" onClick={() => openReference(backlink.href)}>{backlink.label}</button>
                        {backlink.context && <span className="mt-1 line-clamp-2 block text-[11px] text-on-surface-variant">{backlink.context}</span>}
                        <span className="mt-1 block text-[10px] text-on-surface-variant">{backlink.author} · {formatDate(backlink.updated_at)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </section>}

          {rightPanelView === "attachments" && <section>
            <div className="flex items-center justify-between gap-2">
              <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-on-surface-variant"><Paperclip className="h-3.5 w-3.5" /> Anexos</p>
              {!readOnly && (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline"
                  disabled={uploading || Boolean(viewedRevision)}
                  onClick={() => uploadRef.current?.click()}
                >
                  {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} Enviar
                </button>
              )}
              <input
                ref={uploadRef}
                type="file"
                multiple
                className="sr-only"
                aria-label="Selecionar anexos"
                onChange={(event) => void uploadAttachments(Array.from(event.target.files || []))}
              />
            </div>
            {visibleAttachments.length === 0 ? (
              <p className="mt-2 text-xs text-on-surface-variant">Nenhum arquivo anexado.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {visibleAttachments.map((attachment) => {
                  const publishedAttachment = Boolean(selected?.attachment_ids.includes(attachment.id));
                  const imageAttachment = attachment.content_type.startsWith("image/");
                  return (
                    <li key={attachment.id} className="rounded-sm border border-outline-variant/20 bg-surface p-2">
                      <div className="flex min-w-0 items-start justify-between gap-2">
                        <a
                          href={evidenceAttachmentDownloadUrl(slug, selectedToken, attachment.id)}
                          className="min-w-0 truncate text-xs font-semibold text-primary hover:underline"
                        >
                          {attachment.filename} · {Math.max(1, Math.round(attachment.size / 1024))} KB
                        </a>
                        <span className={`badge shrink-0 ${publishedAttachment ? "badge-neutral" : "badge-warning"}`}>{publishedAttachment ? "Publicado" : "Privado"}</span>
                      </div>
                      {!readOnly && !viewedRevision && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          <button type="button" className="inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline" onClick={() => insertAttachmentReference(attachment, false)}><Link2 className="h-3 w-3" /> Inserir link</button>
                          {imageAttachment && <button type="button" className="inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline" onClick={() => insertAttachmentReference(attachment, true)}><Image className="h-3 w-3" /> Incorporar imagem</button>}
                          {!publishedAttachment && <button type="button" className="inline-flex items-center gap-1 text-[11px] font-bold text-error hover:underline" onClick={() => void removeDraftAttachment(attachment.id)}><Trash2 className="h-3 w-3" /> Excluir</button>}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>}

          {rightPanelView === "history" && selected && (
            <section>
              <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-on-surface-variant"><History className="h-3.5 w-3.5" /> Histórico da equipe</p>
              {historyLoading ? (
                <p className="mt-2 flex items-center gap-2 text-xs text-on-surface-variant"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando revisões...</p>
              ) : (
                <ul className="mt-2 space-y-1">
                  {revisions.map((revision) => (
                    <li key={revision.id} className="flex items-center gap-1 rounded-sm hover:bg-surface-container-high pr-1">
                      <button
                        type="button"
                        className={`flex-1 px-2 py-2 text-left text-xs ${viewedRevision?.id === revision.id ? "bg-primary/10 text-primary" : "text-on-surface"}`}
                        onClick={() => { setViewedRevision(revision); setMobilePane("document"); }}
                      >
                        <span className="font-bold">Revisão {revision.number}</span>
                        <span className="mt-0.5 block text-[11px] text-on-surface-variant">{revision.author} · {formatDate(revision.created_at)}</span>
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline py-0.5 px-2 text-[10px] flex items-center gap-1 shrink-0"
                        title="Comparar diff com o rascunho atual"
                        onClick={() => setDiffRevision(revision)}
                      >
                        <GitCompare className="h-3 w-3" /> Diff
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {draft && <p className="mt-2 text-[11px] text-on-surface-variant">Seu rascunho privado não aparece neste histórico até ser publicado.</p>}
            </section>
          )}

          {rightPanelView === "toc" && (
            <section aria-label="Sumário da nota de evidência">
              <EvidenceTocPanel entries={tocEntries} onSelectEntry={handleSelectTocEntry} />
            </section>
          )}

          {rightPanelView === "broken_links" && (
            <section aria-label="Verificação de links quebrados">
              <EvidenceBrokenLinksPanel
                brokenLinks={brokenLinks}
                isLoading={brokenLinksLoading}
                onRefresh={loadBrokenLinks}
                onSelectNote={(noteId) => chooseNote(noteId)}
              />
            </section>
          )}

        </div>
      )}
      <div
        role="separator"
        aria-label="Redimensionar propriedades"
        aria-orientation="vertical"
        aria-valuemin={PROPERTIES_MIN_WIDTH}
        aria-valuemax={PROPERTIES_MAX_WIDTH}
        aria-valuenow={Math.round(propertiesWidth)}
        aria-valuetext={`${Math.round(propertiesWidth)} pixels de largura`}
        tabIndex={0}
        className={`group absolute inset-y-0 -left-1 z-20 hidden w-2 cursor-col-resize touch-none focus-visible:outline-2 focus-visible:outline-primary lg:block ${resizingPanel === "properties" ? "bg-primary/10" : ""}`}
        onPointerDown={(event) => startPanelResize(event, "properties")}
        onKeyDown={(event) => resizePanelWithKeyboard(event, "properties")}
      >
        <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-transparent transition group-hover:bg-primary/50 group-focus-visible:bg-primary" />
      </div>
    </aside>
  );

  function mobileTabKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>, pane: MobilePane) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    const panes: MobilePane[] = propertiesOpen ? ["notes", "document", "properties"] : ["notes", "document"];
    const current = panes.indexOf(pane);
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const next = panes[(current + direction + panes.length) % panes.length];
    event.preventDefault();
    setMobilePane(next);
  }

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden bg-background" aria-label="Caderno operacional de evidências">
      {quickSwitcherOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-background/70 px-4 pt-[12vh] backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setQuickSwitcherOpen(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="evidence-quick-switcher-title"
            className="w-full max-w-xl overflow-hidden rounded-sm border border-outline-variant/30 bg-surface shadow-2xl"
          >
            <div className="flex items-center gap-3 border-b border-outline-variant/20 px-4 py-3">
              <Search className="h-4 w-4 shrink-0 text-on-surface-variant" />
              <div className="min-w-0 flex-1">
                <h2 id="evidence-quick-switcher-title" className="sr-only">Abrir nota rapidamente</h2>
                <input
                  ref={quickSwitcherRef}
                  value={quickSwitcherQuery}
                  onChange={(event) => setQuickSwitcherQuery(event.target.value)}
                  onKeyDown={quickSwitcherKeyDown}
                  aria-controls="evidence-quick-switcher-results"
                  aria-activedescendant={quickSwitcherItems[quickSwitcherIndex]
                    ? `evidence-quick-switcher-${quickSwitcherItems[quickSwitcherIndex].id}`
                    : undefined}
                  placeholder="Abrir nota por título, fase ou tag"
                  className="w-full border-0 bg-transparent text-sm text-on-surface outline-none placeholder:text-on-surface-variant"
                />
              </div>
              <ShortcutHint>Esc</ShortcutHint>
            </div>
            <div id="evidence-quick-switcher-results" role="listbox" className="max-h-80 overflow-y-auto p-2">
              {quickSwitcherItems.length === 0 ? (
                <p className="px-3 py-8 text-center text-sm text-on-surface-variant">Nenhuma nota corresponde à busca.</p>
              ) : quickSwitcherItems.map((item, index) => (
                <button
                  id={`evidence-quick-switcher-${item.id}`}
                  key={item.id}
                  type="button"
                  role="option"
                  aria-selected={index === quickSwitcherIndex}
                  className={`block w-full rounded-sm px-3 py-2.5 text-left focus-visible:outline-2 focus-visible:outline-primary ${index === quickSwitcherIndex ? "bg-primary/10" : "hover:bg-surface-container-low"}`}
                  onMouseEnter={() => setQuickSwitcherIndex(index)}
                  onClick={() => chooseQuickSwitcherItem(item.id)}
                >
                  <span className="block truncate text-sm font-semibold text-on-surface">{item.title}</span>
                  <span className="mt-1 block truncate text-xs text-on-surface-variant">{item.context}</span>
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3 border-t border-outline-variant/20 px-4 py-2 text-[11px] text-on-surface-variant">
              <span><ShortcutHint>↑↓</ShortcutHint> navegar</span>
              <span><ShortcutHint>Enter</ShortcutHint> abrir</span>
            </div>
          </section>
        </div>
      )}
      <div className="flex items-center justify-between gap-3 border-b border-outline-variant/20 bg-surface-container-high p-2 lg:hidden" role="tablist" aria-label="Áreas do caderno">
        {([
          ["notes", "1. Notas"],
          ["document", "2. Documento"],
          ...(propertiesOpen ? [["properties", "3. Propriedades"]] : []),
        ] as Array<[MobilePane, string]>).map(([pane, label]) => (
          <button
            key={pane}
            type="button"
            role="tab"
            aria-selected={mobilePane === pane}
            className={`flex-1 rounded-sm px-2 py-2 text-xs font-bold focus-visible:outline-2 focus-visible:outline-primary ${mobilePane === pane ? "bg-surface text-primary" : "text-on-surface-variant"}`}
            onClick={() => setMobilePane(pane)}
            onKeyDown={(event) => mobileTabKeyDown(event, pane)}
          >
            {label}
          </button>
        ))}
        {!propertiesOpen && (
          <button type="button" className="rounded-sm p-2 text-on-surface-variant focus-visible:outline-2 focus-visible:outline-primary" aria-label="Abrir propriedades" onClick={() => { setPropertiesOpen(true); setMobilePane("properties"); }}>
            <Filter className="h-4 w-4" />
          </button>
        )}
      </div>
      <div
        className="min-h-0 min-w-0 flex-1 lg:grid"
        style={{
          gridTemplateColumns: explorerOpen && propertiesOpen
            ? `${explorerWidth}px minmax(0, 1fr) ${propertiesWidth}px`
            : explorerOpen
              ? `${explorerWidth}px minmax(0, 1fr)`
              : propertiesOpen
                ? `minmax(0, 1fr) ${propertiesWidth}px`
                : "minmax(0, 1fr)",
        }}
      >
        {noteList}
        {documentPanel}
        {propertiesPanel}
      </div>

      {/* Modais LeafWiki Documentais */}
      <EvidenceShortcutsModal
        isOpen={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
      />

      <EvidenceTableDialog
        isOpen={tableDialogOpen}
        onClose={() => setTableDialogOpen(false)}
        onInsertTable={insertTextAtCaret}
      />

      <EvidenceLinkDialog
        isOpen={linkDialogOpen}
        onClose={() => setLinkDialogOpen(false)}
        initialText=""
        onInsertLink={insertTextAtCaret}
        onSearchSuggestions={handleSearchLinkSuggestions}
      />

      <EvidenceRevisionDiffModal
        isOpen={Boolean(diffRevision)}
        onClose={() => setDiffRevision(null)}
        revision={diffRevision}
        currentContent={form.markdown}
        onRestoreRevision={handleRestoreRevisionToDraft}
      />

      <EvidenceAssetManagerModal
        isOpen={assetManagerOpen}
        onClose={() => setAssetManagerOpen(false)}
        attachments={visibleAttachments}
        getDownloadUrl={(attId, inline) => evidenceAttachmentDownloadUrl(slug, selectedToken, attId, inline)}
        onInsertSnippet={insertTextAtCaret}
        onDeleteAttachment={removeDraftAttachment}
        readOnly={readOnly}
      />

      <EvidenceSectionModal
        isOpen={isSectionModalOpen}
        parentId={sectionParentId}
        onClose={() => setIsSectionModalOpen(false)}
        onSubmit={handleCreateSectionSubmit}
      />

      <EvidenceMoveModal
        isOpen={isMoveModalOpen}
        movingNode={movingNode}
        tree={treeData}
        onClose={() => {
          setIsMoveModalOpen(false);
          setMovingNode(null);
        }}
        onSubmit={handleMoveSubmit}
      />

      <EvidenceImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onImport={handleImportSubmit}
      />
    </section>
  );
}
