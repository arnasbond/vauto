import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { PublishListingResult } from "@/context/SellerFlowContext";
import type { CheckoutSession } from "@/lib/monetization-catalog";

export async function runPublishSuccessCelebration(opts: {
  result: PublishListingResult;
  sourceRect: DOMRect;
  playCelebration: (rect: DOMRect) => Promise<void>;
  finishPublishedFlow: () => void;
  router: AppRouterInstance;
  /** Clears agent publish flags and appends terminal success bubble. */
  resetPublishSession?: () => void;
  /** Open paid visibility checkout after navigation (dashboard context). */
  openCheckout?: (session: CheckoutSession) => void;
}): Promise<PublishListingResult> {
  if (!opts.result.ok) return opts.result;

  opts.resetPublishSession?.();
  await opts.playCelebration(opts.sourceRect);
  opts.finishPublishedFlow();
  opts.router.push("/mano-skelbimai/");

  if (
    opts.result.ok &&
    opts.result.visibilityCheckout &&
    opts.openCheckout
  ) {
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
