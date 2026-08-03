import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { PublishListingResult } from "@/context/SellerFlowContext";
import type { CheckoutSession } from "@/lib/monetization-catalog";
import type { Listing } from "@/lib/types";

export async function runPublishSuccessCelebration(opts: {
  result: PublishListingResult;
  sourceRect: DOMRect;
  playCelebration: (rect: DOMRect) => Promise<void>;
  finishPublishedFlow: () => void;
  router: AppRouterInstance;
  /** Clears agent publish flags and appends terminal success bubble. */
  resetPublishSession?: () => void;
  /** Wipe AI chat + draft so the next sell starts pristine. */
  beginFreshListingChatSession?: () => void;
  /** Open paid visibility checkout after navigation (dashboard context). */
  openCheckout?: (session: CheckoutSession) => void;
  /**
   * Post-publish Share Modal — peak motivation window.
   * Resolves when seller shares or taps Skip; then we navigate.
   */
  presentPostPublishShare?: (listing: Listing) => Promise<void>;
}): Promise<PublishListingResult> {
  if (!opts.result.ok) return opts.result;

  const listing = opts.result.listing;

  // Hard purge: PrePublish + AI chat/draft/photos immediately on success.
  opts.resetPublishSession?.();
  opts.beginFreshListingChatSession?.();
  opts.finishPublishedFlow();
  await opts.playCelebration(opts.sourceRect);

  // Share Modal BEFORE navigation — otherwise PublishedOverlay never mounts.
  if (opts.presentPostPublishShare && listing) {
    try {
      await opts.presentPostPublishShare(listing);
    } catch {
      /* share dismiss must never block navigation */
    }
  }

  opts.router.push("/mano-skelbimai/");

  if (opts.result.visibilityCheckout && opts.openCheckout) {
    const checkout = opts.result.visibilityCheckout;
    window.setTimeout(() => {
      opts.openCheckout!(checkout);
    }, 400);
  }

  return opts.result;
}

export function centerScreenPublishRect(): DOMRect {
  return new DOMRect(
    window.innerWidth / 2,
    window.innerHeight * 0.62,
    0,
    0
  );
}
