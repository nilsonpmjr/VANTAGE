import DOMPurify from "dompurify";
import { Marked, Renderer, type Tokens } from "marked";

export type MarkdownUrlKind = "internal" | "external" | "email" | "fragment" | "blocked";

export interface MarkdownUrlPolicy {
  kind: MarkdownUrlKind;
  href: string | null;
}

const SAFE_TAGS = [
  "a",
  "blockquote",
  "br",
  "code",
  "del",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "img",
  "input",
  "li",
  "ol",
  "p",
  "pre",
  "span",
  "strong",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tr",
  "ul",
];

const SAFE_ATTRIBUTES = [
  "alt",
  "aria-hidden",
  "checked",
  "class",
  "data-external-link",
  "data-router-link",
  "disabled",
  "href",
  "loading",
  "referrerpolicy",
  "rel",
  "role",
  "src",
  "target",
  "title",
  "type",
];

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function currentOrigin(): string {
  return typeof window === "undefined" ? "http://vantage.local" : window.location.origin;
}

export function classifyMarkdownUrl(rawHref: string): MarkdownUrlPolicy {
  const href = rawHref.trim();
  if (!href || /[\u0000-\u001f\u007f]/.test(href)) return { kind: "blocked", href: null };
  if (href.startsWith("#")) return { kind: "fragment", href };
  if (href.startsWith("//")) return { kind: "blocked", href: null };
  try {
    const resolved = new URL(href, `${currentOrigin()}/`);
    if (resolved.protocol === "mailto:") return { kind: "email", href: resolved.href };
    if (!(["http:", "https:"] as string[]).includes(resolved.protocol)) {
      return { kind: "blocked", href: null };
    }
    if (resolved.origin === currentOrigin()) {
      return {
        kind: "internal",
        href: `${resolved.pathname}${resolved.search}${resolved.hash}`,
      };
    }
    return { kind: "external", href: resolved.href };
  } catch {
    return { kind: "blocked", href: null };
  }
}

export function isAuthenticatedImageUrl(rawHref: string): boolean {
  const href = rawHref.trim();
  if (!href || href.startsWith("//")) return false;
  try {
    const resolved = new URL(href, `${currentOrigin()}/`);
    return (
      ["http:", "https:"].includes(resolved.protocol)
      && resolved.origin === currentOrigin()
      && resolved.pathname.startsWith("/api/")
    );
  } catch {
    return false;
  }
}

function renderLink(renderer: Renderer, token: Tokens.Link): string {
  const policy = classifyMarkdownUrl(token.href);
  const label = renderer.parser.parseInline(token.tokens);
  if (policy.kind === "blocked" || !policy.href) {
    return `<span class="markdown-link-blocked" title="Link bloqueado">${label}</span>`;
  }
  const title = token.title ? ` title="${escapeHtml(token.title)}"` : "";
  if (policy.kind === "external") {
    return `<a href="${escapeHtml(policy.href)}" target="_blank" rel="noopener noreferrer external" data-external-link="true"${title}>${label}</a>`;
  }
  if (policy.kind === "email") {
    return `<a href="${escapeHtml(policy.href)}" rel="noopener noreferrer" data-external-link="true"${title}>${label}</a>`;
  }
  if (policy.kind === "internal") {
    const routerAttribute = policy.href.startsWith("/api/") ? "" : " data-router-link=\"true\"";
    return `<a href="${escapeHtml(policy.href)}"${routerAttribute}${title}>${label}</a>`;
  }
  return `<a href="${escapeHtml(policy.href)}"${title}>${label}</a>`;
}

const renderer = new Renderer();
renderer.html = ({ text }) => `<span class="markdown-raw-html">${escapeHtml(text)}</span>`;
renderer.link = function link(token) {
  return renderLink(this, token);
};
renderer.image = ({ href, title, text }) => {
  if (!isAuthenticatedImageUrl(href)) {
    return `<span class="markdown-image-blocked" role="note">Imagem bloqueada: ${escapeHtml(text || "sem descrição")}</span>`;
  }
  const safeUrl = classifyMarkdownUrl(href).href;
  const titleAttribute = title ? ` title="${escapeHtml(title)}"` : "";
  return `<img src="${escapeHtml(safeUrl || href)}" alt="${escapeHtml(text)}" loading="lazy" referrerpolicy="no-referrer"${titleAttribute}>`;
};
renderer.code = ({ text, lang }) => {
  const language = (lang || "").split(/\s+/)[0].replace(/[^a-z0-9_+#.-]/gi, "");
  const className = language ? ` class="language-${escapeHtml(language)}"` : "";
  return `<pre><code${className}>${escapeHtml(text)}</code></pre>`;
};

const markdownParser = new Marked({
  async: false,
  breaks: true,
  gfm: true,
  renderer,
});

export function renderSafeMarkdown(markdown: string): string {
  if (!markdown.trim()) return "";
  const rendered = markdownParser.parse(markdown, { async: false });
  return DOMPurify.sanitize(rendered, {
    ALLOWED_TAGS: SAFE_TAGS,
    ALLOWED_ATTR: SAFE_ATTRIBUTES,
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: true,
    FORBID_TAGS: ["iframe", "object", "embed", "svg", "math", "form", "video", "audio"],
    FORBID_ATTR: ["style", "srcset", "formaction"],
  });
}
