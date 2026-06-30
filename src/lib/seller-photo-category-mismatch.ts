import { getUniversalCategoryLabel } from "@/lib/universal-listing-fields";
import { listingToAdaptiveKey } from "@/lib/adaptive-categories";
import { pushAgentGreeting } from "@/lib/vauto-agent-client";
import type { ListingCategory } from "@/lib/types";

export const SELLER_PHOTO_MISMATCH_REVERT_CHIP = "Ne, pasilikti auto sraute";
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
  if (fromCategory === "vehicles" && toCategory === "electronics") {
    return "Matau, kad pildote automobilio skelbimą, tačiau įkėlėte telefono nuotrauką. Ar norite pakeisti skelbimo kategoriją į Elektroniką?";
  }
  const from = verticalLabel(fromCategory);
  const to = verticalLabel(toCategory);
  return `Matau, kad pildote ${from} skelbimą, tačiau įkėlėte nuotrauką, kuri labiau atitinka kitą kategoriją (${to}). Ar norite pakeisti skelbimo kategoriją?`;
}

/** Isolated agent greeting — replaces thread, no vehicle wizard chips or VIN prompts. */
export function pushPhotoCategoryMismatchGreeting(
  fromCategory: ListingCategory,
  toCategory: ListingCategory
): void {
  const greeting = buildSellerPhotoCategoryMismatchMessage(fromCategory, toCategory);
  const quickReplies = sellerPhotoCategoryMismatchQuickReplies(fromCategory);
  pushAgentGreeting(greeting, {
    quickReplies,
    openSheet: false,
    replaceThread: true,
    isolatedMismatch: true,
  });
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
    (/grįžti atgal|grįžti prie|ne,\s*grįžti|atstatyti.*skelbim|auto sraut|automobilių sraut/.test(
      n
    ) &&
      !/keisti kategorij/.test(n)) ||
    n.includes("ne, grįžti") ||
    n.includes("pasilikti auto")
  );
}

export function isSellerPhotoMismatchAcceptChip(text: string): boolean {
  const n = text.trim().toLowerCase();
  return /taip,\s*keisti kategorij|keisti kategoriją/.test(n);
}

export function isPhotoCategoryMismatchPrompt(text: string | null | undefined): boolean {
  if (!text?.trim()) return false;
  return /ar norite pakeisti skelbimo kategoriją|telefono nuotrauką|pildote automobilio skelbimą/i.test(
    text
  );
}
