"use client";

import type { ReactNode } from "react";
import { useVauto } from "@/context/VautoContext";
import { getPortalUi } from "@/lib/chameleon-portal-ui";
import { portalExperienceForQuery } from "@/lib/portal-experience";

interface PortalPageChromeProps {
  children: ReactNode;
  /** Sticky header block (search bar area) */
  header?: ReactNode;
}

/** Adapts hero/header chrome to active portal (autoplius, aruodas, etc.) */
export function PortalPageChrome({ children, header }: PortalPageChromeProps) {
  const { searchQuery, sellerStep, chameleonTheme } = useVauto();
  const inSellerFlow = sellerStep !== "idle";
  const activeTheme = inSellerFlow
    ? chameleonTheme
    : portalExperienceForQuery(searchQuery).theme;
  const ui = getPortalUi(activeTheme);
  const isFlux = activeTheme === "flux" && !searchQuery.trim() && !inSellerFlow;

  if (isFlux) {
    return (
      <>
        {header}
        {children}
      </>
    );
  }

  return (
    <div
      className="portal-chrome -mx-4 px-4 transition-colors duration-300"
      style={{ background: ui.bg, color: ui.text }}
    >
      <div
        className="sticky top-0 z-40 -mx-4 border-b px-4 pb-3 pt-2 backdrop-blur-xl"
        style={{
          background: `${ui.surface}f2`,
          borderColor: ui.border,
        }}
      >
        {header}
      </div>

      <div
        className="mt-4 rounded-xl border shadow-sm"
        style={{ background: ui.surface, borderColor: ui.border }}
      >
        <div
          className="rounded-t-xl px-4 py-2 text-center text-[11px] font-bold uppercase tracking-wider"
          style={{ background: ui.bannerBg, color: ui.bannerText }}
        >
          {ui.tagline}
        </div>
        <div className="px-4 py-3">
          <p
            className={`text-[11px] font-bold uppercase tracking-[0.14em] ${ui.fontClass}`}
            style={{ color: ui.accent }}
          >
            {ui.portalName}
          </p>
          <h1
            className={`mt-1 text-xl font-extrabold leading-tight tracking-tight ${ui.fontClass}`}
            style={{ color: ui.text }}
          >
            {portalExperienceForQuery(searchQuery).headline}
          </h1>
          <p className="mt-1 text-[13px] leading-snug" style={{ color: ui.textMuted }}>
            {portalExperienceForQuery(searchQuery).description}
          </p>
        </div>
      </div>

      <div className="pt-4">{children}</div>
    </div>
  );
}
