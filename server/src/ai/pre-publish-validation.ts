export const PRE_PUBLISH_BLOCKED_QUICK_REPLIES = [
  "Suvesti trūkstamus duomenis",
  "Įkelti nuotraukas",
  "Reikia pataisyti",
] as const;

export {
  isPublishConfirmationPhrase,
  isPublishWorkflowCommand,
  isListingWorkflowCommand,
} from "./listing-workflow-intent.js";

const PLACEHOLDER_CITIES = new Set([
  "",
  "miestas",
  "lietuva",
  "lithuania",
  "city",
  "location",
]);

function isValidListingPhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 8;
}

function isPlaceholderCity(value: string | undefined | null): boolean {
  const t = String(value ?? "").trim().toLowerCase();
  return PLACEHOLDER_CITIES.has(t);
}

function normalizeKnownCity(raw: string | undefined | null): string {
  const t = String(raw ?? "").trim();
  if (!t || isPlaceholderCity(t)) return "";
  return t.split(",")[0]?.trim() ?? "";
}

function draftHasListingPhoto(input: {
  pendingImageUrls?: string[];
  imageUrl?: string;
}): boolean {
  if (input.imageUrl?.trim()) return true;
  return (input.pendingImageUrls?.length ?? 0) > 0;
}

export function buildPrePublishBlockMessage(opts: {
  missingPhoto: boolean;
  missingPhone: boolean;
  missingCity: boolean;
  missingAuth?: boolean;
  resolvedPhone?: string;
  resolvedCity?: string;
  hasPhoto?: boolean;
}): string {
  const photoLine = opts.hasPhoto
    ? "Įkelta"
    : opts.missingPhoto
      ? "Įkelkite bent 1 nuotrauką"
      : "Įkelta";
  const phoneLine =
    opts.resolvedPhone?.trim() && !opts.missingPhone
      ? opts.resolvedPhone.trim()
      : "Nenurodytas";
  const cityLine =
    opts.resolvedCity?.trim() && !opts.missingCity
      ? opts.resolvedCity.trim()
      : "Nenurodytas";

  const lines = [
    "⚠️ Negalime publikuoti skelbimo, nes trūksta svarbių duomenų:",
    `* Nuotraukos: ${photoLine}`,
    `* Kontaktinis telefonas: ${phoneLine}`,
    `* Miestas: ${cityLine}`,
  ];

  if (opts.missingAuth) {
    lines.push("* Prisijungimas: reikalinga aktyvi paskyra");
  }

  lines.push(
    "",
    "Prašome dabar pokalbyje parašyti savo telefono numerį, miestą arba paspausti fotoaparato piktogramą ir įkelti nuotrauką!"
  );

  return lines.join("\n");
}

export function evaluateServerPrePublishReadiness(input: {
  isAuthenticated?: boolean;
  profilePhone?: string;
  profileEmail?: string;
  userCity?: string;
  contact?: string;
  listingDraft?: {
    location?: string;
    price?: number;
    attributes?: Record<string, string>;
  };
  pendingImageUrls?: string[];
  imageUrl?: string;
}): {
  ok: boolean;
  blockMessage: string;
  quickReplies: string[];
  missingPhoto: boolean;
  missingPhone: boolean;
  missingCity: boolean;
  missingPrice: boolean;
  missingAuth: boolean;
  resolvedPhone: string;
  resolvedCity: string;
  hasPhoto: boolean;
} {
  const missingAuth = !input.isAuthenticated;
  const profilePhone = input.profilePhone?.trim() ?? "";
  const draftPhone = String(input.listingDraft?.attributes?.phone ?? "").trim();
  const contactPhone = input.contact?.trim() ?? "";
  const resolvedPhone = [profilePhone, draftPhone, contactPhone].find((p) =>
    isValidListingPhone(p)
  ) ?? "";

  const resolvedCity =
    normalizeKnownCity(input.listingDraft?.location) ||
    normalizeKnownCity(input.userCity);

  const hasPhoto = draftHasListingPhoto(input);
  const missingPhoto = !hasPhoto;
  const missingPhone = !isValidListingPhone(resolvedPhone);
  const missingCity = !resolvedCity || isPlaceholderCity(resolvedCity);
  const missingPrice = (input.listingDraft?.price ?? 0) <= 0;

  const ok =
    !missingAuth && !missingPhoto && !missingPhone && !missingCity && !missingPrice;

  const blockMessage = buildPrePublishBlockMessage({
    missingPhoto,
    missingPhone,
    missingCity,
    missingAuth,
    resolvedPhone,
    resolvedCity,
    hasPhoto,
  });

  return {
    ok,
    blockMessage,
    quickReplies: [...PRE_PUBLISH_BLOCKED_QUICK_REPLIES],
    missingPhoto,
    missingPhone,
    missingCity,
    missingPrice,
    missingAuth,
    resolvedPhone,
    resolvedCity,
    hasPhoto,
  };
}

export interface ServerPrePublishCardPayload {
  title: string;
  description: string;
  price: number;
  priceLabel?: string;
  location: string;
  phone?: string;
  imageUrl?: string | null;
  category?: string;
}

export interface ServerPrePublishRequirementsPayload {
  missingPhoto: boolean;
  missingPhone: boolean;
  missingCity: boolean;
  missingPrice: boolean;
  missingAuth: boolean;
  resolvedPhone?: string;
  resolvedCity?: string;
  hasPhoto?: boolean;
}

export function buildServerPrePublishCardPayload(input: {
  listingDraft?: {
    title?: string;
    description?: string;
    price?: number;
    location?: string;
    category?: string;
  };
  resolvedCity: string;
  resolvedPhone?: string;
  pendingImageUrls?: string[];
  imageUrl?: string;
}): ServerPrePublishCardPayload | null {
  const draft = input.listingDraft;
  if (!draft) return null;
  const title = draft.title?.trim() || "Naujas skelbimas";
  const price = draft.price ?? 0;
  if (price <= 0) return null;
  const imageUrl =
    input.imageUrl?.trim() ||
    input.pendingImageUrls?.[0]?.trim() ||
    null;
  return {
    title,
    description: draft.description?.trim() || "",
    price,
    location: input.resolvedCity.trim() || draft.location?.trim() || "",
    phone: input.resolvedPhone?.trim() || undefined,
    imageUrl,
    category: draft.category,
  };
}
