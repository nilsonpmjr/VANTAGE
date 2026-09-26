import { describe, expect, it } from "vitest";
import {
  classifyMarkdownUrl,
  isAuthenticatedImageUrl,
  renderSafeMarkdown,
} from "./markdown";

function rendered(markdown: string): HTMLDivElement {
  const root = document.createElement("div");
  root.innerHTML = renderSafeMarkdown(markdown);
  return root;
}

describe("renderSafeMarkdown", () => {
  it("renders GFM code, tables, task lists, and quotes", () => {
    const root = rendered([
      "> nota",
      "",
      "- [x] validado",
      "",
      "| Campo | Valor |",
      "| --- | --- |",
      "| alvo | 192.0.2.10 |",
      "",
      "```html",
      "<script>alert(1)</script>",
      "```",
    ].join("\n"));

    expect(root.querySelector("blockquote")?.textContent).toContain("nota");
    expect(root.querySelector("input[type='checkbox']")).toBeDisabled();
    expect(root.querySelector("table")?.textContent).toContain("192.0.2.10");
    expect(root.querySelector("pre code")?.textContent).toBe("<script>alert(1)</script>");
    expect(root.querySelector("pre script")).toBeNull();
  });

  it("renders raw HTML as inert text and removes executable markup", () => {
    const root = rendered([
      "<script>window.compromised = true</script>",
      '<img src="/api/image" onerror="window.compromised = true">',
      '<iframe src="https://tracker.example"></iframe>',
    ].join("\n"));

    expect(root.querySelector("script, iframe, img")).toBeNull();
    expect(root.querySelector("[onerror], [onclick], [onload]")).toBeNull();
    expect(root.textContent).toContain("<script>");
    expect(root.textContent).toContain("onerror");
  });

  it("blocks dangerous link schemes and marks allowed external links", () => {
    const root = rendered([
      "[perigoso](javascript:alert(1))",
      "[externo](https://example.com/report)",
      "[interno](/redmode/engagements/acme)",
    ].join("\n\n"));

    expect(root.querySelector("a[href^='javascript:']")).toBeNull();
    expect(root.querySelector(".markdown-link-blocked")?.textContent).toBe("perigoso");
    const external = root.querySelector<HTMLAnchorElement>("a[data-external-link='true']");
    expect(external).toHaveAttribute("target", "_blank");
    expect(external?.rel).toContain("noopener");
    expect(external?.rel).toContain("noreferrer");
    expect(root.querySelector("a[data-router-link='true']")).toHaveAttribute(
      "href",
      "/redmode/engagements/acme",
    );
  });

  it("allows only same-origin authenticated API images", () => {
    const root = rendered([
      "![privada](/api/redmode/projects/acme/evidence/file-1)",
      "![tracker](https://tracker.example/pixel.png)",
      "![dados](data:image/png;base64,AAAA)",
    ].join("\n\n"));

    const images = root.querySelectorAll("img");
    expect(images).toHaveLength(1);
    expect(images[0]).toHaveAttribute("src", "/api/redmode/projects/acme/evidence/file-1");
    expect(images[0]).toHaveAttribute("referrerpolicy", "no-referrer");
    expect(root.querySelectorAll(".markdown-image-blocked")).toHaveLength(2);
  });
});

describe("Markdown URL policy", () => {
  it("classifies internal, external, and dangerous schemes", () => {
    expect(classifyMarkdownUrl("/redmode").kind).toBe("internal");
    expect(classifyMarkdownUrl("https://example.com").kind).toBe("external");
    expect(classifyMarkdownUrl("mailto:analyst@example.com").kind).toBe("email");
    expect(classifyMarkdownUrl("javascript:alert(1)").kind).toBe("blocked");
    expect(classifyMarkdownUrl("JaVaScRiPt:alert(1)").kind).toBe("blocked");
    expect(classifyMarkdownUrl("data:text/html,<script>alert(1)</script>").kind).toBe("blocked");
    expect(classifyMarkdownUrl("vbscript:msgbox(1)").kind).toBe("blocked");
    expect(classifyMarkdownUrl("//tracker.example/pixel").kind).toBe("blocked");
  });

  it("recognizes only authenticated same-origin image paths", () => {
    expect(isAuthenticatedImageUrl("/api/redmode/file/1")).toBe(true);
    expect(isAuthenticatedImageUrl("/public/image.png")).toBe(false);
    expect(isAuthenticatedImageUrl("https://tracker.example/pixel.png")).toBe(false);
  });
});
