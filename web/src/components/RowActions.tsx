import { useEffect, useRef, useState, type ReactNode } from "react";
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
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
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
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="row-actions-menu-root">
      <button
        type="button"
        className="row-actions-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((current) => !current)}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {open && (
        <div className="row-actions-menu" role="menu" aria-label={label}>
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
        </div>
      )}
    </div>
  );
}
