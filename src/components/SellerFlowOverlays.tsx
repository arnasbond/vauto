"use client";

import { AiProcessingOverlay } from "@/components/AiProcessingOverlay";
import { AiConfirmationScreen } from "@/components/AiConfirmationScreen";
import { usePathname } from "next/navigation";

export function SellerFlowOverlays() {
  const pathname = usePathname();
  const onAdd =
    pathname === "/add" ||
    pathname === "/add/" ||
    pathname.startsWith("/add/");

  return (
    <>
      <AiProcessingOverlay />
      {onAdd && <AiConfirmationScreen mode="overlay" />}
    </>
  );
}
