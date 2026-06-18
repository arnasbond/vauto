"use client";

import Link from "next/link";
import { Download, X } from "lucide-react";
import { useEffect, useState } from "react";
import { shouldShowInstallPrompt } from "@/lib/mobile-install";

const DISMISS_KEY = "vauto_install_banner_dismissed";

export function InstallAppBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!shouldShowInstallPrompt()) return;
    if (localStorage.getItem(DISMISS_KEY) === "1") return;
    setVisible(true);
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 mx-3">
      <div className="card-shadow flex items-center gap-3 rounded-2xl border border-[var(--vauto-blue)]/20 bg-white p-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--vauto-blue)]/10 text-[var(--vauto-blue)]">
          <Download className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[var(--vauto-text)]">
            Įdiekite Vauto į telefoną
          </p>
          <p className="text-xs text-[var(--vauto-text-muted)]">
            Tikra Android programėlė — vienu paspaudimu
          </p>
        </div>
        <Link
          href="/install/"
          className="shrink-0 rounded-xl bg-[var(--vauto-blue)] px-3 py-2 text-xs font-semibold text-white"
        >
          Įdiegti
        </Link>
        <button
          type="button"
          onClick={() => {
            localStorage.setItem(DISMISS_KEY, "1");
            setVisible(false);
          }}
          className="shrink-0 rounded-full p-1 text-[var(--vauto-text-muted)]"
          aria-label="Uždaryti"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
