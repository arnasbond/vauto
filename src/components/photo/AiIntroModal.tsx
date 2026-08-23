"use client";

import { Sparkles, X } from "lucide-react";

const STORAGE_KEY = "vauto-ai-photo-intro-dismissed";

export function hasSeenAiIntro(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(STORAGE_KEY) === "1";
}

export function markAiIntroSeen(): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, "1");
}

interface AiIntroModalProps {
  open: boolean;
  onClose: () => void;
  onStartAi: () => void;
}

export function AiIntroModal({ open, onClose, onStartAi }: AiIntroModalProps) {
  if (!open) return null;

  const dismiss = () => {
    markAiIntroSeen();
    onClose();
  };

  const startAi = () => {
    markAiIntroSeen();
    onStartAi();
  };

  return (
    <div
      className="fixed inset-0 z-[225] flex items-center justify-center bg-[var(--ds-overlay)] p-4"
      role="dialog"
      aria-modal="true"
      aria-label="AI skelbimo pagalba"
    >
      <div className="relative w-full max-w-sm rounded-2xl bg-[var(--ds-surface-elevated)] p-6 text-[var(--ds-text-primary)] shadow-xl">
        <button
          type="button"
          onClick={dismiss}
          className="absolute right-4 top-4 text-[var(--ds-text-muted)] hover:text-[var(--ds-text-primary)]"
          aria-label="Uždaryti"
        >
          <X className="h-5 w-5" />
        </button>

        <h2 className="font-display text-center text-lg font-bold text-[var(--ds-text-primary)]">
          Norite skelbti greitai ir paprastai?
        </h2>

        <div className="mx-auto mt-5 flex h-28 w-28 items-center justify-center rounded-2xl bg-[var(--ds-ai-soft)]">
          <Sparkles className="h-12 w-12 text-[var(--ds-ai)]" />
        </div>

        <p className="mt-5 text-center text-sm leading-relaxed text-[var(--ds-text-secondary)]">
          Pridėkite nuotraukas — likusią dalį padarys AI: pavadinimą, kategoriją
          ir aprašymą.
        </p>

        <button
          type="button"
          onClick={startAi}
          className="mt-6 w-full rounded-xl bg-[var(--ds-ai)] py-3.5 text-sm font-semibold text-[var(--ds-ai-contrast)] shadow-sm transition hover:opacity-90"
        >
          Taip, pradėkime
        </button>
        <button
          type="button"
          onClick={dismiss}
          className="mt-2 w-full rounded-xl border border-[var(--ds-border-strong)] py-3.5 text-sm font-semibold text-[var(--ds-text-primary)] transition hover:bg-[var(--ds-surface-muted)]"
        >
          Ne, tęsti kaip įprasta
        </button>
      </div>
    </div>
  );
}
