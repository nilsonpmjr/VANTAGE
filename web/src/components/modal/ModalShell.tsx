import { useEffect, useId, type ReactNode } from "react";
import { motion } from "motion/react";
import { X } from "lucide-react";
import { cn } from "../../lib/utils";

type ModalShellProps = {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  variant?: "dialog" | "editor";
  className?: string;
  bodyClassName?: string;
  headerClassName?: string;
  footerClassName?: string;
  closeOnOverlayClick?: boolean;
  closeOnEscape?: boolean;
  ariaLabel?: string;
};

const variantClasses: Record<NonNullable<ModalShellProps["variant"]>, string> = {
  dialog: "max-w-2xl",
  editor: "max-w-4xl",
};

export default function ModalShell({
  title,
  description,
  icon,
  children,
  footer,
  onClose,
  variant = "dialog",
  className,
  bodyClassName,
  headerClassName,
  footerClassName,
  closeOnOverlayClick = true,
  closeOnEscape = true,
  ariaLabel = "Close modal",
}: ModalShellProps) {
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!closeOnEscape) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [closeOnEscape, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={closeOnOverlayClick ? onClose : undefined}
        className="absolute inset-0 bg-inverse-surface/80 backdrop-blur-sm"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className={cn(
          "modal-surface relative flex max-h-[90vh] w-full flex-col overflow-hidden",
          variantClasses[variant],
          className,
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          className={cn(
            "flex items-start justify-between gap-4 border-b border-outline-variant/10 bg-surface-container-lowest px-6 py-5 shrink-0",
            headerClassName,
          )}
        >
          <div className="min-w-0">
            {icon ? <div className="page-eyebrow">{icon}</div> : null}
            <h2 id={titleId} className="mt-2 text-xl font-extrabold tracking-tight text-on-surface">
              {title}
            </h2>
            {description ? (
              <p id={descriptionId} className="mt-2 max-w-2xl text-sm text-on-surface-variant">
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            aria-label={ariaLabel}
            onClick={onClose}
            className="btn btn-ghost !px-2"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className={cn("overflow-y-auto px-6 py-6", bodyClassName)}>{children}</div>

        {footer ? (
          <div
            className={cn(
              "flex flex-wrap items-center justify-end gap-3 border-t border-outline-variant/10 bg-surface-container-lowest px-6 py-5 shrink-0",
              footerClassName,
            )}
          >
            {footer}
          </div>
        ) : null}
      </motion.div>
    </div>
  );
}
