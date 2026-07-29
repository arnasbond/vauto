"use client";

import { useEffect, useState } from "react";
import { useSellerFlow } from "@/context/SellerFlowContext";
import { ShareListingModal } from "@/components/social/ShareListingModal";
import { ListingSuccessLottie } from "@/components/listing/ListingSuccessLottie";
import { getChameleonTheme } from "@/lib/chameleon-themes";
import { cn } from "@/lib/cn";

/** Post-publish celebration — Lottie success + non-blocking Share Modal. */
export function PublishedOverlay() {
  const { lastPublishedListing, finishPublishedFlow } = useSellerFlow();
  const theme = getChameleonTheme("flux");
  const p = theme.published;
  const [shareOpen, setShareOpen] = useState(true);

  useEffect(() => {
    setShareOpen(true);
  }, [lastPublishedListing?.id]);

  const dismissAll = () => {
    setShareOpen(false);
    finishPublishedFlow();
  };

  return (
    <div
      className={cn(
        "listing-wizard-overlay backdrop-blur-lg transition-colors duration-300",
        p.shell
      )}
    >
      <div className="flex min-h-full items-center justify-center overflow-x-hidden p-4">
        <div
          className={cn(
            "mx-4 my-6 w-full max-w-md overflow-hidden rounded-3xl p-6 text-left transition-colors duration-300 sm:p-8 md:max-w-lg lg:max-w-xl",
            p.card
          )}
        >
          <div className="mb-4 flex flex-col items-center text-center">
            <ListingSuccessLottie className="mb-2" />
            <h2 className={cn("text-lg font-semibold text-emerald-600", p.title)}>
              Skelbimas sėkmingai įkeltas!
            </h2>
            <p className={cn("mt-1 text-xs text-[var(--vauto-text-muted)]")}>
              Pasidalykite dabar — arba praleiskite ir grįžkite vėliau.
            </p>
          </div>

          {lastPublishedListing && (
            <button
              type="button"
              onClick={() => setShareOpen(true)}
              className="mb-3 w-full rounded-xl border border-[var(--vauto-border)] bg-[var(--vauto-surface)] py-3 text-sm font-semibold text-[var(--vauto-text)]"
            >
              Atidaryti dalijimosi langą
            </button>
          )}

          <button
            type="button"
            onClick={dismissAll}
            className="w-full rounded-xl bg-[var(--vauto-teal)] py-3 text-sm font-semibold text-white"
          >
            Baigti
          </button>
        </div>
      </div>

      {lastPublishedListing && (
        <ShareListingModal
          listing={lastPublishedListing}
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          skipLabel="Praleisti — vėliau"
        />
      )}
    </div>
  );
}
