"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Capacitor } from "@capacitor/core";
import { runNativeLaunchRecovery } from "@/lib/native-recovery";

/** Blocks render until native crash-loop recovery finishes (Samsung WebView safety). */
export function NativeBootRecovery({ children }: { children: ReactNode }) {
  const native = typeof window !== "undefined" && Capacitor.isNativePlatform();
  const [ready, setReady] = useState(!native);
  const [recovered, setRecovered] = useState(false);

  useEffect(() => {
    if (!native) return;
    let cancelled = false;

    void runNativeLaunchRecovery().then((wiped) => {
      if (cancelled) return;
      setRecovered(wiped);
      setReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, [native]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0b0f17] text-white">
        <div className="text-center">
          <p className="text-lg font-semibold text-[#00BFA5]">Vauto</p>
          <p className="mt-2 text-sm text-slate-400">Paleidžiama…</p>
        </div>
      </div>
    );
  }

  if (recovered) {
    return (
      <>
        <div className="fixed inset-x-0 top-0 z-[9999] bg-[#00BFA5] px-4 py-2 text-center text-xs font-medium text-white">
          Atstatyta po klaidos — galite prisijungti iš naujo.
        </div>
        <div className="pt-8">{children}</div>
      </>
    );
  }

  return <>{children}</>;
}
