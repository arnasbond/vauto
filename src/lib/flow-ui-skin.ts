/**
 * Flow UI skins — visual identity layer on top of the universal magistralė (P8).
 *
 * P11: shell/card use CSS theme tokens so wizard respects vauto-original light + dark settings.
 */

export type FlowUiSkinVariant = "default" | "spinta";

export interface FlowUiSkinTokens {
  variant: FlowUiSkinVariant;
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
  shellBg: "var(--vauto-bg)",
  cardBg: "var(--vauto-card-bg)",
  accent: "var(--vauto-primary)",
  accentMuted: "text-[var(--vauto-primary)]",
  border: "border-[var(--vauto-border)]",
  borderDashed: "border-[var(--vauto-border)]",
  headerTitle: "Universali skelbimų magistralė",
  headerSubtitle: "text-[var(--vauto-text-muted)]",
  badgeBg: "var(--vauto-primary)",
  composerBorder: "border-[var(--vauto-border)]",
  composerBg: "bg-[var(--vauto-card-bg)]/95 backdrop-blur-xl",
  composerButton: "bg-[var(--vauto-primary)] text-[var(--vauto-primary-contrast)] hover:opacity-90",
  composerAccentIcon: "text-[var(--vauto-primary)]",
  basketLabel: "text-[var(--vauto-text-muted)]",
};

export const FLOW_UI_SKIN_SPINTA: FlowUiSkinTokens = {
  variant: "spinta",
  rootClass: "flow-skin-spinta chameleon-wardrobe",
  shellBg: "var(--vauto-bg)",
  cardBg: "var(--vauto-card-bg)",
  accent: "var(--vauto-primary)",
  accentMuted: "text-[var(--vauto-primary)]",
  border: "border-[var(--vauto-border)]",
  borderDashed: "border-[var(--vauto-primary)]/35",
  headerTitle: "Tavo AI Spinta",
  headerSubtitle: "text-[var(--vauto-text-muted)]",
  badgeBg: "var(--vauto-primary)",
  composerBorder: "border-[var(--vauto-border)]",
  composerBg: "bg-[var(--vauto-card-bg)]/95 backdrop-blur-xl",
  composerButton:
    "bg-[var(--vauto-primary)] text-[var(--vauto-primary-contrast)] hover:opacity-90",
  composerAccentIcon: "text-[var(--vauto-accent)]",
  basketLabel: "text-[var(--vauto-text-muted)]",
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
