"use client";

import { Check, X } from "lucide-react";
import type { ReactNode } from "react";
import type { AdaptiveCategoryConfig } from "@/lib/adaptive-categories";
import type { AiExtractedListing } from "@/lib/types";
import { useVauto } from "@/context/VautoContext";
import { getChameleonTheme } from "@/lib/chameleon-themes";
import { cn } from "@/lib/cn";

interface ConfirmationShellProps {
  config: AdaptiveCategoryConfig;
  draft: AiExtractedListing;
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
  canPublish,
  publishLabel,
  onCancel,
  onPublish,
  assistantPrompt,
  children,
}: ConfirmationShellProps) {
  const { chameleonTheme } = useVauto();
  const theme = getChameleonTheme(chameleonTheme);
  const t = theme.confirmation;

  return (
    <div className={cn("fixed inset-0 z-[100] overflow-y-auto p-6 transition-colors duration-300", t.shell)}>
      <div
        className={cn(
          "mx-auto max-w-md rounded-3xl p-6 transition-colors duration-300",
          theme.classicLayout ? theme.panel : "border border-white/10 bg-white/5 backdrop-blur-xl"
        )}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <span className={cn("rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider", t.title)}>
            Atpažinta: {config.label} skelbimas
          </span>
          <button
            type="button"
            onClick={onCancel}
            className={cn("rounded-full p-1.5", t.cancelBtn)}
            aria-label="Atšaukti"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <h2 className={cn("text-xl font-bold", t.subtitle)}>Patikrinkite skelbimo duomenis</h2>
        <p className={cn("mb-4 text-xs", t.subtitle)}>
          AI automatiškai sugeneravo struktūrą pagal {config.label} kategoriją ·
          pasitikėjimas {Math.round(draft.confidence * 100)}%
        </p>

        {assistantPrompt}

        <div className="flex flex-col gap-4">{children}</div>

        <button
          type="button"
          onClick={onPublish}
          disabled={!canPublish}
          className={cn(
            "mt-6 w-full rounded-xl p-3 font-bold transition duration-300",
            t.publishBtn,
            t.publishBtnDisabled
          )}
        >
          {canPublish ? "Viskas gerai, publikuoti skelbimą" : publishLabel}
        </button>
      </div>
    </div>
  );
}

export function PublishedOverlay() {
  const { chameleonTheme } = useVauto();
  const theme = getChameleonTheme(chameleonTheme);
  const p = theme.published;

  return (
    <div
      className={cn(
        "fixed inset-0 z-[100] flex items-center justify-center backdrop-blur-lg transition-colors duration-300",
        p.shell
      )}
    >
      <div className={cn("mx-6 max-w-sm rounded-3xl p-8 text-center transition-colors duration-300", p.card)}>
        <div
          className={cn(
            "mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full",
            chameleonTheme === "flux"
              ? "bg-[var(--vauto-teal)]/20"
              : chameleonTheme === "autoplius"
                ? "bg-[#e8f0fe]"
                : chameleonTheme === "vinted"
                  ? "bg-[#e6f7f6]"
                  : chameleonTheme === "aruodas"
                    ? "bg-[#ffebee]"
                    : "bg-[#e3f2fd]"
          )}
        >
          <Check
            className={cn(
              "h-8 w-8",
              chameleonTheme === "flux"
                ? "text-[var(--vauto-teal)]"
                : chameleonTheme === "autoplius"
                  ? "text-[#1a56db]"
                  : chameleonTheme === "vinted"
                    ? "text-[#09b1a8]"
                    : chameleonTheme === "aruodas"
                      ? "text-[#c62828]"
                      : "text-[#1565c0]"
            )}
          />
        </div>
        <h2 className={cn("text-lg font-semibold", p.title)}>Skelbimas paskelbtas!</h2>
      </div>
    </div>
  );
}
