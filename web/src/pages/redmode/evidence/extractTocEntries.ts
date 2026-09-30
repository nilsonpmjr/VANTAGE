export interface TocEntry {
  level: 1 | 2 | 3;
  text: string;
  id: string;
}

export function slugifyHeadline(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[ßẞ]/g, "ss")
    .toLowerCase()
    .replace(/\p{Mark}+/gu, "")
    .trim()
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function stripInlineMarkdown(text: string): string {
  return text
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]*>/g, "")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\[[^\]]*\]/g, "$1")
    .replace(/\[([^\]]*)\](?!\(|\[)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, "$1")
    .trim();
}

/**
 * Extrai títulos H1, H2 e H3 do documento Markdown, ignorando blocos de código cercados (` ``` ` ou `~~~`).
 * Adaptado e traduzido diretamente da especificação LeafWiki (`features/preview/extractTocEntries.ts`).
 */
export function extractTocEntries(markdown: string): TocEntry[] {
  if (!markdown) return [];
  const lines = markdown.split("\n");
  const entries: TocEntry[] = [];
  const slugCounts: Record<string, number> = {};
  let inCodeBlock = false;
  let fenceChar: string | null = null;
  let fenceLength = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (inCodeBlock) {
      const closeMatch = line.match(/^ {0,3}(`{3,}|~{3,})[ \t]*$/);
      if (
        closeMatch &&
        closeMatch[1][0] === fenceChar &&
        closeMatch[1].length >= fenceLength
      ) {
        inCodeBlock = false;
        fenceChar = null;
        fenceLength = 0;
      }
      continue;
    }

    const openMatch = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (openMatch) {
      inCodeBlock = true;
      fenceChar = openMatch[1][0];
      fenceLength = openMatch[1].length;
      continue;
    }

    // ATX headings: match # H1, ## H2, ### H3
    const atxMatch = line.match(/^(#{1,3})\s+(.+?)(?:\s+#+\s*)?$/);
    if (atxMatch) {
      const level = atxMatch[1].length as 1 | 2 | 3;
      const text = stripInlineMarkdown(atxMatch[2]);
      if (!text) continue;

      let baseSlug = slugifyHeadline(text) || `heading-${i + 1}`;
      const count = slugCounts[baseSlug] ?? 0;
      slugCounts[baseSlug] = count + 1;
      const id = count === 0 ? baseSlug : `${baseSlug}-${count}`;

      entries.push({ level, text, id });
    }
  }

  return entries;
}
