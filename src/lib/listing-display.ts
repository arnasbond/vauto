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
  return phone;
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
