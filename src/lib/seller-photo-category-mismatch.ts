import { getUniversalCategoryLabel } from "@/lib/universal-listing-fields";
import { listingToAdaptiveKey } from "@/lib/adaptive-categories";
import type { ListingCategory } from "@/lib/types";

export const SELLER_PHOTO_MISMATCH_REVERT_CHIP =
  "Ne, pasilikti Automobilių sraute";
export const SELLER_PHOTO_MISMATCH_ACCEPT_CHIP =
  "Taip, keisti kategoriją į Elektroniką";

function verticalLabel(category: ListingCategory): string {
  const key = listingToAdaptiveKey(category);
  switch (key) {
    case "vehicles":
      return "automobilio";
    case "clothing":
      return "drabužio";
    case "real_estate":
      return "nekilnojamojo turto";
    case "services":
      return "paslaugų";
    case "jobs":
      return "darbo";
    default:
      return getUniversalCategoryLabel(category).toLowerCase() || "skelbimo";
  }
}

export function buildSellerPhotoCategoryMismatchMessage(
  fromCategory: ListingCategory,
  toCategory: ListingCategory
): string {
  if (fromCategory === "vehicles" && toCategory === "electronics") {
    return "Matau, kad pildėte automobilio skelbimą, bet įkėlėte telefono nuotrauką. Kaip norėtumėte pasielgti?";
  }
  const from = verticalLabel(fromCategory);
  const to = verticalLabel(toCategory);
  return `Matau, kad pildėte ${from} skelbimą, bet įkėlėte nuotrauką, kuri labiau atitinka kitą kategoriją (${to}). Kaip norėtumėte pasielgti?`;
}

export function sellerPhotoCategoryMismatchQuickReplies(
  fromCategory: ListingCategory
): string[] {
  if (listingToAdaptiveKey(fromCategory) === "vehicles") {
    return [SELLER_PHOTO_MISMATCH_REVERT_CHIP, SELLER_PHOTO_MISMATCH_ACCEPT_CHIP];
  }
  return [
    `Grįžti atgal į ${verticalLabel(fromCategory)} skelbimą`,
    SELLER_PHOTO_MISMATCH_ACCEPT_CHIP,
  ];
}

export function isSellerPhotoMismatchRevertChip(text: string): boolean {
  const n = text.trim().toLowerCase();
  return (
    (/grįžti atgal|grįžti prie|ne,\s*grįžti|atstatyti.*skelbim|automobilių sraut/.test(n) &&
      !/keisti kategorij/.test(n)) ||
    n.includes("ne, grįžti")
  );
}

export function isSellerPhotoMismatchAcceptChip(text: string): boolean {
  const n = text.trim().toLowerCase();
  return /taip,\s*keisti kategorij|keisti kategoriją į elektronik/.test(n);
}

export function isPhotoCategoryMismatchPrompt(text: string | null | undefined): boolean {
  if (!text?.trim()) return false;
  return /kaip norėtumėte pasielgti|telefono nuotrauką|pildėte automobilio skelbimą/i.test(
    text
  );
}
