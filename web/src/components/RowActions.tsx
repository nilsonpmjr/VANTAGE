import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal } from "lucide-react";

export type RowActionItem = {
  key: string;
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  tone?: "default" | "danger";
  disabled?: boolean;
  dividerBefore?: boolean;
};

type RowPrimaryActionProps = {
  label: string;
  onClick: () => void;
  icon?: ReactNode;
  disabled?: boolean;
};

type RowActionsMenuProps = {
  items: RowActionItem[];
  label?: string;
};

type FloatingMenuPosition = {
  top: number;
  left: number;
};

const VIEWPORT_PADDING = 8;

export function RowPrimaryAction({
  label,
  onClick,
  icon,
  disabled = false,
}: RowPrimaryActionProps) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="row-primary-action">
      {icon}
      {label}
    </button>
  );
}

export function RowActionsMenu({
  items,
  label = "Row actions",
}: RowActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<FloatingMenuPosition>({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function updatePosition() {
      const triggerRect = triggerRef.current?.getBoundingClientRect();
      if (!triggerRect) return;

      const menuRect = menuRef.current?.getBoundingClientRect();
      const menuWidth = menuRect?.width || 208;
      const menuHeight = menuRect?.height || Math.max(160, items.length * 44);
      const spaceBelow = window.innerHeight - triggerRect.bottom;
      const openUp = spaceBelow < menuHeight + 12 && triggerRect.top > spaceBelow;
      const left = Math.min(
        Math.max(VIEWPORT_PADDING, triggerRect.right - menuWidth),
        window.innerWidth - menuWidth - VIEWPORT_PADDING,
      );
      const top = openUp
        ? Math.max(VIEWPORT_PADDING, triggerRect.top - menuHeight - 6)
        : Math.min(window.innerHeight - menuHeight - VIEWPORT_PADDING, triggerRect.bottom + 6);

      setPosition({ top, left });
    }

    updatePosition();
    const raf = window.requestAnimationFrame(updatePosition);

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      const clickedTrigger = rootRef.current?.contains(target);
      const clickedMenu = menuRef.current?.contains(target);
      if (!clickedTrigger && !clickedMenu) {
        setOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.cancelAnimationFrame(raf);
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [items.length, open]);

  return (
    <div ref={rootRef} className="row-actions-menu-root">
      <button
        ref={triggerRef}
        type="button"
        className="row-actions-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((current) => !current)}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            className="row-actions-menu-floating"
            role="menu"
            aria-label={label}
            style={{ top: `${position.top}px`, left: `${position.left}px` }}
          >
            {items.map((item) => (
              <div key={item.key}>
                {item.dividerBefore && <div className="row-actions-divider" />}
                <button
                  type="button"
                  role="menuitem"
                  disabled={item.disabled}
                  onClick={() => {
                    if (item.disabled) return;
                    item.onSelect();
                    setOpen(false);
                  }}
                  className={`row-actions-item ${
                    item.tone === "danger" ? "row-actions-item-danger" : ""
                  }`}
                >
                  {item.icon && <span className="row-actions-item-icon">{item.icon}</span>}
                  <span>{item.label}</span>
                </button>
              </div>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
