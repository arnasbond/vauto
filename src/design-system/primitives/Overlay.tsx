"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cn } from "../utils";
import { Button } from "./Button";

export type TooltipProps = {
  content: ReactNode;
  children: ReactNode;
  className?: string;
};

export function Tooltip({ content, children, className }: TooltipProps) {
  const [open, setOpen] = useState(false);
  return (
    <span
      className={cn("relative inline-flex", className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      {open ? (
        <span
          role="tooltip"
          className="absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 whitespace-nowrap rounded-[var(--ds-radius-sm)] bg-[var(--ds-surface-inverse)] px-2 py-1 text-[length:var(--ds-text-caption-size)] text-[var(--ds-text-inverse)] shadow-[var(--ds-shadow-sm)]"
        >
          {content}
        </span>
      ) : null}
    </span>
  );
}

export type DropdownItem = {
  id: string;
  label: string;
  danger?: boolean;
  disabled?: boolean;
};

export type DropdownMenuProps = {
  label: string;
  items: DropdownItem[];
  onSelect: (id: string) => void;
  className?: string;
};

export function DropdownMenu({
  label,
  items,
  onSelect,
  className,
}: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={cn("relative inline-block", className)}>
      <Button
        variant="secondary"
        size="sm"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {label}
      </Button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 min-w-44 overflow-hidden rounded-[var(--ds-radius-card)] border border-[var(--ds-border-subtle)] bg-[var(--ds-surface-elevated)] py-1 shadow-[var(--ds-shadow-md)]"
        >
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              className={cn(
                "ds-focusable flex w-full px-3 py-2 text-left text-[length:var(--ds-text-body-sm-size)] transition-colors duration-[var(--ds-duration-fast)] disabled:opacity-50",
                item.danger
                  ? "text-[var(--ds-danger)] hover:bg-[var(--ds-danger-soft)]"
                  : "text-[var(--ds-text-primary)] hover:bg-[var(--ds-surface-muted)]"
              )}
              onClick={() => {
                onSelect(item.id);
                setOpen(false);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export type ModalProps = {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  className?: string;
};

export function Modal({
  open,
  title,
  children,
  onClose,
  footer,
  className,
}: ModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const root = dialogRef.current;
    const previous = document.activeElement as HTMLElement | null;
    const focusables = () => {
      if (!root) return [] as HTMLElement[];
      return [
        ...root.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        ),
      ].filter((el) => !el.hasAttribute("disabled") && el.tabIndex !== -1);
    };
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
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[180] flex items-end justify-center p-4 sm:items-center"
      style={{ background: "var(--ds-overlay)", backdropFilter: "var(--ds-overlay-blur)" }}
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          "w-full max-w-md overflow-y-auto rounded-[var(--ds-radius-panel)] border border-[var(--ds-border-subtle)] bg-[var(--ds-surface-elevated)] p-5 shadow-[var(--ds-shadow-lg)] sm:max-h-[85dvh]",
          className
        )}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 id={titleId} className="ds-h3 text-[length:var(--ds-text-h3-size)]">
            {title}
          </h2>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Uždaryti">
            ✕
          </Button>
        </div>
        <div className="ds-body-sm text-[var(--ds-text-secondary)]">{children}</div>
        {footer ? <div className="mt-5 flex justify-end gap-2">{footer}</div> : null}
      </div>
    </div>
  );
}
