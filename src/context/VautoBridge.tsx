"use client";

import { createContext, useContext, type Dispatch, type SetStateAction } from "react";
import type { Listing } from "@/lib/types";
import type { UserCoords } from "@/lib/geolocation";
import type { ChameleonThemeId } from "@/lib/chameleon-themes";
import type { AdaptiveCategoryKey } from "@/lib/adaptive-categories";
import type { ConfirmDialogState } from "@/context/VautoContext";

export interface VautoBridgeValue {
  listings: Listing[];
  setListings: Dispatch<SetStateAction<Listing[]>>;
  bumpListingById: (
    listingId: string,
    field: "views" | "callClicks" | "saveCount" | "chatStarts"
  ) => void;
  buyerCoords: UserCoords | null;
  apiActive: boolean;
  hydrated: boolean;
  setSyncError: (msg: string | null) => void;
  showToast: (
    message: string,
    type?: "success" | "error" | "info" | "buddy"
  ) => void;
  showConfirm: (opts: ConfirmDialogState) => Promise<boolean>;
  requestMediaConsent: (onGranted: () => void) => void;
  requireAuthForListing: (redirectPath?: string) => boolean;
  openAuthModal: (redirectPath?: string) => void;
  scheduleSellerEngagementPush: (
    listingId: string,
    location: string,
    title: string,
    opts?: { pendingReview?: boolean }
  ) => void;
  setDetectedAdaptiveKey: (key: AdaptiveCategoryKey | null) => void;
  setChameleonTheme: (theme: ChameleonThemeId) => void;
  activateWardrobeSpinta: () => void;
  refreshListingsCatalog: () => Promise<void>;
}

const VautoBridgeContext = createContext<VautoBridgeValue | null>(null);

export function VautoBridgeProvider({
  value,
  children,
}: {
  value: VautoBridgeValue;
  children: React.ReactNode;
}) {
  return (
    <VautoBridgeContext.Provider value={value}>{children}</VautoBridgeContext.Provider>
  );
}

export function useVautoBridge(): VautoBridgeValue {
  const ctx = useContext(VautoBridgeContext);
  if (!ctx) throw new Error("useVautoBridge must be used within VautoProvider");
  return ctx;
}
