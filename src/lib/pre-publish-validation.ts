import { isPlaceholderCity } from "@/lib/city-resolve";
import { hasListingPhoto, isValidListingPhone } from "@/lib/listing-form-validation";
import { resolvePublishListingCity } from "@/lib/listing-location-context";
import {
  injectProfileContactsForPublish,
  PUBLISH_REQUIRES_AUTH_MESSAGE,
  resolveDraftContact,
} from "@/lib/profile-listing-sync";
import type { AiExtractedListing, UserProfile } from "@/lib/types";

export const PRE_PUBLISH_READY_INTRO =
  "✨ Skelbimas paruoštas publikuoti! Peržiūrėkite, kaip jis atrodys turguje:";

export interface PrePublishCardPayload {
  title: string;
  description: string;
  price: number;
  priceLabel?: string;
  location: string;
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
    title: draft.title?.trim() || "Naujas skelbimas",
    description: draft.description?.trim() || "",
    price: draft.price ?? 0,
    priceLabel: draft.priceLabel,
    location: readiness.resolvedCity,
    imageUrl:
      previewImage ??
      draft.orderedImageUrls?.[0] ??
      null,
    category: draft.category,
  };
}

export const PRE_PUBLISH_BLOCKED_QUICK_REPLIES = [
  "Suvesti trūkstamus duomenis",
  "Įkelti nuotraukas",
  "Reikia pataisyti",
] as const;

export interface PrePublishCheckInput {
  isAuthenticated: boolean;
  user: Pick<UserProfile, "id" | "phone" | "email" | "city">;
  draft: AiExtractedListing | null;
  previewImage?: string | null;
  pendingImageUrls?: string[];
  orderedImageUrls?: string[];
  editingListingId?: string | null;
}

export interface PrePublishReadiness {
  ok: boolean;
  missingPhoto: boolean;
  missingPhone: boolean;
  missingCity: boolean;
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

export function evaluatePrePublishReadiness(
  input: PrePublishCheckInput
): PrePublishReadiness {
  const quickReplies = [...PRE_PUBLISH_BLOCKED_QUICK_REPLIES];
  const missingAuth = !input.isAuthenticated || !input.user.id?.trim();

  let syncedDraft = input.draft;
  if (input.draft && input.isAuthenticated && !missingAuth) {
    syncedDraft = injectProfileContactsForPublish(input.draft, input.user);
  }

  const hasPhoto = draftHasPhoto(input);
  const resolvedPhone = resolveDraftPhone(syncedDraft, input.user);
  const resolvedCity = resolvePublishListingCity(
    syncedDraft?.location,
    input.user.city
  );

  const missingPhoto = !hasPhoto;
  const missingPhone = !isValidListingPhone(resolvedPhone);
  const missingCity =
    !resolvedCity.trim() || isPlaceholderCity(resolvedCity);

  const ok = !missingAuth && hasPhoto && !missingPhone && !missingCity;

  const blockMessage = buildPrePublishBlockMessage({
    missingPhoto,
    missingPhone,
    missingCity,
    missingAuth,
    resolvedPhone,
    resolvedCity,
    hasPhoto,
  });

  if (missingAuth) {
    return {
      ok: false,
      missingPhoto,
      missingPhone,
      missingCity,
      missingAuth: true,
      blockMessage: `${PUBLISH_REQUIRES_AUTH_MESSAGE}\n\n${blockMessage}`,
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
  if (!hints.length) {
    return "Viskas paruošta — galite bandyti publikuoti dar kartą.";
  }
  return `Padėsiu užbaigti skelbimą — ${hints.join("; ")}.`;
}
