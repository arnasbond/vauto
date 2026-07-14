import { isPlaceholderCity } from "@/lib/city-resolve";
import { hasListingPhoto, isValidListingPhone } from "@/lib/listing-form-validation";
import { resolvePublishListingCity } from "@/lib/listing-location-context";
import { buildConversationalMissingPrompt } from "@/lib/listing-conversational-flow";
import {
  injectProfileContactsForPublish,
  resolveDraftContact,
} from "@/lib/profile-listing-sync";
import type { UserCoords } from "@/lib/geolocation";
import type { AiExtractedListing, UserProfile } from "@/lib/types";

export interface PrePublishCardPayload {
  title: string;
  description: string;
  price: number;
  priceLabel?: string;
  location: string;
  phone?: string;
  imageUrl?: string | null;
  category?: string;
}

export function buildPrePublishCardPayload(
  readiness: PrePublishReadiness,
  previewImage?: string | null
): PrePublishCardPayload | null {
  if (!readiness.ok || !readiness.syncedDraft) return null;
  const draft = readiness.syncedDraft;
  return {
    title: sanitizeListingTitle(draft.title),
    description: sanitizeListingDescription(draft.description),
    price: draft.price ?? 0,
    priceLabel: draft.priceLabel,
    location: readiness.resolvedCity,
    phone: readiness.resolvedPhone,
    imageUrl:
      previewImage ??
      draft.orderedImageUrls?.[0] ??
      null,
    category: draft.category,
  };
}

import { draftTextImpliesMissingPhoto, sanitizeListingTitle, sanitizeListingDescription } from "@/lib/listing-text-sanitize";

export interface PrePublishCheckInput {
  isAuthenticated: boolean;
  user: Pick<UserProfile, "id" | "phone" | "email" | "city">;
  draft: AiExtractedListing | null;
  previewImage?: string | null;
  pendingImageUrls?: string[];
  orderedImageUrls?: string[];
  editingListingId?: string | null;
  geoCoords?: UserCoords | null;
}

export interface PrePublishReadiness {
  ok: boolean;
  missingPhoto: boolean;
  missingPhone: boolean;
  missingCity: boolean;
  missingPrice: boolean;
  missingAuth: boolean;
  blockMessage: string;
  quickReplies: string[];
  syncedDraft: AiExtractedListing | null;
  resolvedPhone: string;
  resolvedCity: string;
  hasPhoto: boolean;
}


export {
  isPublishConfirmationPhrase,
  isPublishWorkflowCommand,
  isListingWorkflowCommand,
} from "@/lib/listing-workflow-intent";

function resolveDraftPhone(
  draft: AiExtractedListing | null,
  user: Pick<UserProfile, "phone" | "email">
): string {
  const fromProfile = user.phone?.trim() ?? "";
  if (fromProfile && isValidListingPhone(fromProfile)) return fromProfile;
  const fromAttrs = String(draft?.attributes?.phone ?? "").trim();
  if (fromAttrs && isValidListingPhone(fromAttrs)) return fromAttrs;
  const contact = resolveDraftContact(draft ?? {}, user);
  if (contact && isValidListingPhone(contact)) return contact;
  return fromProfile || fromAttrs;
}

function draftHasPhoto(input: PrePublishCheckInput): boolean {
  if (input.editingListingId) return true;
  if (hasListingPhoto(input.previewImage)) return true;
  if ((input.pendingImageUrls?.length ?? 0) > 0) return true;
  if ((input.orderedImageUrls?.length ?? 0) > 0) return true;
  return false;
}

export function buildPrePublishBlockMessage(opts: {
  missingPhoto: boolean;
  missingPhone: boolean;
  missingCity: boolean;
  missingAuth: boolean;
  missingPrice?: boolean;
  resolvedPhone?: string;
  resolvedCity?: string;
  hasPhoto?: boolean;
}): string {
  return buildConversationalMissingPrompt({
    missingAuth: opts.missingAuth,
    missingPhoto: opts.missingPhoto,
    missingPhone: opts.missingPhone,
    missingCity: opts.missingCity,
    missingPrice: opts.missingPrice ?? false,
  });
}

export function evaluatePrePublishReadiness(
  input: PrePublishCheckInput
): PrePublishReadiness {
  const missingAuth = !input.isAuthenticated || !input.user.id?.trim();

  let syncedDraft = input.draft;
  if (input.draft && input.isAuthenticated && !missingAuth) {
    syncedDraft = injectProfileContactsForPublish(input.draft, input.user);
  }

  const hasPhoto = draftHasPhoto(input);
  const photoClaimedInText = draftTextImpliesMissingPhoto({
    title: syncedDraft?.title,
    description: syncedDraft?.description,
    hasPhoto,
  });
  const missingPhoto = !hasPhoto || photoClaimedInText;
  const resolvedPhone = resolveDraftPhone(syncedDraft, input.user);
  const resolvedCity = resolvePublishListingCity(
    syncedDraft?.location,
    input.user.city,
    input.geoCoords
  );

  const missingPhone = !isValidListingPhone(resolvedPhone);
  const missingCity =
    !resolvedCity.trim() || isPlaceholderCity(resolvedCity);
  const missingPrice = (syncedDraft?.price ?? 0) <= 0;

  const ok =
    !missingAuth && !missingPhoto && !missingPhone && !missingCity && !missingPrice;

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

  const quickReplies: string[] = [];

  if (missingAuth) {
    return {
      ok: false,
      missingPhoto,
      missingPhone,
      missingCity,
      missingPrice,
      missingAuth: true,
      blockMessage,
      quickReplies,
      syncedDraft,
      resolvedPhone,
      resolvedCity,
      hasPhoto,
    };
  }

  return {
    ok,
    missingPhoto,
    missingPhone,
    missingCity,
    missingPrice,
    missingAuth: false,
    blockMessage,
    quickReplies,
    syncedDraft,
    resolvedPhone,
    resolvedCity,
    hasPhoto,
  };
}

export function buildPrePublishMissingGuide(
  readiness: PrePublishReadiness
): string {
  const hints: string[] = [];
  if (readiness.missingPhoto) {
    hints.push("įkelkite bent vieną nuotrauką (fotoaparato piktograma arba nutempkite failą į pokalbį)");
  }
  if (readiness.missingPhone) {
    hints.push("parašykite telefono numerį, pvz. +370 612 34567");
  }
  if (readiness.missingCity) {
    hints.push("nurodykite miestą, pvz. Kaunas arba Vilnius");
  }
  if (readiness.missingPrice) {
    hints.push("nurodykite kainą eurais, pvz. 1200 €");
  }
  if (!hints.length) {
    return "Viskas paruošta — galite bandyti publikuoti dar kartą.";
  }
  return `Padėsiu užbaigti skelbimą — ${hints.join("; ")}.`;
}
