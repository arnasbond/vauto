"use client";

import { useEffect, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const WAKE_MESSAGE_DELAY_MS = 3000;

/** Shown while session restore exceeds cold-start threshold (free-tier server wake). */
export function AuthColdStartOverlay() {
  const { authHydrated } = useAuth();
  const [showWakeMessage, setShowWakeMessage] = useState(false);

  useEffect(() => {
    if (authHydrated) {
      setShowWakeMessage(false);
      return;
    }
    const timer = window.setTimeout(() => setShowWakeMessage(true), WAKE_MESSAGE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [authHydrated]);

  if (authHydrated || !showWakeMessage) return null;

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-[#0b0f17]/96 px-6 backdrop-blur-md"
      role="status"
      aria-live="polite"
      aria-label="Vauto kraunasi"
    >
      <div className="max-w-sm text-center">
        <span className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--vauto-teal,#0d9488)]/20 ring-1 ring-[var(--vauto-teal,#0d9488)]/40">
          <Sparkles className="h-7 w-7 text-[var(--vauto-teal,#14b8a6)]" />
        </span>
        <div className="mb-3 flex items-center justify-center gap-2 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin text-[var(--vauto-teal,#14b8a6)]" />
          <span>Kraunama…</span>
        </div>
        <p className="text-base font-semibold leading-relaxed text-white">
          Vauto AI žadina serverį...
        </p>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          Tai gali užtrukti iki 30 sekundžių.
        </p>
      </div>
    </div>
  );
}
