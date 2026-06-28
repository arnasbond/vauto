"use client";

import { Loader2, Sparkles } from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useState } from "react";

export function PhotoSearchScanOverlay({ active }: { active: boolean }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!active || typeof document === "undefined") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [active]);

  if (!active || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[10003] flex items-center justify-center bg-[#0a1128]/92 px-6 backdrop-blur-sm"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="AI skenuoja nuotrauką"
    >
      <div className="w-full max-w-sm rounded-2xl border border-[#1167b1]/40 bg-[#131c38] px-6 py-8 text-center shadow-2xl">
        <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#1167b1]/20 text-[#00f2fe]">
          <Sparkles className="h-7 w-7 animate-pulse" aria-hidden />
        </span>
        <Loader2
          className="mx-auto mb-4 h-8 w-8 animate-spin text-[#00f2fe]"
          aria-hidden
        />
        <p className="text-base font-semibold text-white">
          AI skenuoja nuotrauką ir ieško VAUTO tinklelyje…
        </p>
        <p className="mt-2 text-sm text-slate-400">
          Palaukite — neuždarykite šio lango.
        </p>
      </div>
    </div>,
    document.body
  );
}
