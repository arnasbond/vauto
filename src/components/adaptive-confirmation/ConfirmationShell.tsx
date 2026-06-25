"use client";

import { Check, X } from "lucide-react";
import type { ReactNode } from "react";
import type { AdaptiveCategoryConfig } from "@/lib/adaptive-categories";
import type { AiExtractedListing } from "@/lib/types";
import { useVauto } from "@/context/VautoContext";
import { useSellerFlow } from "@/context/SellerFlowContext";
import { ShareListingPanel } from "@/components/social/ShareListingPanel";
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
    <div className={cn("listing-wizard-overlay transition-colors duration-300", t.shell)}>
      <div className="listing-wizard-scroll p-6">
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
    </div>
  );
}

export function PublishedOverlay() {
  const { chameleonTheme } = useVauto();
  const { lastPublishedListing, finishPublishedFlow } = useSellerFlow();
  const theme = getChameleonTheme(chameleonTheme);
  const p = theme.published;

  return (
    <div
      className={cn(
        "listing-wizard-overlay backdrop-blur-lg transition-colors duration-300",
        p.shell
      )}
    >
      <div className="listing-wizard-scroll flex items-center justify-center">
        <div
          className={cn(
            "mx-4 my-6 w-full max-w-md rounded-3xl p-6 text-left transition-colors duration-300 sm:p-8",
            p.card
          )}
        >
        <div className="mb-4 flex items-center gap-3">
          <div
            className={cn(
              "flex h-12 w-12 shrink-0 items-center justify-center rounded-full",
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
                "h-6 w-6",
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
          <div>
            <h2 className={cn("text-lg font-semibold", p.title)}>Skelbimas paskelbtas!</h2>
            <p className={cn("text-xs", p.title, "opacity-70")}>
              Pasidalykite socialiniuose tinkluose — papildoma reklama
            </p>
          </div>
        </div>

        {lastPublishedListing && (
          <ShareListingPanel listing={lastPublishedListing} className="mb-4" />
        )}

        <button
          type="button"
          onClick={finishPublishedFlow}
          className={cn(
            "w-full rounded-xl py-3 text-sm font-semibold",
            chameleonTheme === "flux"
              ? "bg-[var(--vauto-teal)] text-white"
              : "bg-[#1565c0] text-white"
          )}
        >
          Baigti
        </button>
      </div>
      </div>
    </div>
  );
}
