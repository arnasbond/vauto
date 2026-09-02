import type { VisibleCategoryId } from "@vauto/shared/category-registry";

/**
 * F7 Premium Category Imagery — VAUTO-owned flat premium product
 * illustrations for ALL 8 visible marketplace categories.
 *
 * Contract: isolated object on a TRANSPARENT background, centered, soft
 * contact shadow, no text/logos/people/scene, no green card background, no
 * gradient backdrop, nothing clipped, readable in LIGHT and DARK themes.
 *
 * Source originals: assets/categories-source/*.png (regenerate served
 * assets via `node scripts/process-category-images.mjs` for the six
 * photorealistic originals and `node scripts/generate-category-illustrations.mjs`
 * for the three F7 flat-premium additions — Mada, Darbas, Kita).
 */
export const CATEGORY_IMAGE_SRC: Record<
  VisibleCategoryId,
  { webp: string; webp2x: string; png: string; alt: string }
> = {
  vehicles: {
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
  clothing: {
    webp: "/images/categories/category-clothing.webp",
    webp2x: "/images/categories/category-clothing@2x.webp",
    png: "/images/categories/category-clothing.png",
    alt: "Mados kategorijos iliustracija — kreminis megztinis ant pakabos",
  },
  home: {
    webp: "/images/categories/category-home-garden.webp",
    webp2x: "/images/categories/category-home-garden@2x.webp",
    png: "/images/categories/category-home-garden.png",
    alt: "Namų ir buities kategorijos iliustracija — namas su augalu",
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
    alt: "Darbo kategorijos iliustracija — odinis dokumentų portfelis",
  },
  other: {
    webp: "/images/categories/category-other.webp",
    webp2x: "/images/categories/category-other@2x.webp",
    png: "/images/categories/category-other.png",
    alt: "Kitos kategorijos iliustracija — kartoninė siuntos dėžė",
  },
};

/** Premium imagery for a visible category (undefined only for broken files). */
export function categoryImageFor(
  id: VisibleCategoryId
): { webp: string; webp2x: string; png: string; alt: string } | undefined {
  return CATEGORY_IMAGE_SRC[id];
}
