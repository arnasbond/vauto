import { isPlaceholderCity } from "@/lib/city-resolve";
import { verifiedProfileCity } from "@/lib/listing-location-context";
import { normalizeLtPhoneForApi } from "@/lib/phone-input";
import type { AiExtractedListing, CategoryAttributes, UserProfile } from "@/lib/types";

/** Shown by supervisor when draft is ready — contacts come from profile, not chat. */
export const PROFILE_CONTACT_VERIFICATION_MESSAGE =
  "Kontaktai užpildyti iš jūsų profilio – patikrinkite ir patvirtinkite, ar viskas tinka prieš publikuojant.";

export const PUBLISH_REQUIRES_AUTH_MESSAGE =
  "Publikavimui reikia prisijungti prie paskyros.";

export const PUBLISH_REQUIRES_PROFILE_CONTACT_MESSAGE =
  "Profilyje nėra patvirtinto telefono ar el. pašto — užpildykite profilį prieš publikuojant.";

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
  const location = verifiedProfileCity(user.city);
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
      : profile.location || (onlyIfEmpty ? draft.location : "");

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
  const phone = user?.phone?.trim() ?? "";
  const email = user?.email?.trim() ?? "";
  const fromProfile = [phone, email].filter(Boolean).join(" · ");
  if (fromProfile) return fromProfile;

  const fromDraft = draft.contact?.trim();
  if (fromDraft) return fromDraft;
  const fromAttrs = String(draft.attributes?.contact ?? "").trim();
  if (fromAttrs) return fromAttrs;
  return "";
}

/** Force profile phone/email/id into draft immediately before publish or agent sync. */
export function injectProfileContactsForPublish(
  draft: AiExtractedListing,
  user: Pick<UserProfile, "id" | "phone" | "email" | "city">
): AiExtractedListing {
  const withContacts = applyProfileToListingDraft(draft, user, true, {
    onlyIfEmpty: false,
  });
  const profile = buildProfileListingContact(user);
  return {
    ...withContacts,
    contact: profile.contact,
    attributes: {
      ...(withContacts.attributes ?? {}),
      ...profile.attributes,
      ...(user.id?.trim() ? { sellerId: user.id.trim() } : {}),
    },
  };
}

export function validatePublishSession(
  isAuthenticated: boolean,
  user: Pick<UserProfile, "id" | "phone" | "email" | "city">
): { ok: true } | { ok: false; message: string } {
  if (!isAuthenticated || !user.id?.trim()) {
    return { ok: false, message: PUBLISH_REQUIRES_AUTH_MESSAGE };
  }
  if (!hasProfileListingContact(user)) {
    return { ok: false, message: PUBLISH_REQUIRES_PROFILE_CONTACT_MESSAGE };
  }
  return { ok: true };
}

const EMAIL_PATTERN =
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/;
const LT_PHONE_PATTERN =
  /(?:\+370[\s-]*)?(?:\(?0?\)?[\s-]*)?(?:6[\d\s-]{7,8}|8(?:6|5)\d{7})\b/;

export interface ExtractedUserContacts {
  phone?: string;
  email?: string;
}

function isValidLtMobilePhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, "");
  return digits.length === 11 && digits.startsWith("370") && /^370[356]/.test(digits);
}

/** Parse phone or email the user typed in free-form chat text. */
export function extractContactsFromUserText(text: string): ExtractedUserContacts {
  const trimmed = text.trim();
  if (!trimmed) return {};

  const emailMatch = trimmed.match(EMAIL_PATTERN);
  const email = emailMatch?.[0]?.trim().toLowerCase();

  const phoneMatch = trimmed.match(LT_PHONE_PATTERN);
  let phone: string | undefined;
  if (phoneMatch?.[0]) {
    const normalized = normalizeLtPhoneForApi(phoneMatch[0].replace(/\s+/g, ""));
    if (isValidLtMobilePhone(normalized)) {
      phone = normalized;
    }
  }

  return { phone, email };
}

/** Profile patch for missing contact fields discovered in chat (does not overwrite existing). */
export function resolveProactiveProfileContactPatch(
  user: Pick<UserProfile, "phone" | "email">,
  text: string
): Partial<Pick<UserProfile, "phone" | "email">> {
  const extracted = extractContactsFromUserText(text);
  const patch: Partial<Pick<UserProfile, "phone" | "email">> = {};

  if (extracted.phone && !user.phone?.trim()) {
    patch.phone = extracted.phone;
  }
  if (extracted.email && !user.email?.trim()) {
    patch.email = extracted.email;
  }

  return patch;
}

export function buildProactiveProfileContactConfirmation(
  saved: { phone?: boolean; email?: boolean },
  hasListingDraft: boolean
): string | null {
  if (!saved.phone && !saved.email) return null;

  const label = saved.phone && saved.email
    ? "telefono numerį ir el. paštą"
    : saved.phone
      ? "telefono numerį"
      : "el. paštą";

  const base =
    `Puiku, įrašiau ${label} į skelbimą ir automatiškai atnaujinau jūsų profilio duomenis, kad kitą kartą nebereikėtų vesti iš naujo!`;

  return hasListingDraft
    ? `${base} Ar dabar viskas tinka publikavimui?`
    : base;
}

export function isContactOnlyUserMessage(text: string): boolean {
  const extracted = extractContactsFromUserText(text);
  if (!extracted.phone && !extracted.email) return false;

  let remainder = text;
  if (extracted.email) {
    remainder = remainder.replace(extracted.email, " ");
  }
  if (extracted.phone) {
    remainder = remainder.replace(
      new RegExp(extracted.phone.replace(/[+]/g, "\\+"), "i"),
      " "
    );
    const digits = extracted.phone.replace(/\D/g, "");
    remainder = remainder.replace(new RegExp(digits.slice(-8), "g"), " ");
  }
  remainder = remainder.replace(LT_PHONE_PATTERN, " ").replace(EMAIL_PATTERN, " ");
  return remainder.replace(/[\s,.:;!?\-–—()]+/g, "").length < 3;
}

/** Persist chat-discovered contacts to profile (+ optional listing draft) without blocking UI. */
export async function syncProfileContactsFromChat(input: {
  text: string;
  user: Pick<UserProfile, "id" | "phone" | "email" | "city">;
  isAuthenticated: boolean;
  aiDraft: AiExtractedListing | null;
  updateUser: (patch: Partial<UserProfile>) => Promise<boolean>;
  updateAiDraft?: (patch: Partial<AiExtractedListing>) => void;
}): Promise<{
  confirmation: string | null;
  user: Pick<UserProfile, "id" | "phone" | "email" | "city">;
}> {
  if (!input.isAuthenticated) {
    return { confirmation: null, user: input.user };
  }

  const patch = resolveProactiveProfileContactPatch(input.user, input.text);
  if (!Object.keys(patch).length) {
    return { confirmation: null, user: input.user };
  }

  const saved = { phone: Boolean(patch.phone), email: Boolean(patch.email) };
  const ok = await input.updateUser(patch);
  if (!ok) {
    return { confirmation: null, user: input.user };
  }

  const mergedUser = { ...input.user, ...patch };
  if (input.aiDraft && input.updateAiDraft) {
    input.updateAiDraft(
      applyProfileToListingDraft(input.aiDraft, mergedUser, true, {
        onlyIfEmpty: false,
      })
    );
  }

  return {
    confirmation: buildProactiveProfileContactConfirmation(
      saved,
      Boolean(input.aiDraft)
    ),
    user: mergedUser,
  };
}
