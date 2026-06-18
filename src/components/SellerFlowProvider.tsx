"use client";

import { SellerFlowOverlays } from "@/components/SellerFlowOverlays";

interface Props {
  children: React.ReactNode;
}

/** Mounts AI/voice overlays once for all pages */
export function SellerFlowProvider({ children }: Props) {
  return (
    <>
      {children}
      <SellerFlowOverlays />
    </>
  );
}
