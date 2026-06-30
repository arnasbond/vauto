import { getUniversalCategoryLabel } from "@/lib/universal-listing-fields";
import { listingToAdaptiveKey } from "@/lib/adaptive-categories";
import type { ListingCategory } from "@/lib/types";

export const SELLER_PHOTO_MISMATCH_REVERT_CHIP =
  "Grįžti atgal į auto skelbimą";
export const SELLER_PHOTO_MISMATCH_ACCEPT_CHIP = "Taip, keisti kategoriją";

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
  const from = verticalLabel(fromCategory);
  const to = verticalLabel(toCategory);
  return `Matau, kad pildėte ${from} skelbimą, bet įkėlėte nuotrauką, kuri labiau atitinka kitą kategoriją (${to}). Ar įvyko klaida ir norite pakeisti nuotrauką bei grįžti prie ${from} skelbimo?`;
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
    /grįžti atgal|grįžti prie|atstatyti.*skelbim/.test(n) &&
    !/keisti kategorij/.test(n)
  );
}

export function isSellerPhotoMismatchAcceptChip(text: string): boolean {
  return /taip,\s*keisti kategorij/i.test(text.trim());
}
