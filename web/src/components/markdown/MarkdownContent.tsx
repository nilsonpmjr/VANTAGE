import { useMemo, type MouseEvent } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "../../lib/utils";
import { renderSafeMarkdown, type MarkdownInternalReference } from "./markdown";

export interface MarkdownContentProps {
  markdown: string;
  className?: string;
  emptyMessage?: string;
  ariaLabel?: string;
  references?: MarkdownInternalReference[];
}

export function MarkdownContent({
  markdown,
  className,
  emptyMessage = "Nenhum conteúdo Markdown.",
  ariaLabel = "Conteúdo Markdown",
  references = [],
}: MarkdownContentProps) {
  const navigate = useNavigate();
  const html = useMemo(
    () => renderSafeMarkdown(markdown, references),
    [markdown, references],
  );

  function handleClick(event: MouseEvent<HTMLDivElement>) {
    if (
      event.defaultPrevented
      || event.button !== 0
      || event.metaKey
      || event.ctrlKey
      || event.shiftKey
      || event.altKey
    ) return;
    const target = event.target as Element | null;
    const link = target?.closest<HTMLAnchorElement>("a[data-router-link='true']");
    if (!link) return;
    event.preventDefault();
    navigate(`${link.pathname}${link.search}${link.hash}`);
  }

  if (!html) {
    return <p className={cn("markdown-empty", className)}>{emptyMessage}</p>;
  }
  return (
    <div
      className={cn("markdown-content", className)}
      aria-label={ariaLabel}
      onClick={handleClick}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export function MarkdownPreview(props: MarkdownContentProps) {
  return <MarkdownContent {...props} ariaLabel={props.ariaLabel || "Prévia do Markdown"} />;
}
