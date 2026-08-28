/**
 * VAUTO-native atmospheric depth layer for the homepage hero.
 *
 * MASTER's LIGHT/DARK hero references solve an otherwise-empty right-hand
 * field with a subdued, real-place photographic atmosphere behind the
 * foreground content. A vector/SVG skyline was tried in an earlier pass and
 * rejected on independent review as reading like "UI decoration" rather
 * than a real place. This version uses a genuinely photorealistic,
 * VAUTO-owned plate per theme instead:
 *
 * - LIGHT: a soft, hazy, desaturated Baltic/Northern-European old-town
 *   skyline (generic composite — not a specific real landmark).
 * - DARK: a quiet, moody, dark rolling-terrain/city-edge silhouette.
 *
 * Both plates were AI-generated for this project (no third-party stock, no
 * unclear licensing) and processed by `scripts/process-hero-atmosphere.mjs`
 * into small (~5-12KB) WebP files cropped to this panel's own aspect ratio,
 * with a light softening blur baked in so the photograph reads as ambient
 * atmosphere rather than a crisp foreground image.
 *
 * The active plate is selected via the `--hero-atmosphere-bg` design-system
 * token (swapped per theme in `polish.css`), the same `[data-app-theme]`
 * mechanism every other theme-aware surface in this codebase uses — so
 * there is no JS theme branching here and therefore no hydration flash.
 *
 * Legibility protection: a horizontal mask fades the whole panel toward
 * transparent as it approaches the H1/search column, and a vertical tonal
 * wash (mixed from `--ds-surface-page`, so it auto-matches each theme)
 * further subdues the plate so it never competes with foreground text.
 * If the image fails to load, `background-image` simply does not paint —
 * there is no broken-image glyph, and the tonal wash + the hero's own
 * ambient gradient glow (rendered by `HomeAiHero`) still provide depth.
 *
 * Purely decorative: aria-hidden, pointer-events-none, no interactive or
 * data-bearing content.
 */
export function HomeHeroAtmosphere() {
  return (
    <div
      aria-hidden
      data-home-hero-atmosphere
      className="pointer-events-none absolute right-0 top-0 hidden h-[27rem] w-[54%] select-none overflow-hidden sm:block lg:w-[48%]"
      style={{
        maskImage: "linear-gradient(to left, black 28%, transparent 88%)",
        WebkitMaskImage: "linear-gradient(to left, black 28%, transparent 88%)",
      }}
    >
      <div
        className="absolute inset-0 bg-cover bg-bottom bg-no-repeat"
        style={{ backgroundImage: "var(--hero-atmosphere-bg)" }}
      />
      {/* Tonal wash — bridges the photograph into the page surface tone per
          theme and keeps it subordinate to foreground text (no heavy
          gradients/glow, just a restrained top+bottom vignette). */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, color-mix(in srgb, var(--ds-surface-page) 25%, transparent) 0%, transparent 35%, color-mix(in srgb, var(--ds-surface-page) 35%, transparent) 100%)",
        }}
      />
    </div>
  );
}
