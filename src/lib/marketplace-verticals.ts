import type { LucideIcon } from "lucide-react";
import {
  Briefcase,
  Building2,
  CarFront,
  Cpu,
  Home,
  Wrench,
} from "lucide-react";
import {
  CANONICAL_VERTICALS,
  type VerticalId,
  type VerticalUiSlug,
} from "@vauto/shared/marketplace-domain";

export type MarketplaceVerticalId = VerticalUiSlug;

export type MarketplaceVertical = {
  id: MarketplaceVerticalId;
  canonicalId: VerticalId;
  label: string;
  query: string;
  icon: LucideIcon;
};

const VERTICAL_ICONS: Record<VerticalUiSlug, LucideIcon> = {
  transport: CarFront,
  real_estate: Building2,
  electronics: Cpu,
  services: Wrench,
  jobs: Briefcase,
  home: Home,
};

/** Equal-weight marketplace verticals — labels/ids from Stage 13A registry. */
export const MARKETPLACE_VERTICALS: readonly MarketplaceVertical[] =
  CANONICAL_VERTICALS.map((vertical) => ({
    id: vertical.uiSlug,
    canonicalId: vertical.id,
    label: vertical.label,
    query: vertical.searchQuery,
    icon: VERTICAL_ICONS[vertical.uiSlug],
  }));

export const MARKETPLACE_VERTICAL_LABELS = MARKETPLACE_VERTICALS.map(
  (v) => v.label
);
