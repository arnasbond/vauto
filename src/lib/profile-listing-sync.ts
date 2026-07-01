import { isPlaceholderCity, resolveListingCity } from "@/lib/city-resolve";
import type { AiExtractedListing, CategoryAttributes, UserProfile } from "@/lib/types";

export interface ProfileListingContact {
  contact: string;
  location: string;
  phone: string;
  email: string;
  attributes: CategoryAttributes;
}

function isEmptyValue(value: string | undefined | null): boolean {
  return !String(value ?? "").trim();
}

/** Build contact fields from authenticated user profile. */
export function buildProfileListingContact(
  user: Pick<UserProfile, "phone" | "city" | "email">
): ProfileListingContact {
  const phone = user.phone?.trim() ?? "";
  const email = user.email?.trim() ?? "";
  const location = resolveListingCity(user.city, "Vilnius");
  const contact = [phone, email].filter(Boolean).join(" · ");

  return {
    contact,
    location,
    phone,
    email,
    attributes: {
      contact,
      location,
      ...(phone ? { phone } : {}),
      ...(email ? { email } : {}),
      profileContactSynced: "true",
    },
  };
}

export function hasProfileListingContact(
  user: Pick<UserProfile, "phone" | "city" | "email">
): boolean {
  return Boolean(user.phone?.trim() || user.email?.trim());
}

/** Merge profile phone/city/email into draft when authenticated (only fills empty slots by default). */
export function applyProfileToListingDraft(
  draft: AiExtractedListing,
  user: Pick<UserProfile, "phone" | "city" | "email">,
  isAuthenticated: boolean,
  opts?: { onlyIfEmpty?: boolean }
): AiExtractedListing {
  if (!isAuthenticated || !hasProfileListingContact(user)) return draft;

  const profile = buildProfileListingContact(user);
  const onlyIfEmpty = opts?.onlyIfEmpty !== false;

  const location =
    onlyIfEmpty && !isPlaceholderCity(draft.location)
      ? draft.location
      : profile.location || draft.location;

  const contact =
    onlyIfEmpty && !isEmptyValue(draft.contact)
      ? draft.contact
      : profile.contact || draft.contact;

  const prevAttrs = draft.attributes ?? {};
  const attrs: CategoryAttributes = { ...prevAttrs };

  if (!onlyIfEmpty || isEmptyValue(String(attrs.contact ?? ""))) {
    attrs.contact = contact;
  }
  if (!onlyIfEmpty || isPlaceholderCity(String(attrs.location ?? draft.location))) {
    attrs.location = location;
  }
  if (profile.phone && (!onlyIfEmpty || isEmptyValue(String(attrs.phone ?? "")))) {
    attrs.phone = profile.phone;
  }
  if (profile.email && (!onlyIfEmpty || isEmptyValue(String(attrs.email ?? "")))) {
    attrs.email = profile.email;
  }
  if (hasProfileListingContact(user)) {
    attrs.profileContactSynced = "true";
  }

  return {
    ...draft,
    location,
    contact,
    attributes: attrs,
  };
}

export function resolveDraftContact(
  draft: { contact?: string; attributes?: CategoryAttributes },
  user?: Pick<UserProfile, "phone" | "email">
): string {
  const fromDraft = draft.contact?.trim();
  if (fromDraft) return fromDraft;
  const fromAttrs = String(draft.attributes?.contact ?? "").trim();
  if (fromAttrs) return fromAttrs;
  const phone = user?.phone?.trim() ?? "";
  const email = user?.email?.trim() ?? "";
  return [phone, email].filter(Boolean).join(" · ");
}
