import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { PublishListingResult } from "@/context/SellerFlowContext";

export async function runPublishSuccessCelebration(opts: {
  result: PublishListingResult;
  sourceRect: DOMRect;
  playCelebration: (rect: DOMRect) => Promise<void>;
  finishPublishedFlow: () => void;
  router: AppRouterInstance;
}): Promise<PublishListingResult> {
  if (!opts.result.ok) return opts.result;
  await opts.playCelebration(opts.sourceRect);
  opts.finishPublishedFlow();
  opts.router.push("/mano-skelbimai/");
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
