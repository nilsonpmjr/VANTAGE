import { useEffect, useMemo } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Bold,
  Heading1,
  Heading2,
  Image as ImageIcon,
  Italic,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Strikethrough,
  Underline as UnderlineIcon,
  Undo2,
} from "lucide-react";
import { cn } from "../../lib/utils";

const ALLOWED_TAGS = new Set([
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "del",
  "ul",
  "ol",
  "li",
  "blockquote",
  "h1",
  "h2",
  "h3",
  "code",
  "pre",
  "img",
]);

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function hasHtmlMarkup(value: string) {
  return /<\/?[a-z][\s\S]*>/i.test(value);
}

function plainTextToHtml(value: string) {
  const normalized = value.trim();
  if (!normalized) return "<p></p>";

  return normalized
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${paragraph.split("\n").map(escapeHtml).join("<br />")}</p>`)
    .join("");
}

function isSafeImageSrc(src: string) {
  return /^(https?:\/\/|data:image\/)/i.test(src);
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("invalid_image_result"));
    };
    reader.onerror = () => reject(reader.error || new Error("image_read_failed"));
    reader.readAsDataURL(file);
  });
}

function sanitizeNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return escapeHtml(node.textContent || "");
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return "";
  }

  const element = node as HTMLElement;
  const tag = element.tagName.toLowerCase();
  const children = Array.from(element.childNodes).map(sanitizeNode).join("");

  if (!ALLOWED_TAGS.has(tag)) {
    return children;
  }

  if (tag === "br") {
    return "<br />";
  }

  if (tag === "img") {
    const src = element.getAttribute("src") || "";
    if (!isSafeImageSrc(src)) return "";

    const alt = element.getAttribute("alt") || "";
    return `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" />`;
  }

  return `<${tag}>${children}</${tag}>`;
}

export function sanitizeHandoffBodyHtml(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "<p></p>";

  if (!hasHtmlMarkup(trimmed) || typeof document === "undefined") {
    return plainTextToHtml(trimmed);
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(trimmed, "text/html");
  return Array.from(doc.body.childNodes).map(sanitizeNode).join("") || "<p></p>";
}

export function handoffBodyHasMeaningfulContent(value: string) {
  const sanitized = sanitizeHandoffBodyHtml(value);
  if (typeof document === "undefined") {
    return sanitized.replace(/<[^>]+>/g, "").trim().length > 0;
  }
  const parser = new DOMParser();
  const doc = parser.parseFromString(sanitized, "text/html");
  const text = doc.body.textContent?.trim() || "";
  const hasImage = doc.body.querySelector("img") !== null;
  return text.length > 0 || hasImage;
}

type HandoffRichTextEditorProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  imagePromptLabel: string;
  onImageFilesPasted?: (count: number) => void;
  labels: {
    bold: string;
    italic: string;
    underline: string;
    strike: string;
    headingOne: string;
    headingTwo: string;
    bulletList: string;
    orderedList: string;
    quote: string;
    undo: string;
    redo: string;
    image: string;
  };
};

function ToolbarButton({
  active,
  disabled,
  title,
  onClick,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn("handoff-rich-editor-button", active && "handoff-rich-editor-button-active")}
      title={title}
      aria-label={title}
    >
      {children}
    </button>
  );
}

export function HandoffRichTextEditor({
  value,
  onChange,
  placeholder,
  imagePromptLabel,
  onImageFilesPasted,
  labels,
}: HandoffRichTextEditorProps) {
  const normalizedValue = useMemo(() => sanitizeHandoffBodyHtml(value), [value]);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2],
        },
      }),
      Underline,
      Image.configure({
        allowBase64: true,
      }),
      Placeholder.configure({
        placeholder,
      }),
    ],
    content: normalizedValue,
    editorProps: {
      attributes: {
        class: "handoff-rich-editor-content",
      },
      handlePaste: (_view, event) => {
        const imageFiles = Array.from(event.clipboardData?.files || []).filter((file) =>
          file.type.startsWith("image/"),
        );
        if (!imageFiles.length) return false;
        event.preventDefault();
        void Promise.all(imageFiles.map(readFileAsDataUrl)).then((sources) => {
          sources.forEach((src) => {
            editor?.chain().focus().setImage({ src }).run();
          });
          onImageFilesPasted?.(sources.length);
        });
        return true;
      },
      handleDrop: (_view, event) => {
        const imageFiles = Array.from(event.dataTransfer?.files || []).filter((file) =>
          file.type.startsWith("image/"),
        );
        if (!imageFiles.length) return false;
        event.preventDefault();
        void Promise.all(imageFiles.map(readFileAsDataUrl)).then((sources) => {
          sources.forEach((src) => {
            editor?.chain().focus().setImage({ src }).run();
          });
          onImageFilesPasted?.(sources.length);
        });
        return true;
      },
    },
    onUpdate: ({ editor: nextEditor }) => {
      onChange(nextEditor.getHTML());
    },
    immediatelyRender: false,
  });

  useEffect(() => {
    if (!editor) return;
    if (editor.getHTML() === normalizedValue) return;
    editor.commands.setContent(normalizedValue, { emitUpdate: false });
  }, [editor, normalizedValue]);

  if (!editor) {
    return (
      <div className="handoff-rich-editor-shell">
        <div className="handoff-rich-editor-content min-h-[180px]" />
      </div>
    );
  }

  return (
    <div className="handoff-rich-editor-shell">
      <div className="handoff-rich-editor-toolbar">
        <ToolbarButton title={labels.bold} active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton title={labels.italic} active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Italic className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton title={labels.underline} active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}>
          <UnderlineIcon className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton title={labels.strike} active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}>
          <Strikethrough className="w-4 h-4" />
        </ToolbarButton>
        <span className="handoff-rich-editor-separator" />
        <ToolbarButton title={labels.headingOne} active={editor.isActive("heading", { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
          <Heading1 className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton title={labels.headingTwo} active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
          <Heading2 className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton title={labels.bulletList} active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <List className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton title={labels.orderedList} active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          <ListOrdered className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton title={labels.quote} active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
          <Quote className="w-4 h-4" />
        </ToolbarButton>
        <span className="handoff-rich-editor-separator" />
        <ToolbarButton
          title={labels.image}
          onClick={() => {
            const src = window.prompt(imagePromptLabel);
            if (!src?.trim()) return;
            editor.chain().focus().setImage({ src: src.trim() }).run();
          }}
        >
          <ImageIcon className="w-4 h-4" />
        </ToolbarButton>
        <span className="handoff-rich-editor-separator" />
        <ToolbarButton title={labels.undo} disabled={!editor.can().chain().focus().undo().run()} onClick={() => editor.chain().focus().undo().run()}>
          <Undo2 className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton title={labels.redo} disabled={!editor.can().chain().focus().redo().run()} onClick={() => editor.chain().focus().redo().run()}>
          <Redo2 className="w-4 h-4" />
        </ToolbarButton>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}

export function HandoffRichTextContent({
  body,
  className,
}: {
  body: string;
  className?: string;
}) {
  const html = useMemo(() => sanitizeHandoffBodyHtml(body), [body]);

  return <div className={cn("handoff-rich-text-render", className)} dangerouslySetInnerHTML={{ __html: html }} />;
}
