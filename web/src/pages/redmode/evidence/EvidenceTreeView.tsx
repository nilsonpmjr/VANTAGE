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
          className={`group flex items-center justify-between px-2 py-1.5 text-xs rounded transition-colors cursor-pointer ${
            isSelected
              ? "bg-red-500/20 text-red-300 font-medium border border-red-500/30"
              : "text-slate-300 hover:bg-slate-800/60 hover:text-slate-100"
          }`}
          style={{ paddingLeft: `${depth * 14 + 8}px` }}
        >
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            {hasChildren || isSection ? (
              <button
                type="button"
                onClick={(e) => toggleExpand(node.id, e)}
                className="p-0.5 hover:bg-slate-700/60 rounded text-slate-400"
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
                <FolderOpen className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
              ) : (
                <Folder className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
              )
            ) : (
              <FileText className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
            )}

            <span className="truncate flex-1">{node.title || "Sem título"}</span>

            {node.pinned && (
              <Pin className="w-3 h-3 text-red-400 fill-red-400 flex-shrink-0" />
            )}
            {node.favorite && (
              <Star className="w-3 h-3 text-amber-400 fill-amber-400 flex-shrink-0" />
            )}
          </div>

          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {isSection && (
              <button
                type="button"
                title="Nova nota nesta pasta"
                onClick={(e) => {
                  e.stopPropagation();
                  onCreateNote(node.id);
                }}
                className="p-1 hover:bg-slate-700 rounded text-slate-300 hover:text-white"
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
                className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-slate-200"
              >
                <MoreVertical className="w-3 h-3" />
              </button>

              {isMenuOpen && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="absolute right-0 top-6 z-30 w-36 bg-slate-900 border border-slate-700 rounded-md shadow-xl py-1 text-[11px]"
                >
                  <button
                    type="button"
                    onClick={() => {
                      onTogglePin(node.id, !node.pinned);
                      setActiveMenuId(null);
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-1 text-slate-300 hover:bg-slate-800 text-left"
                  >
                    <Pin className="w-3 h-3" />
                    {node.pinned ? "Desafixar" : "Fixar"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onToggleFavorite(node.id, !node.favorite);
                      setActiveMenuId(null);
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-1 text-slate-300 hover:bg-slate-800 text-left"
                  >
                    <Star className="w-3 h-3" />
                    {node.favorite ? "Desfavoritar" : "Favoritar"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onMoveNote(node);
                      setActiveMenuId(null);
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-1 text-slate-300 hover:bg-slate-800 text-left"
                  >
                    <Move className="w-3 h-3" />
                    Mover
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onCopyNote(node);
                      setActiveMenuId(null);
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-1 text-slate-300 hover:bg-slate-800 text-left"
                  >
                    <Copy className="w-3 h-3" />
                    Duplicar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onExportNote(node.id);
                      setActiveMenuId(null);
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-1 text-slate-300 hover:bg-slate-800 text-left"
                  >
                    <Download className="w-3 h-3" />
                    Exportar .md
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {isExpanded && hasChildren && (
          <div className="flex flex-col">
            {node.children.map((child) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-slate-950/70 border-r border-slate-800 text-slate-200">
      <div className="p-2 border-b border-slate-800 flex flex-col gap-2">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2 top-2" />
          <input
            type="text"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Filtrar notas e pastas..."
            className="w-full bg-slate-900 border border-slate-700/80 rounded pl-7 pr-2 py-1 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-red-500"
          />
        </div>

        <div className="flex items-center justify-between text-[11px] text-slate-400">
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={expandAll}
              className="hover:text-slate-200 underline"
            >
              Expandir
            </button>
            <span>•</span>
            <button
              type="button"
              onClick={collapseAll}
              className="hover:text-slate-200 underline"
            >
              Recolher
            </button>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onCreateSection(null)}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white"
              title="Nova Seção (Pasta)"
            >
              <Folder className="w-3 h-3 text-amber-400" />
              <span>Pasta</span>
            </button>
            <button
              type="button"
              onClick={() => onCreateNote(null)}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-600/80 hover:bg-red-600 text-white"
              title="Nova Nota"
            >
              <Plus className="w-3 h-3" />
              <span>Nota</span>
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
        {filteredTree.length === 0 ? (
          <div className="p-4 text-center text-xs text-slate-500">
            Nenhuma nota encontrada.
          </div>
        ) : (
          filteredTree.map((node) => renderNode(node, 0))
        )}
      </div>
    </div>
  );
};
