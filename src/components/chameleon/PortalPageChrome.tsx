"use client";

import type { ReactNode } from "react";
import { useVauto } from "@/context/VautoContext";
import { useSellerFlow } from "@/context/SellerFlowContext";
import { useVautoSearch } from "@/context/VautoSearchContext";
import { getVerticalUi } from "@/lib/vertical-presentation";
import { verticalExperienceForQuery } from "@/lib/vertical-presentation";

interface VerticalPageChromeProps {
  children: ReactNode;
  /** Sticky header block (search bar area) */
  header?: ReactNode;
  /** Skip the vertical hero card — use on dedicated search page */
  minimal?: boolean;
}

/**
 * Adapts hero/header chrome to the active vertical (Transportas, Apranga, …)
 * under the single VAUTO DS 2.0 identity (Stage 20B.1 — no portal imitation).
 */
export function VerticalPageChrome({
  children,
  header,
  minimal = false,
}: VerticalPageChromeProps) {
  const { chameleonTheme } = useVauto();
  const { sellerStep } = useSellerFlow();
  const { searchQuery } = useVautoSearch();
  const inSellerFlow = sellerStep !== "idle";
  const activeVertical = inSellerFlow
    ? chameleonTheme === "wardrobe"
      ? "fashion"
      : "marketplace"
    : verticalExperienceForQuery(searchQuery).vertical;
  const ui = getVerticalUi(activeVertical);
  const experience = verticalExperienceForQuery(searchQuery);
  const isMarketplace =
    activeVertical === "marketplace" && !searchQuery.trim() && !inSellerFlow;

  if (isMarketplace || minimal) {
    return (
      <>
        {header}
        {children}
      </>
    );
  }

  return (
    <div
      className="vertical-chrome -mx-4 px-4 transition-colors duration-300"
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
            {ui.verticalName}
          </p>
          <h1
            className={`mt-1 text-xl font-extrabold leading-tight tracking-tight ${ui.fontClass}`}
            style={{ color: ui.text }}
          >
            {experience.headline}
          </h1>
          <p className="mt-1 text-[13px] leading-snug" style={{ color: ui.textMuted }}>
            {experience.description}
          </p>
        </div>
      </div>

      <div className="pt-4">{children}</div>
    </div>
  );
}
