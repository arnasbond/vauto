"use client";

import { VautoMark } from "@/components/brand/VautoMark";

type BrandLogoProps = {
  className?: string;
  /** Compact mark-only variant for narrow/mobile surfaces. */
  compact?: boolean;
};

/**
 * VAUTO brand logo — the single active identity component.
 *
 * Desktop/horizontal: canonical V mark + Outfit wordmark. Compact: mark only.
 * The accessible name lives on the container (role="img" aria-label="VAUTO");
 * every decorative SVG part is aria-hidden so screen readers never hear it
 * twice. Theme-safe: the wordmark uses --vauto-text-main (has DARK override),
 * the mark's emerald half uses the theme accent token.
 */
export function BrandLogo({ className = "", compact = false }: BrandLogoProps) {
  return <VautoMark className={className} compact={compact} />;
}
