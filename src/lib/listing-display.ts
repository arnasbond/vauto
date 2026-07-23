import {
  getAdaptiveConfig,
  listingToAdaptiveKey,
  type AdaptiveCategoryKey,
} from "@/lib/adaptive-categories";
import { resolveEffectiveListingCategory } from "@/lib/listing-attribute-isolation";
import { getDynamicAttributeEntries } from "@/lib/listing-dynamic-attributes";
import type { Listing, ListingCategory } from "@/lib/types";

const DEMO_PHONE = "+37061234567";

const ELECTRONICS_TEXT_RE =
  /\b(vert[eė]j|translator|elektron|gadget|telefon|iphone|samsung|xiaomi|peiko|ausin|plan[sš]et|televiz|notebook|ne[sš]iojam)/i;

const INSTRUMENT_TEXT_RE =
  /\b(gitar|guitar|hohner|muzik|pianin|būgn|bugn|drum|smuik|akustin|bosin|ukulel)/i;

const APPAREL_TEXT_RE =
  /\b(striuk|džins|dzins|suknel|mar[sš]kin|kelm|sportbač|batai|šalik|kepur|drabuž|aprang)/i;

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

/**
 * Public display category — corrects misclassified electronics so labels stay vertical-correct.
 * Specs themselves are schema-less (dynamic attribute map only).
 */
export function resolveDisplayListingCategory(listing: Listing): ListingCategory {
  const attrs = listing.attributes ?? {};
  const category = resolveEffectiveListingCategory(listing.category, attrs);
  const blob = [
    listing.title,
    listing.description ?? "",
    String(attrs.skelbiuCategory ?? ""),
    String(attrs.deviceModel ?? ""),
    String(attrs.manufacturer ?? ""),
    String(attrs.brand ?? ""),
  ]
    .join(" ")
    .toLowerCase();

  if (INSTRUMENT_TEXT_RE.test(blob) && !APPAREL_TEXT_RE.test(blob)) {
    if (category === "clothing" || category === "vehicles") {
      return "other";
    }
  }

  if (ELECTRONICS_TEXT_RE.test(blob) && !APPAREL_TEXT_RE.test(blob)) {
    if (category === "clothing" || category === "other" || category === "vehicles") {
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
  const category = resolveDisplayListingCategory(listing);
  return getAdaptiveConfig(listingToAdaptiveKey(category)).label;
}

export function getListingAdaptiveKey(listing: Listing): AdaptiveCategoryKey {
  return listingToAdaptiveKey(resolveDisplayListingCategory(listing));
}
