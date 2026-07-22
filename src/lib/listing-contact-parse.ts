import { detectCityFuzzy } from "@/lib/lt-cities";
import { isValidListingPhone } from "@/lib/listing-form-validation";
import type { AiExtractedListing } from "@/lib/types";

export type AwaitingContactField = "phone" | "city";

const AWAITING_CONTACT_KEY = "vauto_awaiting_contact_field_v1";

const LT_PHONE_CANDIDATE =
  /(?:\+370[\s-]*)?(?:\(?0\)?[\s-]*)?(?:[86](?:[\s-]*\d){7,8}|\d(?:[\s-]*\d){7,8})\b/g;

const EMAIL_PATTERN =
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/;

export interface ParsedListingContacts {
  phone?: string;
  phoneDisplay?: string;
  city?: string;
  contactName?: string;
  email?: string;
  hasAny: boolean;
}

/** Lenient LT mobile normalization — accepts 06..., 86..., +370..., 6... */
export function normalizeLtPhoneLenient(raw: string): string | undefined {
  let digits = raw.replace(/\D/g, "");
  if (!digits) return undefined;

  if (digits.startsWith("370") && digits.length >= 11) {
    digits = digits.slice(0, 11);
  } else if (digits.length === 9 && digits.startsWith("86")) {
    digits = `370${digits.slice(1)}`;
  } else if (digits.length === 9 && digits.startsWith("85")) {
    digits = `370${digits.slice(1)}`;
  } else if (digits.length === 9 && digits.startsWith("0")) {
    digits = `370${digits.slice(1)}`;
  } else if (digits.length === 8 && digits.startsWith("6")) {
    digits = `370${digits}`;
  } else if (digits.length > 11 && digits.startsWith("370")) {
    digits = digits.slice(0, 11);
  }

  if (digits.length === 11 && digits.startsWith("370") && /^370[356]/.test(digits)) {
    return `+${digits}`;
  }

  if (digits.length >= 8) {
    if (digits.startsWith("370")) return `+${digits.slice(0, 11)}`;
    if (digits.length === 8 && digits.startsWith("6")) return `+370${digits}`;
    if (digits.length === 9 && digits.startsWith("8")) return `+370${digits.slice(1)}`;
  }

  return undefined;
}

export function formatPhoneForDisplay(phone: string): string {
  const normalized = normalizeLtPhoneLenient(phone);
  if (!normalized) return phone.trim();
  const digits = normalized.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("370")) {
    return `0${digits.slice(3)}`;
  }
  return normalized;
}

export function extractPhoneFromText(text: string): string | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;

  const candidates = trimmed.match(LT_PHONE_CANDIDATE) ?? [];
  for (const raw of candidates) {
    const normalized = normalizeLtPhoneLenient(raw);
    if (normalized && isValidListingPhone(normalized)) return normalized;
  }

  const loose = trimmed.match(/\+?\d[\d\s()-]{6,18}\d/g) ?? [];
  for (const raw of loose) {
    const normalized = normalizeLtPhoneLenient(raw);
    if (normalized && isValidListingPhone(normalized)) return normalized;
  }

  return undefined;
}

export function extractCityFromText(text: string): string | undefined {
  return detectCityFuzzy(text);
}

/** Currency / price tokens must NEVER become contactName (e.g. "2250 eur" → "Euru"). */
const CURRENCY_NAME_STOPWORDS =
  /^(eur|euru|eurų|eurus|euro|euros|eura|€|ltl|cent|centai|kaina|price|uz|už)$/i;

/** Explicit name-change only — never infer names from free price/spec chat. */
const EXPLICIT_NAME_CHANGE_RE =
  /(?:pakeisk|keisk|nustatyk|įrašyk|irasyk)\s+(?:kontaktin[iį]?\s+)?vard[aą]\s+[įi]\s+([A-Za-zĄ-ž]{2,24})/i;

function extractContactName(
  text: string,
  phone?: string,
  city?: string
): string | undefined {
  const explicit = text.match(EXPLICIT_NAME_CHANGE_RE);
  if (explicit?.[1]) {
    const name = explicit[1];
    if (CURRENCY_NAME_STOPWORDS.test(name)) return undefined;
    return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
  }

  // Without an explicit name-change command, never invent contactName from leftovers
  // (price currency words like "eur" / "Euru" previously leaked here).
  void phone;
  void city;
  return undefined;
}

export function parseListingContactFromText(
  text: string,
  opts?: { prioritizeField?: AwaitingContactField }
): ParsedListingContacts {
  const trimmed = text.trim();
  if (!trimmed) return { hasAny: false };

  const emailMatch = trimmed.match(EMAIL_PATTERN);
  const email = emailMatch?.[0]?.trim().toLowerCase();

  let phone: string | undefined;
  let city: string | undefined;

  if (!opts?.prioritizeField || opts.prioritizeField === "phone") {
    phone = extractPhoneFromText(trimmed);
  }
  if (!opts?.prioritizeField || opts.prioritizeField === "city") {
    city = extractCityFromText(trimmed);
  }

  const contactName = extractContactName(trimmed, phone, city);

  const hasAny = Boolean(phone || city || contactName || email);
  return {
    ...(phone ? { phone, phoneDisplay: formatPhoneForDisplay(phone) } : {}),
    ...(city ? { city } : {}),
    ...(contactName ? { contactName } : {}),
    ...(email ? { email } : {}),
    hasAny,
  };
}

