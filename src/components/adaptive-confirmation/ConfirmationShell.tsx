"use client";

import { useSellerFlow } from "@/context/SellerFlowContext";
import { ShareListingPanel } from "@/components/social/ShareListingPanel";
import { ShareSpintaButton } from "@/components/social/ShareSpintaButton";
import { ListingSuccessLottie } from "@/components/listing/ListingSuccessLottie";
import { getChameleonTheme } from "@/lib/chameleon-themes";
import { cn } from "@/lib/cn";

/** Post-publish celebration — Lottie success + share + dismiss. */
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
              Pasidalykite socialiniuose tinkluose — papildoma reklama
            </p>
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
