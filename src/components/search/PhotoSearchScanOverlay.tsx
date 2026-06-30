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
      className="ai-scan-overlay-backdrop fixed inset-0 z-[10003] flex items-center justify-center px-6 backdrop-blur-sm"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="AI skenuoja nuotrauką"
    >
      <div className="ai-scan-overlay-panel w-full max-w-sm rounded-2xl border px-6 py-8 text-center shadow-2xl">
        <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--vauto-primary)_20%,transparent)] text-[var(--vauto-primary)]">
          <Sparkles className="h-7 w-7 animate-pulse" aria-hidden />
        </span>
        <Loader2
          className="mx-auto mb-4 h-8 w-8 animate-spin text-[var(--vauto-primary)]"
          aria-hidden
        />
        <p className="text-base font-semibold text-[var(--vauto-text-main)]">
          AI skenuoja nuotrauką ir ieško VAUTO tinklelyje…
        </p>
        <p className="mt-2 text-sm text-[var(--vauto-text-muted)]">
          Palaukite — neuždarykite šio lango.
        </p>
      </div>
    </div>,
    document.body
  );
}
