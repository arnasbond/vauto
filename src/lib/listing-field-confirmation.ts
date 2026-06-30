import type { AiExtractedListing, ListingCategory } from "@/lib/types";

const CATEGORY_LABELS: Record<ListingCategory, string> = {
  vehicles: "Automobiliai",
  electronics: "Elektronika",
  services: "Paslaugos",
  jobs: "Darbas",
  home: "Namai / buitis",
  clothing: "Drabužiai",
  real_estate: "NT",
  other: "Kita",
};

function formatPrice(draft: AiExtractedListing): string {
  if (draft.priceLabel?.trim()) return draft.priceLabel.trim();
  if (draft.price > 0) return `${draft.price} €`;
  return "nenurodyta";
}

/** Confirmation flow message after structured fields are populated from user input. */
export function buildPostValidationReport(draft: AiExtractedListing): string {
  const category = CATEGORY_LABELS[draft.category] ?? draft.category;
  const title = draft.title?.trim() || "—";
  const price = formatPrice(draft);
  const location = draft.location?.trim() || "nenurodytas";

  return `Pagal jūsų įvestį užpildžiau skelbimo laukus: ${category}, „${title}", kaina ${price}, vieta ${location}. Ar rezultatas tinka, ar norėtumėte ką nors pataisyti?`;
}

export const POST_VALIDATION_QUICK_REPLIES = [
  "Viskas tinka",
  "Pataisyti kainą",
  "Pataisyti kategoriją",
  "Pataisyti aprašymą",
] as const;

export function buildPostValidationQuickReplies(): string[] {
  return [...POST_VALIDATION_QUICK_REPLIES];
}

export function shouldRunPostValidationReport(
  extracted: AiExtractedListing,
  needsClarification: boolean
): boolean {
  if (needsClarification) return false;
  const hasTitle = Boolean(extracted.title?.trim());
  const hasCategory = Boolean(extracted.category);
  return hasTitle && hasCategory && (extracted.confidence ?? 0) >= 0.45;
}
