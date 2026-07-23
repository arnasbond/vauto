import {
  getAdaptiveConfig,
  listingToAdaptiveKey,
  type AdaptiveCategoryKey,
} from "@/lib/adaptive-categories";
import { resolveEffectiveListingCategory } from "@/lib/listing-attribute-isolation";
import type { Listing, ListingCategory } from "@/lib/types";

const DEMO_PHONE = "+37061234567";

/** Vehicle-only specification keys — never show on non-auto listings. */
const AUTOMOTIVE_SPEC_KEYS = new Set([
  "make",
  "model",
  "year",
  "registrationMonth",
  "mileage",
  "engineCc",
  "powerKw",
  "powerHp",
  "fuelType",
  "gearbox",
  "bodyType",
  "steering",
  "driveType",
  "defects",
  "vehicleOptions",
  "taExpiry",
  "sdkCode",
  "vin",
]);

/** Fashion-only keys — hide when the listing is not clothing. */
const FASHION_SPEC_KEYS = new Set([
  "size",
  "clothingType",
  "fashionSubcategory",
  "fashionCategory",
  "colors",
  "shippingOptions",
  "brand",
]);

const ELECTRONICS_TEXT_RE =
  /\b(vert[eė]j|translator|elektron|gadget|telefon|iphone|samsung|xiaomi|peiko|ausin|plan[sš]et|televiz|notebook|ne[sš]iojam)/i;

const APPAREL_TEXT_RE =
  /\b(striuk|džins|dzins|suknel|mar[sš]kin|kelm|sportbač|batai|batai|šalik|kepur|drabuž|aprang)/i;

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
 * Public display category — corrects misclassified electronics (e.g. Peiko Translator
 * stored as clothing with fashion artifacts) so specs/labels stay vertical-correct.
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

  if (ELECTRONICS_TEXT_RE.test(blob) && !APPAREL_TEXT_RE.test(blob)) {
    if (category === "clothing" || category === "other" || category === "vehicles") {
      return "electronics";
    }
  }

  return category;
}

function attrDisplayValue(
  attrs: Record<string, unknown>,
  key: string
): string | null {
  const val = attrs[key];
  if (val === undefined || val === null || val === "") return null;
  const display = Array.isArray(val) ? val.join(", ") : String(val);
  const trimmed = display.trim();
  return trimmed || null;
}

export function getListingDetailRows(listing: Listing): ListingDetailRow[] {
  const rows: ListingDetailRow[] = [];
  const category = resolveDisplayListingCategory(listing);
  const adaptiveKey = listingToAdaptiveKey(category);
  const config = getAdaptiveConfig(adaptiveKey);
  const attrs = (listing.attributes ?? {}) as Record<string, unknown>;
  const isVehicles = adaptiveKey === "vehicles" || adaptiveKey === "transport";
  const isClothing = adaptiveKey === "clothing";

  for (const field of config.fields) {
    if (field.key.startsWith("_")) continue;
    if (!isVehicles && AUTOMOTIVE_SPEC_KEYS.has(field.key)) continue;
    if (!isClothing && FASHION_SPEC_KEYS.has(field.key)) continue;

    const display = attrDisplayValue(attrs, field.key);
    if (!display) continue;
    rows.push({ label: field.label, value: display });
  }

  // Electronics often stores brand under fashion "brand" — surface as Gamintojas.
  if (adaptiveKey === "electronics") {
    const manufacturer =
      attrDisplayValue(attrs, "manufacturer") ?? attrDisplayValue(attrs, "brand");
    if (manufacturer && !rows.some((r) => r.label === "Gamintojas")) {
      rows.unshift({ label: "Gamintojas", value: manufacturer });
    }
    const model = attrDisplayValue(attrs, "deviceModel");
    if (model && !rows.some((r) => r.label === "Modelis")) {
      rows.push({ label: "Modelis", value: model });
    }
    const condition = attrDisplayValue(attrs, "condition");
    if (condition && !rows.some((r) => r.label === "Būklė")) {
      rows.push({ label: "Būklė", value: condition });
    }
  }

  return rows;
}

export function getCategoryLabel(listing: Listing): string {
  const category = resolveDisplayListingCategory(listing);
  return getAdaptiveConfig(listingToAdaptiveKey(category)).label;
}

export function getListingAdaptiveKey(listing: Listing): AdaptiveCategoryKey {
  return listingToAdaptiveKey(resolveDisplayListingCategory(listing));
}
