"use client";

import { Check, X } from "lucide-react";
import type { ReactNode } from "react";
import type { AdaptiveCategoryConfig } from "@/lib/adaptive-categories";
import type { AiExtractedListing } from "@/lib/types";

interface ConfirmationShellProps {
  config: AdaptiveCategoryConfig;
  draft: AiExtractedListing;
  previewImage: string | null;
  needsPrice: boolean;
  canPublish: boolean;
  publishLabel: string;
  onCancel: () => void;
  onPublish: () => void;
  assistantPrompt?: ReactNode;
  children: ReactNode;
}

export function ConfirmationShell({
  config,
  draft,
  previewImage,
  canPublish,
  publishLabel,
  onCancel,
  onPublish,
  assistantPrompt,
  children,
}: ConfirmationShellProps) {
  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-[#0f172a] p-6">
      <div className="mx-auto max-w-md rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <span className="rounded-full bg-[var(--vauto-teal)]/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-[var(--vauto-teal)]">
            Atpažinta: {config.label} skelbimas
          </span>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full p-1.5 text-white/40 hover:bg-white/10 hover:text-white"
            aria-label="Atšaukti"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <h2 className="text-xl font-bold text-white">Patikrinkite skelbimo duomenis</h2>
        <p className="mb-4 text-xs text-white/40">
          AI automatiškai sugeneravo struktūrą pagal {config.portalStyle} specifiką ·
          pasitikėjimas {Math.round(draft.confidence * 100)}%
        </p>

        {assistantPrompt}

        {previewImage && (
          <div className="mb-4 overflow-hidden rounded-xl border border-white/5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewImage}
              alt="Jūsų nuotrauka"
              className="h-40 w-full object-cover"
            />
          </div>
        )}

        <div className="flex flex-col gap-4">{children}</div>

        <button
          type="button"
          onClick={onPublish}
          disabled={!canPublish}
          className="mt-6 w-full rounded-xl bg-[var(--vauto-teal)] p-3 font-bold text-[#0f172a] shadow-lg shadow-[var(--vauto-teal)]/20 transition hover:opacity-90 disabled:opacity-40"
        >
          {canPublish ? "Viskas gerai, publikuoti skelbimą" : publishLabel}
        </button>
      </div>
    </div>
  );
}

export function PublishedOverlay() {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0f172a]/95 backdrop-blur-lg">
      <div className="mx-6 max-w-sm rounded-3xl border border-white/10 bg-white/5 p-8 text-center backdrop-blur-xl">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--vauto-teal)]/20">
          <Check className="h-8 w-8 text-[var(--vauto-teal)]" />
        </div>
        <h2 className="text-lg font-semibold text-white">Skelbimas paskelbtas!</h2>
      </div>
    </div>
  );
}
