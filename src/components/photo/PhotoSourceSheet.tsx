"use client";

import { Camera, ChevronRight, FolderOpen, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

interface PhotoSourceSheetProps {
  open: boolean;
  onClose: () => void;
  onSelect: (source: "camera" | "gallery") => void;
}

export function PhotoSourceSheet({
  open,
  onClose,
  onSelect,
}: PhotoSourceSheetProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[10001] flex items-end justify-center bg-[var(--ds-overlay)] p-0"
      role="dialog"
      aria-modal="true"
      aria-label="Pridėti failą"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-t-2xl bg-[var(--ds-surface-card)] px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-[var(--ds-text-primary)]">
            Pridėti failą
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--ds-text-muted)] hover:bg-[var(--ds-surface-muted)]"
            aria-label="Uždaryti"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <button
          type="button"
          onClick={() => onSelect("camera")}
          className="mb-2 flex w-full items-center gap-3 rounded-xl border border-[var(--ds-border-subtle)] px-4 py-3.5 text-left transition hover:bg-[var(--ds-surface-muted)]"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--ds-brand-soft)] text-[var(--ds-brand)]">
            <Camera className="h-5 w-5" />
          </span>
          <span className="flex-1 text-sm font-medium text-[var(--ds-text-primary)]">
            Fotografuoti
          </span>
          <ChevronRight className="h-5 w-5 text-[var(--ds-text-muted)]" />
        </button>

        <button
          type="button"
          onClick={() => onSelect("gallery")}
          className="flex w-full items-center gap-3 rounded-xl border border-[var(--ds-border-subtle)] px-4 py-3.5 text-left transition hover:bg-[var(--ds-surface-muted)]"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--ds-brand-soft)] text-[var(--ds-brand)]">
            <FolderOpen className="h-5 w-5" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-sm font-medium text-[var(--ds-text-primary)]">
              Failai ir galerija
            </span>
            <span className="text-[11px] text-[var(--ds-text-muted)]">
              Nuotraukos, PDF, CV, Documents, Downloads
            </span>
          </span>
          <ChevronRight className="h-5 w-5 text-[var(--ds-text-muted)]" />
        </button>
      </div>
    </div>,
    document.body
  );
}
