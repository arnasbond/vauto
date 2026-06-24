"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useVauto } from "@/context/VautoContext";
import { useZeroUiScreen } from "@/context/ZeroUiScreenContext";

/** Syncs seller confirmation step → Zero-UI listing_preview on home. */
export function ZeroUiSellerBridge() {
  const pathname = usePathname();
  const { sellerStep } = useVauto();
  const { setScreen, currentView } = useZeroUiScreen();
  const onHome = pathname.replace(/\/$/, "") === "" || pathname === "/";

  useEffect(() => {
    if (!onHome) return;
    if (sellerStep === "confirmation" && currentView !== "listing_preview") {
      setScreen("listing_preview", "voice");
    }
  }, [onHome, sellerStep, currentView, setScreen]);

  return null;
}
