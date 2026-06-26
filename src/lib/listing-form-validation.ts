import type { AiExtractedListing } from "@/lib/types";
import { isPlaceholderCity } from "@/lib/city-resolve";

export interface ListingValidationIssue {
  field: string;
  message: string;
}

export function sanitizeListingPhoneInput(raw: string): string {
  return raw.replace(/[^\d+\s()-]/g, "").slice(0, 24);
}

export function isValidListingPhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 8;
}

export function hasListingPhoto(previewImage: string | null | undefined): boolean {
  return Boolean(previewImage?.trim());
}

export const LISTING_PHOTO_REQUIRED_MESSAGE = "Prašome įkelti bent vieną nuotrauką";

const KNOWN_CITY_OPTION = "Kita";

export function resolveCitySelectValue(
  location: string,
  cityOptions: readonly string[]
): { selectValue: string; customCity: string } {
  const raw = location.split(",")[0]?.trim() ?? "";
  const presets = cityOptions.filter((c) => c !== KNOWN_CITY_OPTION);
  if (presets.includes(raw)) return { selectValue: raw, customCity: "" };
  if (!raw) return { selectValue: "", customCity: "" };
  if (raw === KNOWN_CITY_OPTION) return { selectValue: KNOWN_CITY_OPTION, customCity: "" };
  return { selectValue: KNOWN_CITY_OPTION, customCity: raw };
}

export function validateGeneralListingDraft(
  draft: AiExtractedListing,
  attrs: Record<string, string | string[] | undefined>,
  opts: { phone: string; termsAccepted: boolean; previewImage?: string | null }
): ListingValidationIssue[] {
  const issues: ListingValidationIssue[] = [];

  if (draft.title.trim().length < 3) {
    issues.push({ field: "title", message: "Klaida: Įveskite skelbimo pavadinimą (bent 3 simboliai)." });
  }

  const skCat = String(attrs.skelbiuCategory ?? "").trim();
  if (!skCat) {
    issues.push({ field: "category", message: "Klaida: Pasirinkite kategoriją." });
  }

  if (!draft.description?.trim()) {
    issues.push({ field: "description", message: "Klaida: Įveskite arba sugeneruokite aprašymą." });
  }

  if (draft.price <= 0) {
    issues.push({ field: "price", message: "Klaida: Įveskite kainą." });
  }

  const condition = String(attrs.condition ?? "").trim();
  if (!condition) {
    issues.push({ field: "condition", message: "Klaida: Pasirinkite prekės būklę." });
  }

  if (isPlaceholderCity(draft.location) || draft.location.trim().length < 2) {
    issues.push({ field: "city", message: "Klaida: Pasirinkite miestą arba įrašykite gyvenvietę." });
  }

  if (!isValidListingPhone(opts.phone)) {
    issues.push({ field: "phone", message: "Klaida: Įveskite telefono numerį." });
  }

  if (!opts.termsAccepted) {
    issues.push({ field: "terms", message: "Klaida: Sutikite su portalo taisyklėmis." });
  }

  if (!hasListingPhoto(opts.previewImage)) {
    issues.push({ field: "photo", message: LISTING_PHOTO_REQUIRED_MESSAGE });
  }

  return issues;
}

export function firstValidationMessage(issues: ListingValidationIssue[]): string | null {
  return issues[0]?.message ?? null;
}
