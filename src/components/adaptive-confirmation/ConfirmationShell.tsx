"use client";

import { ListingPublishSocialOptions } from "@/components/seller/ListingPublishSocialOptions";
import { ListingValidationBanner, LISTING_PUBLISH_CTA } from "@/components/listing/ListingValidationBanner";
import { Check, X } from "lucide-react";
import type { ReactNode } from "react";
import type { AdaptiveCategoryConfig } from "@/lib/adaptive-categories";
import type { AiExtractedListing } from "@/lib/types";
import { useVauto } from "@/context/VautoContext";
import { useSellerFlow } from "@/context/SellerFlowContext";
import { ShareListingPanel } from "@/components/social/ShareListingPanel";
import { ShareSpintaButton } from "@/components/social/ShareSpintaButton";
import { getChameleonTheme } from "@/lib/chameleon-themes";
import { cn } from "@/lib/cn";

interface ConfirmationShellProps {
  config: AdaptiveCategoryConfig;
  draft: AiExtractedListing;
  needsPrice: boolean;
  canPublish: boolean;
  publishLabel?: string;
  validationIssues?: string[];
  onCancel: () => void;
  onPublish: () => void;
  assistantPrompt?: ReactNode;
  children: ReactNode;
}

export function ConfirmationShell({
  config,
  draft,
  canPublish,
  publishLabel = LISTING_PUBLISH_CTA,
  validationIssues = [],
  onCancel,
  onPublish,
  assistantPrompt,
  children,
}: ConfirmationShellProps) {
  const { chameleonTheme } = useVauto();
  const theme = getChameleonTheme(chameleonTheme);
  const t = theme.confirmation;

  return (
    <div className={cn("listing-wizard-overlay p-6 transition-colors duration-300", t.shell)}>
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

        <ListingPublishSocialOptions className="mt-4" />

        {!canPublish && validationIssues.length > 0 && (
          <ListingValidationBanner issues={validationIssues} className="mt-4" />
        )}

        <button
          type="button"
          onClick={onPublish}
          disabled={!canPublish}
          className={cn(
            "mt-4 w-full rounded-xl p-3 font-bold transition duration-300",
            t.publishBtn,
            t.publishBtnDisabled
          )}
        >
          {publishLabel}
        </button>
        </div>
    </div>
  );
}

export function PublishedOverlay() {
  const { lastPublishedListing, finishPublishedFlow } = useSellerFlow();
  const theme = getChameleonTheme("flux");
  const p = theme.published;

  return (
    <div
      className={cn(
        "listing-wizard-overlay backdrop-blur-lg transition-colors duration-300",
        p.shell
      )}
    >
      <div className="flex min-h-full items-center justify-center p-4">
        <div
          className={cn(
            "mx-4 my-6 w-full max-w-md rounded-3xl p-6 text-left transition-colors duration-300 sm:p-8",
            p.card
          )}
        >
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-500/20">
            <Check className="h-6 w-6 text-emerald-500" />
          </div>
          <div>
            <h2 className={cn("text-lg font-semibold text-emerald-600", p.title)}>
              Skelbimas sėkmingai įkeltas!
            </h2>
            <p className={cn("text-xs text-[var(--vauto-text-muted)]")}>
              Pasidalykite socialiniuose tinkluose — papildoma reklama
            </p>
          </div>
        </div>

        {lastPublishedListing && (
          <>
            <ShareSpintaButton listing={lastPublishedListing} className="mb-4" />
            <ShareListingPanel listing={lastPublishedListing} className="mb-4" compact />
          </>
        )}

        <button
          type="button"
          onClick={finishPublishedFlow}
          className="w-full rounded-xl bg-[var(--vauto-teal)] py-3 text-sm font-semibold text-white"
        >
          Baigti
        </button>
        </div>
      </div>
    </div>
  );
}
