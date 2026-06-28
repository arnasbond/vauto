"use client";

import { AiProcessingOverlay } from "@/components/AiProcessingOverlay";
import { AiConfirmationScreen } from "@/components/AiConfirmationScreen";
import { useZeroUiScreenOptional } from "@/context/ZeroUiScreenContext";
import { usePathname } from "next/navigation";

export function SellerFlowOverlays() {
  const zeroUi = useZeroUiScreenOptional();
  const pathname = usePathname();
  const onHome = pathname.replace(/\/$/, "") === "" || pathname === "/";
  const inlineListingPreview =
    onHome && zeroUi?.currentView === "listing_preview";

  return (
    <>
      <AiProcessingOverlay />
      {!inlineListingPreview && <AiConfirmationScreen mode="overlay" />}
    </>
  );
}
