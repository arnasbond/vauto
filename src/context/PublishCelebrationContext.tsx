"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  ListingSuccessLottie,
  LISTING_SUCCESS_LOTTIE_MS,
} from "@/components/listing/ListingSuccessLottie";

const SPINTA_TAB_ID = "bottom-nav-mano-skelbimai";

interface PublishCelebrationContextValue {
  spintaPulse: boolean;
  playPublishCelebration: (fromRect: DOMRect) => Promise<void>;
}

const PublishCelebrationContext =
  createContext<PublishCelebrationContextValue | null>(null);

export function PublishCelebrationProvider({ children }: { children: ReactNode }) {
  const [spintaPulse, setSpintaPulse] = useState(false);
  const [active, setActive] = useState(false);
  const resolveRef = useRef<(() => void) | null>(null);

  const completeCelebration = useCallback(() => {
    setActive(false);
    resolveRef.current?.();
    resolveRef.current = null;
  }, []);

  const playPublishCelebration = useCallback((fromRect: DOMRect) => {
    void fromRect;
    return new Promise<void>((resolve) => {
      const target = document.getElementById(SPINTA_TAB_ID);
      resolveRef.current = resolve;
      setActive(true);
      setSpintaPulse(true);
      target?.classList.add("publish-tab-catch-pulse");

      window.setTimeout(() => {
        setSpintaPulse(false);
        target?.classList.remove("publish-tab-catch-pulse");
      }, LISTING_SUCCESS_LOTTIE_MS + 200);
    });
  }, []);

  const value = useMemo(
    () => ({ spintaPulse, playPublishCelebration }),
    [spintaPulse, playPublishCelebration]
  );

  return (
    <PublishCelebrationContext.Provider value={value}>
      {children}
      {typeof document !== "undefined" &&
        active &&
        createPortal(
          <div
            className="publish-success-lottie-overlay pointer-events-none fixed inset-0 z-[120] flex items-center justify-center overflow-hidden px-6"
            aria-live="polite"
            aria-atomic="true"
          >
            <div className="pointer-events-none absolute inset-0 bg-[color-mix(in_srgb,var(--vauto-bg)_55%,transparent)] backdrop-blur-[2px]" />
            <div className="relative flex max-h-[min(70vh,320px)] w-full max-w-[220px] flex-col items-center justify-center overflow-hidden rounded-3xl bg-[var(--vauto-card-bg)] px-4 py-5 shadow-xl ring-1 ring-[var(--vauto-border)]">
              <ListingSuccessLottie onComplete={completeCelebration} />
              <p className="mt-1 text-center text-sm font-semibold text-[var(--vauto-text-main)]">
                Skelbimas publikuotas!
              </p>
            </div>
          </div>,
          document.body
        )}
    </PublishCelebrationContext.Provider>
  );
}

export function usePublishCelebration(): PublishCelebrationContextValue {
  const ctx = useContext(PublishCelebrationContext);
  if (!ctx) {
    throw new Error(
      "usePublishCelebration must be used within PublishCelebrationProvider"
    );
  }
  return ctx;
}

export function usePublishCelebrationOptional(): PublishCelebrationContextValue | null {
  return useContext(PublishCelebrationContext);
}

export { SPINTA_TAB_ID, LISTING_SUCCESS_LOTTIE_MS };
