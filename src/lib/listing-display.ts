import {
  getAdaptiveConfig,
  listingToAdaptiveKey,
} from "@/lib/adaptive-categories";
import type { Listing } from "@/lib/types";

const DEMO_PHONE = "+37061234567";

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

export function getListingDetailRows(listing: Listing): ListingDetailRow[] {
  const rows: ListingDetailRow[] = [];
  const config = getAdaptiveConfig(listingToAdaptiveKey(listing.category));
  const attrs = listing.attributes ?? {};

  for (const field of config.fields) {
    const val = attrs[field.key];
    if (val === undefined || val === null || val === "") continue;
    if (field.key.startsWith("_")) continue;

    const display = Array.isArray(val) ? val.join(", ") : String(val);
    if (display.trim()) rows.push({ label: field.label, value: display });
  }

  return rows;
}

export function getCategoryLabel(listing: Listing): string {
  return getAdaptiveConfig(listingToAdaptiveKey(listing.category)).label;
}
