import React, { useState, useMemo } from "react";
import {
  Folder,
  FolderOpen,
  FileText,
  ChevronRight,
  ChevronDown,
  Pin,
  Star,
  Plus,
  MoreVertical,
  Move,
  Copy,
  Download,
  Search,
} from "lucide-react";
import type { EvidenceTreeNode } from "../api";

export interface EvidenceTreeViewProps {
  tree: EvidenceTreeNode[];
  selectedNoteId: string | null;
  onSelectNote: (noteId: string) => void;
  onCreateNote: (parentId?: string | null) => void;
  onCreateSection: (parentId?: string | null) => void;
  onTogglePin: (noteId: string, pinned: boolean) => void;
  onToggleFavorite: (noteId: string, favorited: boolean) => void;
  onMoveNote: (note: EvidenceTreeNode) => void;
  onCopyNote: (note: EvidenceTreeNode) => void;
  onExportNote: (noteId: string) => void;
}

export const EvidenceTreeView: React.FC<EvidenceTreeViewProps> = ({
  tree,
  selectedNoteId,
  onSelectNote,
  onCreateNote,
  onCreateSection,
  onTogglePin,
  onToggleFavorite,
  onMoveNote,
  onCopyNote,
  onExportNote,
}) => {
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});
  const [filterText, setFilterText] = useState("");
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  const toggleExpand = (nodeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedNodes((prev) => ({ ...prev, [nodeId]: !prev[nodeId] }));
  };

  const expandAll = () => {
    const allExpanded: Record<string, boolean> = {};
    const traverse = (nodes: EvidenceTreeNode[]) => {
      for (const n of nodes) {
        if (n.kind === "section" || (n.children && n.children.length > 0)) {
          allExpanded[n.id] = true;
          traverse(n.children);
        }
      }
    };
    traverse(tree);
    setExpandedNodes(allExpanded);
  };

  const collapseAll = () => {
    setExpandedNodes({});
  };

  const matchesFilter = (node: EvidenceTreeNode, q: string): boolean => {
    if (!q) return true;
    const lower = q.toLowerCase();
    if (node.title.toLowerCase().includes(lower)) return true;
    if (node.tags.some((t) => t.toLowerCase().includes(lower))) return true;
    return node.children.some((child) => matchesFilter(child, q));
  };

  const filteredTree = useMemo(() => {
    if (!filterText.trim()) return tree;
    const filterNodes = (nodes: EvidenceTreeNode[]): EvidenceTreeNode[] => {
      return nodes
        .filter((node) => matchesFilter(node, filterText.trim()))
        .map((node) => ({
          ...node,
          children: filterNodes(node.children),
        }));
    };
    return filterNodes(tree);
  }, [tree, filterText]);

  // Extract pinned notes for LeafWiki style Pinned Pages section
  const pinnedNodes = useMemo(() => {
    const pins: EvidenceTreeNode[] = [];
    const traverse = (nodes: EvidenceTreeNode[]) => {
      for (const n of nodes) {
        if (n.pinned && n.kind !== "section") pins.push(n);
        if (n.children?.length) traverse(n.children);
      }
    };
    traverse(tree);
    return pins;
  }, [tree]);

  const renderNode = (node: EvidenceTreeNode, depth: number = 0) => {
    const isSection = node.kind === "section";
    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = expandedNodes[node.id] ?? depth === 0;
    const isSelected = selectedNoteId === node.id;
    const isMenuOpen = activeMenuId === node.id;

    return (
      <div key={node.id} className="flex flex-col select-none">
        <div
          onClick={() => onSelectNote(node.id)}
          className={`group relative flex items-center justify-between px-2 py-1.5 text-xs rounded-sm transition-colors cursor-pointer ${
            isSelected
              ? "bg-primary/10 text-primary font-semibold border-l-2 border-primary"
              : "text-on-surface hover:bg-surface-container-high hover:text-on-surface"
          }`}
          style={{ paddingLeft: `${depth * 14 + 8}px` }}
        >
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            {hasChildren || isSection ? (
              <button
                type="button"
                onClick={(e) => toggleExpand(node.id, e)}
                className="p-0.5 hover:bg-surface-container-highest rounded-sm text-on-surface-variant transition-colors"
                aria-label={isExpanded ? "Recolher pasta" : "Expandir pasta"}
              >
                {isExpanded ? (
                  <ChevronDown className="w-3.5 h-3.5" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5" />
                )}
              </button>
            ) : (
              <span className="w-3.5" />
            )}

            {isSection ? (
              isExpanded ? (
                <FolderOpen className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              ) : (
                <Folder className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              )
            ) : (
              <FileText className={`w-3.5 h-3.5 shrink-0 ${isSelected ? "text-primary" : "text-on-surface-variant"}`} />
            )}

            <span className="truncate flex-1">{node.title || "Sem título"}</span>

            {isSection && hasChildren && (
              <span className="text-[10px] text-on-surface-variant/70 bg-surface-container-high px-1.5 py-0.2 rounded-full font-mono">
                {node.children.length}
              </span>
            )}

            {node.pinned && (
              <Pin className="w-3 h-3 text-primary fill-primary shrink-0" />
            )}
            {node.favorite && (
              <Star className="w-3 h-3 text-amber-400 fill-amber-400 shrink-0" />
            )}
          </div>

          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-1">
            {isSection && (
              <button
                type="button"
                title="Nova nota nesta pasta"
                onClick={(e) => {
                  e.stopPropagation();
                  onCreateNote(node.id);
                }}
                className="p-1 hover:bg-surface-container-highest rounded-sm text-on-surface-variant hover:text-on-surface transition-colors"
              >
                <Plus className="w-3 h-3" />
              </button>
            )}

            <div className="relative">
              <button
                type="button"
                title="Ações"
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveMenuId(isMenuOpen ? null : node.id);
                }}
                className="p-1 hover:bg-surface-container-highest rounded-sm text-on-surface-variant hover:text-on-surface transition-colors"
              >
                <MoreVertical className="w-3 h-3" />
              </button>

              {isMenuOpen && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="absolute right-0 top-6 z-30 w-36 bg-surface-container-lowest border border-outline-variant/30 rounded-sm shadow-xl py-1 text-[11px] text-on-surface"
                >
                  <button
                    type="button"
                    onClick={() => {
                      onTogglePin(node.id, !node.pinned);
                      setActiveMenuId(null);
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-1 text-on-surface hover:bg-surface-container-high text-left transition-colors"
                  >
                    <Pin className="w-3 h-3 text-primary" />
                    {node.pinned ? "Desafixar" : "Fixar"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onToggleFavorite(node.id, !node.favorite);
                      setActiveMenuId(null);
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-1 text-on-surface hover:bg-surface-container-high text-left transition-colors"
                  >
                    <Star className="w-3 h-3 text-amber-400" />
                    {node.favorite ? "Desfavoritar" : "Favoritar"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onMoveNote(node);
                      setActiveMenuId(null);
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-1 text-on-surface hover:bg-surface-container-high text-left transition-colors"
                  >
                    <Move className="w-3 h-3 text-on-surface-variant" />
                    Mover
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onCopyNote(node);
                      setActiveMenuId(null);
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-1 text-on-surface hover:bg-surface-container-high text-left transition-colors"
                  >
                    <Copy className="w-3 h-3 text-on-surface-variant" />
                    Duplicar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onExportNote(node.id);
                      setActiveMenuId(null);
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-1 text-on-surface hover:bg-surface-container-high text-left transition-colors"
                  >
                    <Download className="w-3 h-3 text-on-surface-variant" />
                    Exportar .md
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {isExpanded && hasChildren && (
          <div className="relative pl-2.5 border-l border-outline-variant/15 ml-3 my-0.5 space-y-0.5">
            {node.children.map((child) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-surface-container-low/40 border-r border-outline-variant/20 text-on-surface">
      <div className="p-2.5 border-b border-outline-variant/20 bg-surface-container-low/60 flex flex-col gap-2">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-on-surface-variant/60 absolute left-2 top-2" />
          <input
            type="text"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Filtrar notas e pastas..."
            className="w-full bg-surface border border-outline-variant/30 rounded-sm pl-7 pr-2 py-1 text-xs text-on-surface placeholder:text-on-surface-variant/60 focus-visible:outline-2 focus-visible:outline-primary transition-colors"
          />
        </div>

        <div className="flex items-center justify-between text-[11px] text-on-surface-variant">
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={expandAll}
              className="hover:text-on-surface underline text-xs"
            >
              Expandir
            </button>
            <span>•</span>
            <button
              type="button"
              onClick={collapseAll}
              className="hover:text-on-surface underline text-xs"
            >
              Recolher
            </button>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onCreateSection(null)}
              className="btn btn-outline px-2 py-0.5 text-xs text-on-surface flex items-center gap-1"
              title="Nova Seção (Pasta)"
            >
              <Folder className="w-3 h-3 text-amber-500" />
              <span>Pasta</span>
            </button>
            <button
              type="button"
              onClick={() => onCreateNote(null)}
              className="btn btn-primary px-2 py-0.5 text-xs flex items-center gap-1"
              title="Nova Nota"
            >
              <Plus className="w-3 h-3" />
              <span>Nota</span>
            </button>
          </div>
        </div>
      </div>

      {/* LeafWiki Pinned Pages Section */}
      {pinnedNodes.length > 0 && !filterText && (
        <div className="px-2.5 pt-2 pb-1 border-b border-outline-variant/15">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-on-surface-variant mb-1">
            <Pin className="w-3 h-3 text-primary" />
            <span>Fixadas ({pinnedNodes.length})</span>
          </div>
          <div className="space-y-0.5">
            {pinnedNodes.map((pin) => (
              <button
                key={`pin-${pin.id}`}
                type="button"
                onClick={() => onSelectNote(pin.id)}
                className={`w-full flex items-center gap-1.5 px-2 py-1 rounded-sm text-xs text-left truncate transition-colors ${
                  selectedNoteId === pin.id
                    ? "bg-primary/10 text-primary font-semibold"
                    : "text-on-surface hover:bg-surface-container-high"
                }`}
              >
                <FileText className="w-3 h-3 text-primary shrink-0" />
                <span className="truncate flex-1">{pin.title}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
        {filteredTree.length === 0 ? (
          <div className="p-6 text-center text-xs text-on-surface-variant">
            Nenhuma nota encontrada.
          </div>
        ) : (
          filteredTree.map((node) => renderNode(node, 0))
        )}
      </div>
    </div>
  );
};
