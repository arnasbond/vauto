import {
  getAdaptiveConfig,
  listingToAdaptiveKey,
  type AdaptiveCategoryKey,
} from "@/lib/adaptive-categories";
import { resolveEffectiveListingCategory } from "@/lib/listing-attribute-isolation";
import { getDynamicAttributeEntries } from "@/lib/listing-dynamic-attributes";
import {
  isVehicleQuery,
  VEHICLE_BRAND_PATTERN,
} from "@/lib/vehicle-keywords";
import type { Listing, ListingCategory } from "@/lib/types";

const DEMO_PHONE = "+37061234567";

const ELECTRONICS_TEXT_RE =
  /\b(vert[eė]j|translator|elektron|gadget|telefon|iphone|samsung|xiaomi|peiko|ausin|plan[sš]et|televiz|notebook|ne[sš]iojam)/i;

const INSTRUMENT_TEXT_RE =
  /\b(gitar|guitar|hohner|muzik|pianin|būgn|bugn|drum|smuik|akustin|bosin|ukulel)/i;

const APPAREL_TEXT_RE =
  /\b(striuk|džins|dzins|suknel|mar[sš]kin|kelm|sportbač|batai|šalik|kepur|drabuž|aprang)/i;

/** Public-facing category badges (never uppercase portal jargon alone). */
const PUBLIC_CATEGORY_LABELS: Partial<Record<ListingCategory, string>> = {
  vehicles: "Automobiliai",
  transport: "Transportas",
  electronics: "Elektronika",
  clothing: "Apranga",
  home: "Namai",
  services: "Paslaugos",
  real_estate: "NT",
  jobs: "Darbas",
  tools: "Įrankiai",
  rental: "Nuoma",
  other: "Kita",
};

export function resolveListingPhone(listing: Listing): string {
  const raw = listing.contact?.trim();
  if (!raw) return DEMO_PHONE;

  const digits = raw.replace(/[^\d+]/g, "");
  if (digits.length < 8) return DEMO_PHONE;

  if (digits.startsWith("+")) return digits;
  if (digits.startsWith("370")) return `+${digits}`;
  if (digits.startsWith("8") && digits.length >= 9) return `+370${digits.slice(1)}`;
  return `+${digits}`;
}

export function isDemoListingPhone(listing: Listing): boolean {
  const raw = listing.contact?.trim();
  if (!raw) return true;
  const digits = raw.replace(/[^\d+]/g, "");
  return digits.length < 8;
}

export function formatListingPhoneDisplay(phone: string): string {
  const d = phone.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("370")) {
    return `+${d.slice(0, 3)} ${d.slice(3, 5)} ${d.slice(5, 8)} ${d.slice(8)}`;
  }
  if (d.length === 9 && d.startsWith("6")) {
    return `+370 ${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5)}`;
  }
  return phone;
}

/** Normalized tel: href for mobile tap-to-call. */
export function listingPhoneTelHref(phone: string): string {
  const d = phone.replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("370")) return `tel:+${d}`;
  if (d.startsWith("8") && d.length >= 9) return `tel:+370${d.slice(1)}`;
  if (d.startsWith("6")) return `tel:+370${d}`;
  return `tel:+${d}`;
}

export interface ListingDetailRow {
  label: string;
  value: string;
}

function listingTextBlob(listing: Listing): string {
  const attrs = listing.attributes ?? {};
  return [
    listing.title,
    listing.description ?? "",
    String(attrs.skelbiuCategory ?? ""),
    String(attrs.deviceModel ?? ""),
    String(attrs.manufacturer ?? ""),
    String(attrs.brand ?? ""),
    String(attrs.make ?? ""),
    String(attrs.model ?? ""),
  ]
    .join(" ")
    .toLowerCase();
}

function looksLikeVehicle(listing: Listing, blob: string): boolean {
  if (listing.category === "vehicles" || listing.category === "transport") {
    return true;
  }
  const attrs = listing.attributes ?? {};
  if (attrs.make || attrs.mileage || attrs.vin || attrs.bodyType || attrs.fuelType) {
    return true;
  }
  return isVehicleQuery(blob) || VEHICLE_BRAND_PATTERN.test(blob);
}

/**
 * Public display category — vehicle brands always win over stale electronics/clothing
 * fallbacks (e.g. Citroën must never show ELEKTRONIKA).
 */
export function resolveDisplayListingCategory(listing: Listing): ListingCategory {
  const attrs = listing.attributes ?? {};
  const category = resolveEffectiveListingCategory(listing.category, attrs);
  const blob = listingTextBlob(listing);

  // Automotive first — never allow electronics/clothing overrides on cars.
  if (looksLikeVehicle(listing, blob) && !APPAREL_TEXT_RE.test(blob)) {
    // Guard: pure electronics gadgets with coincidental brand noise stay electronics.
    if (
      ELECTRONICS_TEXT_RE.test(blob) &&
      !VEHICLE_BRAND_PATTERN.test(blob) &&
      !attrs.mileage &&
      !attrs.vin &&
      listing.category === "electronics"
    ) {
      return "electronics";
    }
    return "vehicles";
  }

  if (INSTRUMENT_TEXT_RE.test(blob) && !APPAREL_TEXT_RE.test(blob)) {
    if (category === "clothing" || category === "vehicles") {
      return "other";
    }
  }

  // Remap misclassified fashion/other → electronics only — NEVER vehicles.
  if (ELECTRONICS_TEXT_RE.test(blob) && !APPAREL_TEXT_RE.test(blob)) {
    if (category === "clothing" || category === "other") {
      return "electronics";
    }
  }

  return category;
}

/** Schema-less detail rows: only populated attribute map entries. */
export function getListingDetailRows(listing: Listing): ListingDetailRow[] {
  const category = resolveDisplayListingCategory(listing);
  return getDynamicAttributeEntries(
    listing.attributes as Record<string, unknown>,
    category
  ).map((e) => ({ label: e.label, value: e.value }));
}

export function getCategoryLabel(listing: Listing): string {
  const attrs = listing.attributes ?? {};
  const skelbiu = String(attrs.skelbiuCategory ?? "").trim();
  if (skelbiu) return skelbiu;

  const vautoCat = String(attrs._vautoCategory ?? "")
    .trim()
    .toUpperCase();
  if (vautoCat === "MUZIKA") return "Muzika / Instrumentai";
  if (vautoCat === "LAISVALAIKIS") return "Laisvalaikis";
  if (vautoCat === "MENAS") return "Menas";
  if (vautoCat === "SPORTAS") return "Sportas";

  const blob = listingTextBlob(listing);
  if (INSTRUMENT_TEXT_RE.test(blob) && !APPAREL_TEXT_RE.test(blob)) {
    return "Muzika / Instrumentai";
  }

  const category = resolveDisplayListingCategory(listing);
  return (
    PUBLIC_CATEGORY_LABELS[category] ??
    getAdaptiveConfig(listingToAdaptiveKey(category)).label
  );
}

export function getListingAdaptiveKey(listing: Listing): AdaptiveCategoryKey {
  return listingToAdaptiveKey(resolveDisplayListingCategory(listing));
}
