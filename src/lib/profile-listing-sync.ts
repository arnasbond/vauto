import { isPlaceholderCity } from "@/lib/city-resolve";
import { verifiedProfileCity } from "@/lib/listing-location-context";
import {
  draftPatchFromParsedContacts,
  normalizeLtPhoneLenient,
  parseListingContactFromText,
  textContainsListingContactSignals,
} from "@/lib/listing-contact-parse";
import { normalizeKnownListingCity } from "@/lib/city-resolve";
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
  user: Pick<
    UserProfile,
    "phone" | "city" | "email" | "vatCode" | "companyName" | "companyCode"
  >
): ProfileListingContact {
  const phone = user.phone?.trim() ?? "";
  const email = user.email?.trim() ?? "";
  const location = verifiedProfileCity(user.city);
  const contact = [phone, email].filter(Boolean).join(" · ");
  const vatCode = user.vatCode?.trim() ?? "";
  const companyName = user.companyName?.trim() ?? "";
  const companyCode = user.companyCode?.trim() ?? "";

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
      ...(vatCode ? { vatCode } : {}),
      ...(companyName ? { companyName } : {}),
      ...(companyCode ? { companyCode } : {}),
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
  user: Pick<
    UserProfile,
    "phone" | "city" | "email" | "vatCode" | "companyName" | "companyCode"
  >,
  isAuthenticated: boolean,
  opts?: { onlyIfEmpty?: boolean }
): AiExtractedListing {
  if (!isAuthenticated) return draft;
  // Profile city/phone are authority — inject even when only city exists.
  const hasAnyProfile =
    hasProfileListingContact(user) || Boolean(user.city?.trim());
  if (!hasAnyProfile) return draft;

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
  if (user.vatCode?.trim()) attrs.vatCode = user.vatCode.trim();
  if (user.companyName?.trim()) attrs.companyName = user.companyName.trim();
  if (user.companyCode?.trim()) attrs.companyCode = user.companyCode.trim();
  attrs.profileContactSynced = "true";

  return {
    ...draft,
    location: location || draft.location,
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
  /(?:\+370[\s-]*)?(?:\(?0?\)?[\s-]*)?(?:[86](?:[\s-]*\d){7,8}|\d(?:[\s-]*\d){7,8})\b/;

export interface ExtractedUserContacts {
  phone?: string;
  email?: string;
}

function isValidLtMobilePhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 8;
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
    const normalized = normalizeLtPhoneLenient(phoneMatch[0].replace(/\s+/g, ""));
    if (normalized && isValidLtMobilePhone(normalized)) {
      phone = normalized;
    }
  }

  return { phone, email };
}

/** Profile patch for missing contact fields discovered in chat (does not overwrite existing). */
export function resolveProactiveProfileContactPatch(
  user: Pick<UserProfile, "phone" | "email" | "city">,
  text: string
): Partial<Pick<UserProfile, "phone" | "email" | "city">> {
  const parsed = parseListingContactFromText(text);
  const patch: Partial<Pick<UserProfile, "phone" | "email" | "city">> = {};

  if (parsed.phone && !user.phone?.trim()) {
    patch.phone = parsed.phone;
  }
  if (parsed.email && !user.email?.trim()) {
    patch.email = parsed.email;
  }
  if (parsed.city && !normalizeKnownListingCity(user.city)) {
    patch.city = parsed.city;
  }

  return patch;
}

export function buildProactiveProfileContactConfirmation(
  saved: { phone?: boolean; email?: boolean; city?: boolean },
  hasListingDraft: boolean
): string | null {
  if (!saved.phone && !saved.email && !saved.city) return null;

  const parts: string[] = [];
  if (saved.phone) parts.push("telefono numerį");
  if (saved.email) parts.push("el. paštą");
  if (saved.city) parts.push("miestą");
  const label = parts.join(" ir ");

  const base =
    `Puiku, įrašiau ${label} į skelbimą ir automatiškai atnaujinau jūsų profilio duomenis, kad kitą kartą nebereikėtų vesti iš naujo!`;

  return hasListingDraft
    ? `${base} Ar dabar viskas tinka publikavimui?`
    : base;
}

export function isContactOnlyUserMessage(text: string): boolean {
  if (textContainsListingContactSignals(text)) {
    const parsed = parseListingContactFromText(text);
    if (!parsed.hasAny) return false;
    let remainder = text;
    if (parsed.email) remainder = remainder.replace(parsed.email, " ");
    if (parsed.phone) {
      remainder = remainder.replace(
        new RegExp(parsed.phone.replace(/[+]/g, "\\+"), "gi"),
        " "
      );
      remainder = remainder.replace(LT_PHONE_PATTERN, " ");
    }
    if (parsed.city) {
      remainder = remainder.replace(new RegExp(parsed.city, "gi"), " ");
    }
    if (parsed.contactName) {
      remainder = remainder.replace(new RegExp(parsed.contactName, "gi"), " ");
    }
    return remainder.replace(/[\s,.:;!?\-–—()]+/g, "").length < 3;
  }

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

  const parsed = parseListingContactFromText(input.text);
  const patch = resolveProactiveProfileContactPatch(input.user, input.text);

  if (!parsed.hasAny && !Object.keys(patch).length) {
    return { confirmation: null, user: input.user };
  }

  let mergedUser = input.user;
  const saved = {
    phone: Boolean(patch.phone),
    email: Boolean(patch.email),
    city: Boolean(patch.city),
  };

  if (Object.keys(patch).length) {
    const ok = await input.updateUser(patch);
    if (!ok) {
      return { confirmation: null, user: input.user };
    }
    mergedUser = { ...input.user, ...patch };
  }

  if (input.aiDraft && input.updateAiDraft) {
    if (parsed.hasAny) {
      input.updateAiDraft(draftPatchFromParsedContacts(parsed));
    } else if (Object.keys(patch).length) {
      input.updateAiDraft(
        applyProfileToListingDraft(input.aiDraft, mergedUser, true, {
          onlyIfEmpty: false,
        })
      );
    }
  }

  const confirmation =
    parsed.hasAny
      ? null
      : buildProactiveProfileContactConfirmation(saved, Boolean(input.aiDraft));

  return {
    confirmation,
    user: mergedUser,
  };
}
