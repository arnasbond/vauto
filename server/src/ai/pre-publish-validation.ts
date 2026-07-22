import { buildConversationalMissingPrompt } from "./listing-conversational-flow.js";
import {
  hardFilterPublicGalleryUrls,
  parseDocumentUrlsFromAttributes,
} from "./listing-gallery-roles.js";

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
  missingPrice?: boolean;
  resolvedPhone?: string;
  resolvedCity?: string;
  hasPhoto?: boolean;
}): string {
  return buildConversationalMissingPrompt({
    missingAuth: opts.missingAuth ?? false,
    missingPhoto: opts.missingPhoto,
    missingPhone: opts.missingPhone,
    missingCity: opts.missingCity,
    missingPrice: opts.missingPrice ?? false,
  });
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
  /** GPS-derived city hint from client (no coords payload). */
  geoCityHint?: string;
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
    normalizeKnownCity(input.userCity) ||
    normalizeKnownCity(input.geoCityHint);

  const hasPhoto = draftHasListingPhoto(input);
  const missingPhoto = !hasPhoto;
  const missingPhone = !isValidListingPhone(resolvedPhone);
  const missingCity = !resolvedCity || isPlaceholderCity(resolvedCity);
  const missingPrice = (input.listingDraft?.price ?? 0) <= 0;

  // Photos optional for PrePublish preview (text-first); publish still enforces photo client-side.
  const ok =
    !missingAuth && !missingPhone && !missingCity && !missingPrice;

  const blockMessage = buildPrePublishBlockMessage({
    missingPhoto,
    missingPhone,
    missingCity,
    missingAuth,
    missingPrice,
    resolvedPhone,
    resolvedCity,
    hasPhoto,
  });

  return {
    ok,
    blockMessage,
    quickReplies: [],
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
  imageUrls?: string[];
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
    attributes?: Record<string, string>;
    orderedImageUrls?: string[];
  };
  resolvedCity: string;
  resolvedPhone?: string;
  pendingImageUrls?: string[];
  imageUrl?: string;
  imageUrls?: string[];
}): ServerPrePublishCardPayload | null {
  const draft = input.listingDraft;
  if (!draft) return null;
  const title = draft.title?.trim() || "Naujas skelbimas";
  const price = draft.price ?? 0;
  if (price <= 0) return null;
  const documentUrls = parseDocumentUrlsFromAttributes(draft.attributes);
  const imageUrls = hardFilterPublicGalleryUrls(
    [
      ...(draft.orderedImageUrls ?? []),
      ...(input.imageUrls ?? []),
      ...(input.pendingImageUrls ?? []),
      ...(input.imageUrl ? [input.imageUrl] : []),
    ],
    documentUrls,
    draft.attributes
  ).slice(0, 6);
  const imageUrl = imageUrls[0] ?? null;
  return {
    title,
    description: draft.description?.trim() || "",
    price,
    location: input.resolvedCity.trim() || draft.location?.trim() || "",
    phone: input.resolvedPhone?.trim() || undefined,
    imageUrl,
    ...(imageUrls.length ? { imageUrls } : {}),
    category: draft.category,
  };
}
