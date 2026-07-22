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
import { computeVatBreakdown } from "@vauto/shared/vat-pricing";
import { parseDocumentUrlsFromAttributes } from "@/lib/listing-gallery-roles";
import { filterSessionListingImages } from "@/lib/listing-image";

export interface PrePublishCardPayload {
  title: string;
  description: string;
  price: number;
  priceLabel?: string;
  location: string;
  phone?: string;
  imageUrl?: string | null;
  imageUrls?: string[];
  /** Document photos used for OCR/specs — shown as note, not in public gallery. */
  documentCount?: number;
  category?: string;
  /** Business VAT breakdown when seller has vatCode */
  vatLabelNet?: string;
  vatLabelGross?: string;
}

export function buildPrePublishCardPayload(
  readiness: PrePublishReadiness,
  previewImage?: string | null,
  opts?: { vatCode?: string | null; pendingImageUrls?: string[] }
): PrePublishCardPayload | null {
  if (!readiness.ok || !readiness.syncedDraft) return null;
  const draft = readiness.syncedDraft;
  const documentUrls = parseDocumentUrlsFromAttributes(draft.attributes);
  // Public gallery only — never re-merge raw pending uploads (docs leak before OCR attrs land).
  const gallerySource =
    (draft.orderedImageUrls?.length ?? 0) > 0
      ? [...(draft.orderedImageUrls ?? [])]
      : [
          ...(opts?.pendingImageUrls ?? []),
          ...(previewImage ? [previewImage] : []),
        ];
  if ((draft.orderedImageUrls?.length ?? 0) > 0 && previewImage) {
    // Cover hint only if already in public gallery set after filter.
    gallerySource.push(previewImage);
  }
  const imageUrls = filterSessionListingImages(gallerySource, {
    documentUrls,
    attributes: draft.attributes,
  }).slice(0, 6);
  const vatCode =
    opts?.vatCode ??
    String(draft.attributes?.vatCode ?? draft.attributes?.vat_code ?? "");
  const vat = computeVatBreakdown(draft.price ?? 0, vatCode);
  const vatLabelNet = vat.hasVat ? vat.labelNet : undefined;
  const vatLabelGross = vat.hasVat ? vat.labelGross : undefined;
  return {
    title: sanitizeListingTitle(draft.title),
    description: sanitizeListingDescription(draft.description),
    price: draft.price ?? 0,
    priceLabel: draft.priceLabel ?? vatLabelGross,
    location: readiness.resolvedCity,
    phone: readiness.resolvedPhone,
    imageUrl: imageUrls[0] ?? null,
    ...(imageUrls.length ? { imageUrls } : {}),
    ...(documentUrls.length ? { documentCount: documentUrls.length } : {}),
    category: draft.category,
    ...(vatLabelNet ? { vatLabelNet, vatLabelGross } : {}),
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

  // Persist public gallery only — never touch price/year/attrs here.
  // Docs stay filtered out; user trims public photos via PrePublish thumbnail „x“.
  if (syncedDraft) {
    const documentUrls = parseDocumentUrlsFromAttributes(syncedDraft.attributes);
    const gallerySource: string[] = [
      ...(syncedDraft.orderedImageUrls ?? []),
      ...(input.orderedImageUrls ?? []),
    ];
    // Only fall back to pending when there is no public gallery yet.
    if (!gallerySource.length) {
      gallerySource.push(
        ...(input.pendingImageUrls ?? []),
        ...(input.previewImage ? [input.previewImage] : [])
      );
    }
    const mergedPhotos = filterSessionListingImages(gallerySource, {
      documentUrls,
      attributes: syncedDraft.attributes,
    }).slice(0, 6);
    if (mergedPhotos.length) {
      syncedDraft = { ...syncedDraft, orderedImageUrls: mergedPhotos };
    } else if ((syncedDraft.orderedImageUrls?.length ?? 0) > 0) {
      syncedDraft = {
        ...syncedDraft,
        orderedImageUrls: filterSessionListingImages(syncedDraft.orderedImageUrls, {
          documentUrls,
          attributes: syncedDraft.attributes,
        }),
      };
    }
  }

  const resolvedPhone = resolveDraftPhone(syncedDraft, input.user);
  const resolvedCity = resolvePublishListingCity(
    syncedDraft?.location,
    input.user.city,
    input.geoCoords
  );

  const missingPhone = !isValidListingPhone(resolvedPhone);
  const missingCity =
    !resolvedCity.trim() || isPlaceholderCity(resolvedCity);
  const missingPrice =
    !Number.isFinite(Number(syncedDraft?.price)) ||
    Number(syncedDraft?.price) <= 0;

  // Photos are optional for PrePublish *preview* (text-first). Actual publish still
  // enforces a photo in SellerFlowContext.publishListing.
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
    hints.push("atnaujinkite telefono numerį profilyje");
  }
  if (readiness.missingCity) {
    hints.push("atnaujinkite miestą profilyje");
  }
  if (readiness.missingPrice) {
    hints.push("nurodykite kainą eurais, pvz. 1200 €");
  }
  if (!hints.length) {
    return "Viskas paruošta — galite bandyti publikuoti dar kartą.";
  }
  return `Padėsiu užbaigti skelbimą — ${hints.join("; ")}.`;
}