export function textContainsListingContactSignals(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (EMAIL_PATTERN.test(trimmed)) return true;
  if (extractPhoneFromText(trimmed)) return true;
  if (extractCityFromText(trimmed)) return true;
  return false;
}

export function buildListingContactUpdateReply(
  parsed: ParsedListingContacts
): string {
  const lines = ["✅ Atnaujinome jūsų kontaktus:"];
  if (parsed.phoneDisplay || parsed.phone) {
    lines.push(`* Telefonas: ${parsed.phoneDisplay ?? parsed.phone}`);
  }
  if (parsed.city) {
    lines.push(`* Miestas: ${parsed.city}`);
  }
  if (parsed.contactName) {
    lines.push(`* Kontaktinis vardas: ${parsed.contactName}`);
  }
  if (parsed.email) {
    lines.push(`* El. paštas: ${parsed.email}`);
  }
  lines.push(
    "",
    "Jei viskas teisingai — galite bandyti publikuoti dar kartą."
  );
  return lines.join("\n");
}

export function applyParsedContactsToDraft(
  draft: AiExtractedListing,
  parsed: ParsedListingContacts
): AiExtractedListing {
  const attrs = { ...(draft.attributes ?? {}) };
  let location = draft.location;
  let contact = draft.contact;

  if (parsed.phone) {
    attrs.phone = parsed.phone;
    const emailPart = parsed.email ?? String(attrs.email ?? "").trim();
    contact = [parsed.phone, emailPart].filter(Boolean).join(" · ");
    attrs.contact = contact;
  }
  if (parsed.email) {
    attrs.email = parsed.email;
    if (!parsed.phone) {
      contact = [String(attrs.phone ?? "").trim(), parsed.email]
        .filter(Boolean)
        .join(" · ");
      attrs.contact = contact;
    }
  }
  if (parsed.city) {
    location = parsed.city;
    attrs.location = parsed.city;
  }
  if (parsed.contactName) {
    attrs.contactName = parsed.contactName;
  }

  return {
    ...draft,
    location,
    contact,
    attributes: attrs,
  };
}

export function draftPatchFromParsedContacts(
  parsed: ParsedListingContacts
): Partial<AiExtractedListing> {
  const draftShell: AiExtractedListing = {
    category: "other",
    title: "",
    price: 0,
    location: "",
    contact: "",
    confidence: 0.5,
    attributes: {},
  };
  const merged = applyParsedContactsToDraft(draftShell, parsed);
  return {
    location: merged.location,
    contact: merged.contact,
    attributes: merged.attributes,
  };
}

export function readAwaitingContactField(): AwaitingContactField | null {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(AWAITING_CONTACT_KEY);
  return raw === "phone" || raw === "city" ? raw : null;
}

export function setAwaitingContactField(field: AwaitingContactField | null): void {
  if (typeof window === "undefined") return;
  if (!field) {
    window.sessionStorage.removeItem(AWAITING_CONTACT_KEY);
    return;
  }
  window.sessionStorage.setItem(AWAITING_CONTACT_KEY, field);
}

export const CONTACT_CAPTURE_PHONE_PROMPT =
  "Parašykite tik savo telefono numerį (pvz. 068876808 arba +370 688 76808):";

export const CONTACT_CAPTURE_CITY_PROMPT =
  "Parašykite tik savo miestą (pvz. Kaišiadorys, Vilnius arba Kaunas):";

export function buildMissingContactFieldsPrompt(input: {
  missingPhone: boolean;
  missingCity: boolean;
  missingPhoto: boolean;
}): { reply: string; quickReplies: string[] } {
  const hints: string[] = [];
  const chips: string[] = [];

  if (input.missingPhone) {
    hints.push("telefono numerį");
    chips.push("Telefono numeris");
  }
  if (input.missingCity) {
    hints.push("miestą");
    chips.push("Miestas");
  }
  if (input.missingPhoto) {
    hints.push("bent vieną nuotrauką");
    chips.push("Įkelti nuotraukas");
  }

  const reply =
    hints.length > 0
      ? `Kad galėtume publikuoti, reikia ${hints.join(" ir ")}. Pasirinkite, ką norite suvesti dabar, arba parašykite viską vienu pranešimu (pvz. „068876808 Kaišiadorys“).`
      : "Viskas paruošta — galite bandyti publikuoti dar kartą.";

  if (!chips.includes("Reikia pataisyti")) {
    chips.push("Reikia pataisyti");
  }

  return { reply, quickReplies: chips.slice(0, 4) };
}
