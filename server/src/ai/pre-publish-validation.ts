import { buildConversationalMissingPrompt } from "./listing-conversational-flow.js";
import {
  hardFilterPublicGalleryUrls,
  parseDocumentUrlsFromAttributes,
} from "./listing-gallery-roles.js";
import {
  draftHasSatisfiedPrice,
  NEGOTIABLE_PRICE_LABEL,
} from "../shared/negotiable-price.js";
import {
  coerceListingCategoryForDb,
  CONDITION_REQUIRED_CATEGORIES,
} from "../shared/category-registry.js";
import { readActiveFactConflict } from "../shared/fact-conflict.js";
import { isGenericListingDraftTitle } from "../shared/listing-organism.js";

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
  missingTitle?: boolean;
  missingCategory?: boolean;
  missingCondition?: boolean;
  activeConflict?: ReturnType<typeof readActiveFactConflict>;
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
    missingTitle: opts.missingTitle ?? false,
    missingCategory: opts.missingCategory ?? false,
    missingCondition: opts.missingCondition ?? false,
    activeConflict: opts.activeConflict ?? null,
  });
}

export function evaluateServerPrePublishReadiness(input: {
  isAuthenticated?: boolean;
  profilePhone?: string;
  profileEmail?: string;
  userCity?: string;
  contact?: string;
  listingDraft?: {
    title?: string;
    description?: string;
    location?: string;
    price?: number;
    priceLabel?: string;
    category?: string;
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
  missingTitle: boolean;
  missingCategory: boolean;
  missingCondition: boolean;
  activeConflict: ReturnType<typeof readActiveFactConflict>;
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
  const missingPrice = !draftHasSatisfiedPrice({
    price: input.listingDraft?.price,
    priceLabel: input.listingDraft?.priceLabel,
    attributes: input.listingDraft?.attributes,
  });

  // P0 — ONE readiness authority: the SAME canonical F9 gates the client
  // PrePublish readiness enforces (generic title, missing category, missing
  // condition for physical goods, open fact conflicts) also block the server
  // readiness — no parallel heuristic may claim „ready“.
  const draftTitle = String(input.listingDraft?.title ?? "").trim();
  const missingTitle =
    !input.listingDraft || isGenericListingDraftTitle(draftTitle);
  const missingCategory = !String(input.listingDraft?.category ?? "").trim();
  const conditionRequired =
    Boolean(input.listingDraft?.category) &&
    CONDITION_REQUIRED_CATEGORIES.has(
      coerceListingCategoryForDb(input.listingDraft?.category ?? "", {
        title: draftTitle,
        description: String(input.listingDraft?.description ?? ""),
        fallback: "other",
      })
    );
  const conditionValue = String(
    input.listingDraft?.attributes?.condition ?? ""
  ).trim();
  const missingCondition = conditionRequired && !conditionValue;
  const activeConflict = input.listingDraft
    ? readActiveFactConflict({
        ...(input.listingDraft.attributes ?? {}),
        price: input.listingDraft.price,
        city: input.listingDraft.location,
        condition: input.listingDraft.attributes?.condition,
      })
    : null;

  // Photos optional for PrePublish preview (text-first); publish still enforces photo client-side.
  const ok =
    !activeConflict &&
    !missingAuth &&
    !missingPhone &&
    !missingCity &&
    !missingPrice &&
    !missingTitle &&
    !missingCategory &&
    !missingCondition;

  const blockMessage = buildPrePublishBlockMessage({
    missingPhoto,
    missingPhone,
    missingCity,
    missingAuth,
    missingPrice,
    missingTitle,
    missingCategory,
    missingCondition,
    activeConflict,
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
    missingTitle,
    missingCategory,
    missingCondition,
    activeConflict,
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
    priceLabel?: string;
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
  const priceOk = draftHasSatisfiedPrice({
    price,
    priceLabel: draft.priceLabel,
    attributes: draft.attributes,
  });
  if (!priceOk) return null;
  const documentUrls = parseDocumentUrlsFromAttributes(draft.attributes);
  // Prefer public ordered gallery; only fall back to pending when gallery is empty.
  const gallerySource =
    (draft.orderedImageUrls?.length ?? 0) > 0
      ? [...(draft.orderedImageUrls ?? []), ...(input.imageUrls ?? [])]
      : [
          ...(draft.orderedImageUrls ?? []),
          ...(input.imageUrls ?? []),
          ...(input.pendingImageUrls ?? []),
          ...(input.imageUrl ? [input.imageUrl] : []),
        ];
  const imageUrls = hardFilterPublicGalleryUrls(
    gallerySource,
    documentUrls,
    draft.attributes
  ).slice(0, 6);
  const imageUrl = imageUrls[0] ?? null;
  const priceLabel =
    draft.priceLabel?.trim() ||
    (price <= 0 ? NEGOTIABLE_PRICE_LABEL : undefined);
  return {
    title,
    description: draft.description?.trim() || "",
    price,
    ...(priceLabel ? { priceLabel } : {}),
    location: input.resolvedCity.trim() || draft.location?.trim() || "",
    phone: input.resolvedPhone?.trim() || undefined,
    imageUrl,
    ...(imageUrls.length ? { imageUrls } : {}),
    category: coerceListingCategoryForDb(draft.category, {
      title: draft.title,
      description: draft.description,
    }),
  };
}
