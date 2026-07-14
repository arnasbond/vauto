/**
 * Listing contact parsing — phone, city, contact name from free-form chat.
 * Never append these tokens to title/description.
 */

const LT_CITIES = [
  "Vilnius", "Kaunas", "Klaipėda", "Šiauliai", "Panevėžys", "Alytus",
  "Marijampolė", "Mažeikiai", "Jonava", "Utena", "Telšiai", "Tauragė",
  "Ukmergė", "Plungė", "Kėdainiai", "Raseiniai", "Druskininkai", "Palanga",
  "Biržai", "Pasvalys", "Rokiškis", "Kupiškis", "Kretinga", "Gargždai",
  "Visaginas", "Kaišiadorys", "Elektrėnai", "Molėtai", "Anykščiai",
  "Pakruojis", "Radviliškis", "Jurbarkas", "Skuodas", "Trakai",
];

const LT_PHONE_CANDIDATE =
  /(?:\+370[\s-]*)?(?:\(?0\)?[\s-]*)?(?:[86](?:[\s-]*\d){7,8}|\d(?:[\s-]*\d){7,8})\b/g;

const EMAIL_PATTERN =
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/;

function foldLt(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

function isValidListingPhone(phone: string): boolean {
  return phone.replace(/\D/g, "").length >= 8;
}

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
  const norm = foldLt(text);
  const sorted = [...LT_CITIES].sort((a, b) => foldLt(b).length - foldLt(a).length);
  for (const city of sorted) {
    if (norm.includes(foldLt(city))) return city;
  }
  return undefined;
}

function extractContactName(
  text: string,
  phone?: string,
  city?: string
): string | undefined {
  let remainder = text;
  if (phone) {
    remainder = remainder.replace(
      new RegExp(phone.replace(/[+]/g, "\\+"), "gi"),
      " "
    );
    remainder = remainder.replace(LT_PHONE_CANDIDATE, " ");
  }
  if (city) {
    remainder = remainder.replace(new RegExp(city, "gi"), " ");
    remainder = remainder.replace(new RegExp(foldLt(city), "gi"), " ");
  }
  remainder = remainder.replace(EMAIL_PATTERN, " ");

  const words = remainder
    .split(/[\s,.;:!?()[\]{}"'-]+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 2);

  const filtered = words.filter(
    (w) =>
      !/^(taip|ne|gerai|ok|ir|ar|bei|mano|numeris|tel|telefonas|miestas|city)$/i.test(
        w
      ) && !/^\d+$/.test(w)
  );

  if (filtered.length === 1 && /^[A-Za-zĄ-ž]{2,24}$/.test(filtered[0]!)) {
    const name = filtered[0]!;
    return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
  }

  return undefined;
}

export interface ParsedListingContacts {
  phone?: string;
  phoneDisplay?: string;
  city?: string;
  contactName?: string;
  email?: string;
  hasAny: boolean;
}

export function parseListingContactFromText(text: string): ParsedListingContacts {
  const trimmed = text.trim();
  if (!trimmed) return { hasAny: false };

  const emailMatch = trimmed.match(EMAIL_PATTERN);
  const email = emailMatch?.[0]?.trim().toLowerCase();
  const phone = extractPhoneFromText(trimmed);
  const city = extractCityFromText(trimmed);
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

export function applyParsedContactsToListingDraft(
  draft: {
    title?: string;
    description?: string;
    price?: number;
    location?: string;
    category?: string;
    attributes?: Record<string, string>;
  },
  parsed: ParsedListingContacts
): {
  title?: string;
  description?: string;
  price?: number;
  location?: string;
  category?: string;
  attributes?: Record<string, string>;
} {
  const attrs = { ...(draft.attributes ?? {}) };
  let location = draft.location;

  if (parsed.phone) {
    attrs.phone = parsed.phone;
    const emailPart = parsed.email ?? String(attrs.email ?? "").trim();
    attrs.contact = [parsed.phone, emailPart].filter(Boolean).join(" · ");
  }
  if (parsed.email) {
    attrs.email = parsed.email;
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
    attributes: attrs,
  };
}
