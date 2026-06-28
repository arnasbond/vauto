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
      className="fixed inset-0 z-[225] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="AI skelbimo pagalba"
    >
      <div className="relative w-full max-w-sm rounded-2xl bg-[#1e293b] p-6 text-white shadow-xl">
        <button
          type="button"
          onClick={dismiss}
          className="absolute right-4 top-4 text-slate-400 hover:text-slate-200"
          aria-label="Uždaryti"
        >
          <X className="h-5 w-5" />
        </button>

        <h2 className="font-display text-center text-lg font-bold text-white">
          Norite skelbti greitai ir paprastai?
        </h2>

        <div className="mx-auto mt-5 flex h-28 w-28 items-center justify-center rounded-2xl bg-gradient-to-br from-[#1167b1]/30 to-[#0a1128]">
          <Sparkles className="h-12 w-12 text-[#00f2fe]" />
        </div>

        <p className="mt-5 text-center text-sm leading-relaxed text-slate-300">
          Pridėkite nuotraukas — likusią dalį padarys AI: pavadinimą, kategoriją
          ir aprašymą.
        </p>

        <button
          type="button"
          onClick={startAi}
          className="mt-6 w-full rounded-xl bg-[#1167b1] py-3.5 text-sm font-semibold text-white shadow-sm hover:bg-[#0d5a9a]"
        >
          Taip, pradėkime
        </button>
        <button
          type="button"
          onClick={dismiss}
          className="mt-2 w-full rounded-xl border border-slate-600 py-3.5 text-sm font-semibold text-slate-200 hover:bg-slate-700/50"
        >
          Ne, tęsti kaip įprasta
        </button>
      </div>
    </div>
  );
}
