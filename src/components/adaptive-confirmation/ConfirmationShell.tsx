"use client";

import { Check, Sparkles, X } from "lucide-react";
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
  needsPrice,
  canPublish,
  publishLabel,
  onCancel,
  onPublish,
  assistantPrompt,
  children,
}: ConfirmationShellProps) {
  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center">
      <div
        className={`max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl p-6 shadow-2xl sm:rounded-3xl transition-colors duration-300 ${
          config.layout === "tag-social"
            ? "bg-gradient-to-b from-[#1a1f2e] to-[#252b3d]"
            : "bg-[#1e293b]"
        }`}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-white">AI patvirtinimas</h2>
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold tracking-wide text-[var(--vauto-orange)]">
                {config.label}
              </span>
              <span className="text-[10px] text-slate-500">· {config.portalStyle}</span>
            </div>
            <p className="mt-1 flex items-center gap-1 text-xs text-slate-400">
              <Sparkles className="h-3 w-3 text-[var(--vauto-teal)]" />
              Pasitikėjimas {Math.round(draft.confidence * 100)}%
              {needsPrice && (
                <span className="ml-2 text-amber-400">· Reikia kainos</span>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full p-2 text-slate-400 hover:bg-white/10"
            aria-label="Atšaukti"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {assistantPrompt}

        {previewImage && (
          <div className="mb-4 overflow-hidden rounded-xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewImage}
              alt="Jūsų nuotrauka"
              className={`w-full object-cover ${
                config.layout === "tag-social" ? "h-48" : "h-40"
              }`}
            />
          </div>
        )}

        {children}

        <button
          type="button"
          onClick={onPublish}
          disabled={!canPublish}
          className="mt-6 w-full rounded-2xl bg-[var(--vauto-orange)] py-4 text-sm font-semibold text-white shadow-lg transition hover:bg-[var(--vauto-orange-light)] disabled:opacity-50"
        >
          {publishLabel}
        </button>
      </div>
    </div>
  );
}

export function PublishedOverlay() {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="mx-6 rounded-3xl bg-[#1e293b] p-8 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-500/20">
          <Check className="h-8 w-8 text-green-400" />
        </div>
        <h2 className="text-lg font-semibold text-white">Skelbimas paskelbtas!</h2>
      </div>
    </div>
  );
}
