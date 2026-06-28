"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useVauto } from "@/context/VautoContext";
import { useZeroUiScreen } from "@/context/ZeroUiScreenContext";

/** Syncs seller confirmation step → Zero-UI listing_preview on /add only. */
export function ZeroUiSellerBridge() {
  const pathname = usePathname();
  const { sellerStep } = useVauto();
  const { setScreen, currentView } = useZeroUiScreen();
  const onAdd =
    pathname === "/add" ||
    pathname === "/add/" ||
    pathname.startsWith("/add/");

  useEffect(() => {
    if (!onAdd) return;
    if (sellerStep === "confirmation" && currentView !== "listing_preview") {
      setScreen("listing_preview", "voice");
    }
  }, [onAdd, sellerStep, currentView, setScreen]);

  return null;
}
