import type { MarketplaceVerticalId } from "@/lib/marketplace-verticals";

/**
 * MASTER Wave 2 correction — category-card visual language.
 *
 * Restrained, VAUTO-owned flat-illustration object imagery for the six
 * canonical verticals (converging toward docs/design-reference/chatgpt-visual-baseline).
 * Source originals: assets/categories-source/*.png (regenerate served assets
 * via `node scripts/process-category-images.mjs`). Served as small, optimized,
 * transparent-background WebP tiles so they read correctly on both LIGHT and
 * DARK category cards, with a PNG fallback for non-WebP contexts.
 */
export const CATEGORY_IMAGE_SRC: Record<
  MarketplaceVerticalId,
  { webp: string; webp2x: string; png: string; alt: string }
> = {
  transport: {
    webp: "/images/categories/category-transport.webp",
    webp2x: "/images/categories/category-transport@2x.webp",
    png: "/images/categories/category-transport.png",
    alt: "Transporto kategorijos iliustracija — automobilis",
  },
  real_estate: {
    webp: "/images/categories/category-real-estate.webp",
    webp2x: "/images/categories/category-real-estate@2x.webp",
    png: "/images/categories/category-real-estate.png",
    alt: "Nekilnojamojo turto kategorijos iliustracija — pastatas",
  },
  electronics: {
    webp: "/images/categories/category-electronics.webp",
    webp2x: "/images/categories/category-electronics@2x.webp",
    png: "/images/categories/category-electronics.png",
    alt: "Elektronikos kategorijos iliustracija — nešiojamas kompiuteris",
  },
  services: {
    webp: "/images/categories/category-services.webp",
    webp2x: "/images/categories/category-services@2x.webp",
    png: "/images/categories/category-services.png",
    alt: "Paslaugų kategorijos iliustracija — įrankis",
  },
  jobs: {
    webp: "/images/categories/category-jobs.webp",
    webp2x: "/images/categories/category-jobs@2x.webp",
    png: "/images/categories/category-jobs.png",
    alt: "Darbo kategorijos iliustracija — biuro kėdė",
  },
  home: {
    webp: "/images/categories/category-home-garden.webp",
    webp2x: "/images/categories/category-home-garden@2x.webp",
    png: "/images/categories/category-home-garden.png",
    alt: "Namų ir sodo kategorijos iliustracija — namas su augalu",
  },
};
