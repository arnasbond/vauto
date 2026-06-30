/**
 * Flow UI skins — visual identity layer on top of the universal magistralė (P8).
 *
 * ARCHITECTURE:
 * - Kodas: vienas UniversalListingWizard + useVauto() duomenų srautas (generic).
 * - Emocija: `variant="spinta"` drabužių vertikalei — Vinted-killer UX, ne atskiras wizard.
 * - `variant="default"` visoms kitoms kategorijoms.
 *
 * Chameleon portalų šakos seller flow metu nebenaudojamos; tik šie tokenai + body class `wardrobe`.
 */

export type FlowUiSkinVariant = "default" | "spinta";

export interface FlowUiSkinTokens {
  variant: FlowUiSkinVariant;
  /** CSS class on wizard root for global overrides */
  rootClass: string;
  shellBg: string;
  cardBg: string;
  accent: string;
  accentMuted: string;
  border: string;
  borderDashed: string;
  headerTitle: string;
  headerSubtitle: string;
  badgeBg: string;
  composerBorder: string;
  composerBg: string;
  composerButton: string;
  composerAccentIcon: string;
  basketLabel: string;
}

export const FLOW_UI_SKIN_DEFAULT: FlowUiSkinTokens = {
  variant: "default",
  rootClass: "flow-skin-default",
  shellBg: "#0a1128",
  cardBg: "#131c38",
  accent: "#0284c7",
  accentMuted: "text-sky-300",
  border: "border-sky-500/35",
  borderDashed: "border-sky-500/35",
  headerTitle: "Universali skelbimų magistralė",
  headerSubtitle: "text-sky-300/80",
  badgeBg: "#0284c7",
  composerBorder: "border-[var(--vauto-border)]",
  composerBg: "bg-[var(--vauto-card-bg)]/95 backdrop-blur-xl",
  composerButton: "bg-[var(--vauto-primary)] text-[var(--vauto-primary-contrast)] hover:opacity-90",
  composerAccentIcon: "text-[var(--vauto-primary)]",
  basketLabel: "text-sky-300",
};

/** Spinta — moterų drabužių vizualinis kailis (strateginis Vinted konkurentas). */
export const FLOW_UI_SKIN_SPINTA: FlowUiSkinTokens = {
  variant: "spinta",
  rootClass: "flow-skin-spinta chameleon-wardrobe",
  shellBg: "#0a1128",
  cardBg: "#131c38",
  accent: "#d946ef",
  accentMuted: "text-fuchsia-300",
  border: "border-fuchsia-500/35",
  borderDashed: "border-fuchsia-500/40",
  headerTitle: "Tavo AI Spinta",
  headerSubtitle: "text-fuchsia-300/90",
  badgeBg: "#d946ef",
  composerBorder: "border-fuchsia-500/35",
  composerBg: "bg-[var(--vauto-card-bg)]/95 backdrop-blur-xl",
  composerButton: "bg-fuchsia-600 text-white hover:bg-fuchsia-500",
  composerAccentIcon: "text-fuchsia-500",
  basketLabel: "text-fuchsia-300",
};

export function resolveFlowUiSkin(opts: {
  category?: string | null;
  wardrobeSpintaForced?: boolean;
  fashionRoute?: boolean;
}): FlowUiSkinTokens {
  const clothing =
    opts.category === "clothing" ||
    Boolean(opts.wardrobeSpintaForced) ||
    Boolean(opts.fashionRoute);
  return clothing ? FLOW_UI_SKIN_SPINTA : FLOW_UI_SKIN_DEFAULT;
}

export function flowSkinToAgentStripVariant(
  skin: FlowUiSkinTokens
): "default" | "spinta" {
  return skin.variant === "spinta" ? "spinta" : "default";
}
