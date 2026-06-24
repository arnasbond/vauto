"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  ZERO_UI_SCREEN_LABELS,
  type ZeroUiScreen,
} from "@/lib/zero-ui-screens";
import type { ZeroUiMicroPaymentIntent } from "@/lib/monetization-engine";

export type ZeroUiScreenSource = "agent" | "user" | "voice";

interface ZeroUiScreenContextValue {
  currentView: ZeroUiScreen;
  lastSource: ZeroUiScreenSource | null;
  setScreen: (screen: ZeroUiScreen, source?: ZeroUiScreenSource) => void;
  goToMarketplace: (source?: ZeroUiScreenSource) => void;
  screenLabel: string;
  activeBoost: boolean;
  setActiveBoost: (active: boolean) => void;
  pendingMicroPayment: ZeroUiMicroPaymentIntent | null;
  openMicroPayment: (intent: ZeroUiMicroPaymentIntent) => void;
  clearMicroPayment: () => void;
}

const ZeroUiScreenContext = createContext<ZeroUiScreenContextValue | null>(null);

export function ZeroUiScreenProvider({ children }: { children: ReactNode }) {
  const [currentView, setCurrentView] = useState<ZeroUiScreen>("marketplace");
  const [lastSource, setLastSource] = useState<ZeroUiScreenSource | null>(null);
  const [activeBoost, setActiveBoost] = useState(false);
  const [pendingMicroPayment, setPendingMicroPayment] =
    useState<ZeroUiMicroPaymentIntent | null>(null);

  const setScreen = useCallback(
    (screen: ZeroUiScreen, source: ZeroUiScreenSource = "user") => {
      setCurrentView(screen);
      setLastSource(source);
    },
    []
  );

  const goToMarketplace = useCallback(
    (source: ZeroUiScreenSource = "user") => {
      setScreen("marketplace", source);
    },
    [setScreen]
  );

  const openMicroPayment = useCallback((intent: ZeroUiMicroPaymentIntent) => {
    setPendingMicroPayment(intent);
    setScreen("listing_preview", "agent");
  }, [setScreen]);

  const clearMicroPayment = useCallback(() => {
    setPendingMicroPayment(null);
  }, []);

  const value = useMemo<ZeroUiScreenContextValue>(
    () => ({
      currentView,
      lastSource,
      setScreen,
      goToMarketplace,
      screenLabel: ZERO_UI_SCREEN_LABELS[currentView],
      activeBoost,
      setActiveBoost,
      pendingMicroPayment,
      openMicroPayment,
      clearMicroPayment,
    }),
    [
      currentView,
      lastSource,
      setScreen,
      goToMarketplace,
      activeBoost,
      pendingMicroPayment,
      openMicroPayment,
      clearMicroPayment,
    ]
  );

  return (
    <ZeroUiScreenContext.Provider value={value}>
      {children}
    </ZeroUiScreenContext.Provider>
  );
}

export function useZeroUiScreen(): ZeroUiScreenContextValue {
  const ctx = useContext(ZeroUiScreenContext);
  if (!ctx) {
    throw new Error("useZeroUiScreen must be used within ZeroUiScreenProvider");
  }
  return ctx;
}

export function useZeroUiScreenOptional(): ZeroUiScreenContextValue | null {
  return useContext(ZeroUiScreenContext);
}
