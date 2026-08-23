"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { cn } from "../utils";
import { Button } from "./Button";

/** Which edge the sheet slides from. Bottom = mobile filters/sheets; right = mobile sidebar/drawer. */
export type DrawerSide = "right" | "bottom";

export type DrawerProps = {
  open: boolean;
  side?: DrawerSide;
  title?: string;
  children: ReactNode;
  onClose: () => void;
  /** Called at the end of the exit transition (optional). */
  onCloseComplete?: () => void;
  className?: string;
};

/**
 * VAUTO Drawer / sheet (Stage 17D + 17L organic layout): the touch-first
 * equivalent of a desktop sidebar or persistent filter panel. Slides from the
 * right (mobile navigation / drawers) or bottom (mobile filter sheets).
 * Focus trap, ESC close, backdrop dismiss, aria-modal, reduced-motion aware.
 */
export function Drawer({
  open,
  side = "right",
  title,
  children,
  onClose,
  className,
}: DrawerProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const root = panelRef.current;

    const focusables = () =>
      root
        ? [
            ...root.querySelectorAll<HTMLElement>(
              'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
            ),
          ].filter((el) => !el.hasAttribute("disabled") && el.tabIndex !== -1)
        : [];

    const previous = document.activeElement as HTMLElement | null;
    const list = focusables();
    (list[0] ?? root)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusables();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    // Prevent background scroll while the drawer is open.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);

    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[180] flex bg-black/45 backdrop-blur-md sm:bg-black/40"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        className={cn(
          side === "right" ? "ds-drawer-motion" : "ds-drawer-motion--bottom",
          "flex flex-col border-[var(--ds-border-subtle)] bg-[var(--ds-surface-elevated)] text-[var(--ds-text-primary)] shadow-[var(--ds-shadow-lg)]",
          side === "right"
            ? "ml-auto h-full w-[min(86vw,320px)] border-l"
            : "mt-auto max-h-[86dvh] w-full rounded-t-[var(--ds-radius-panel)] border-t",
          className
        )}
      >
        {title ? (
          <div className="mb-2 flex items-center justify-between gap-3 border-b border-[var(--ds-border-subtle)] p-4">
            <h2 id={titleId} className="ds-label text-[var(--ds-text-primary)]">
              {title}
            </h2>
            <Button variant="ghost" size="sm" iconOnly onClick={onClose} aria-label="Uždaryti">
              ✕
            </Button>
          </div>
        ) : null}
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}
