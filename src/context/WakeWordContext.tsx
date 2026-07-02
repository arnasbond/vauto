"use client";

import { createContext, useContext, type MutableRefObject, type ReactNode } from "react";
import type { WakeWordPhase } from "@/lib/wake-word-types";

const DISABLED_WAKE_WORD_VALUE: WakeWordContextValue = {
  wakeWordEnabled: false,
  wakeWordPhase: "off",
  wakeWordStatusText: undefined,
  wakeWordTranscript: undefined,
  setWakeWordEnabled: () => {},
  requestWakeWordConsent: () => {},
  disableWakeWordInstantly: () => {},
};

export interface WakeWordContextValue {
  wakeWordEnabled: boolean;
  wakeWordPhase: WakeWordPhase;
  wakeWordStatusText: string | undefined;
  wakeWordTranscript: string | undefined;
  setWakeWordEnabled: (enabled: boolean) => void;
  requestWakeWordConsent: () => void;
  disableWakeWordInstantly: () => void;
}

export interface WakeWordDeps {
  hydrated: boolean;
  gdprConsent: boolean;
  agentRef: MutableRefObject<unknown | null>;
  showToast: (
    message: string,
    type: "success" | "error" | "info" | "buddy"
  ) => void;
  requestGdprModalForWake: () => void;
}

export interface WakeWordActions {
  enableAfterGdprConsent: () => void;
  disableOnGdprRevoke: () => void;
}

const WakeWordContext = createContext<WakeWordContextValue | null>(null);

/** Voice input/output has been removed; provider remains for context compatibility. */
export function WakeWordProvider({
  children,
}: {
  deps: WakeWordDeps;
  actionsRef: MutableRefObject<WakeWordActions | null>;
  children: ReactNode;
}) {
  return (
    <WakeWordContext.Provider value={DISABLED_WAKE_WORD_VALUE}>
      {children}
    </WakeWordContext.Provider>
  );
}

export function useWakeWord(): WakeWordContextValue {
  const ctx = useContext(WakeWordContext);
  if (!ctx) {
    throw new Error("useWakeWord must be used within WakeWordProvider");
  }
  return ctx;
}
