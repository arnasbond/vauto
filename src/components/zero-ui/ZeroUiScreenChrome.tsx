"use client";

import { ArrowLeft, Sparkles } from "lucide-react";
import { useZeroUiScreen } from "@/context/ZeroUiScreenContext";

interface ZeroUiScreenChromeProps {
  children: React.ReactNode;
  subtitle?: string;
  onBack?: () => void;
}

export function ZeroUiScreenChrome({
  children,
  subtitle,
  onBack,
}: ZeroUiScreenChromeProps) {
  const { screenLabel, goToMarketplace } = useZeroUiScreen();

  return (
    <div className="zero-ui-screen-chrome flex min-h-0 flex-1 flex-col">
      <div className="mb-3 flex items-center justify-between gap-2 border-b border-[var(--vauto-border,#e5e7eb)] pb-3">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={onBack ?? (() => goToMarketplace())}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--vauto-border,#e5e7eb)] bg-[var(--vauto-card-bg,#fff)] text-[var(--portal-text,#374151)]"
            aria-label="Grįžti į rinką"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--vauto-primary,#1167b1)]">
              <Sparkles className="h-3 w-3" />
              Zero-UI
            </p>
            <h2 className="truncate text-base font-bold text-[var(--portal-text,#111827)]">
              {screenLabel}
            </h2>
            {subtitle ? (
              <p className="zero-ui-screen-subtitle truncate text-xs text-[var(--portal-text,var(--vauto-text-main,#374151))] opacity-80">
                {subtitle}
              </p>
            ) : null}
          </div>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pb-4">{children}</div>
    </div>
  );
}
