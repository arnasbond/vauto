"use client";

import { Check } from "lucide-react";
import { useSellerFlow } from "@/context/SellerFlowContext";
import { ShareListingPanel } from "@/components/social/ShareListingPanel";
import { ShareSpintaButton } from "@/components/social/ShareSpintaButton";
import { getChameleonTheme } from "@/lib/chameleon-themes";
import { cn } from "@/lib/cn";

/** Post-publish celebration — share + dismiss. No classic form wizard shell. */
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
            "mx-4 my-6 w-full max-w-md rounded-3xl p-6 text-left transition-colors duration-300 sm:p-8 md:max-w-lg lg:max-w-xl",
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
