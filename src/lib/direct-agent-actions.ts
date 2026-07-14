import {
  executePhotoIntentListing,
  executePhotoIntentSearch,
  type PhotoIntentListingDeps,
  type PhotoIntentSearchDeps,
} from "@/lib/photo-intent-actions";
import {
  consumePendingPhotoIntent,
  clearPendingPhotoIntent,
} from "@/lib/photo-intent-session";
import {
  isPhotoIntentListingChip,
  isPhotoIntentSearchChip,
} from "@/lib/photo-intent-resolution";
import { isListingWorkflowCommand } from "@/lib/listing-workflow-intent";
import {
  isEditActionChip,
  isGapActionChip,
} from "@/lib/listing-wizard-flow";
import { Capacitor } from "@capacitor/core";
import {
  capturePhotoFromSource,
  pickCameraPhotoWeb,
  pickGalleryPhotoWeb,
} from "@/lib/native-media";

/** Chips and modal labels that must never become chat user messages. */
export function isDirectAgentActionChip(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (isPhotoIntentListingChip(t) || isPhotoIntentSearchChip(t)) return true;
  if (isListingWorkflowCommand(t)) return true;
  if (isGapActionChip(t) || isEditActionChip(t)) return true;
  if (/^➕?\s*įkelti skelbim/i.test(t)) return true;
  if (/^🔍?\s*ieškoti/i.test(t)) return true;
  if (/^įkelti nuotrauk/i.test(t)) return true;
  if (/^telefono numer/i.test(t)) return true;
  if (/^miestas$/i.test(t)) return true;
  if (/^suvesti tr[uū]kstamus/i.test(t)) return true;
  return false;
}

export interface DirectPhotoIntentChipDeps {
  search: PhotoIntentSearchDeps;
  listing: PhotoIntentListingDeps;
  wardrobeOnly?: boolean;
  onAssistantReply: (reply: string) => void;
  onError?: (message: string) => void;
}

/** Execute photo intent modal chips without injecting raw text into chat. */
export async function executeDirectPhotoIntentChip(
  chip: string,
  deps: DirectPhotoIntentChipDeps
): Promise<boolean> {
  if (!isPhotoIntentListingChip(chip) && !isPhotoIntentSearchChip(chip)) {
    return false;
  }

  const pending = consumePendingPhotoIntent();
  if (!pending) {
    deps.onError?.("Nuotraukos sesija nebegalioja — įkelkite nuotrauką iš naujo.");
    return true;
  }

  try {
    let reply: string;
    if (isPhotoIntentSearchChip(chip)) {
      reply = await executePhotoIntentSearch(pending, deps.search);
    } else {
      reply = await executePhotoIntentListing(pending, deps.listing);
    }
    clearPendingPhotoIntent();
    deps.onAssistantReply(reply);
    return true;
  } catch {
    deps.onError?.("Nepavyko apdoroti nuotraukos — bandykite dar kartą.");
    return true;
  }
}

/** Open camera or gallery and return data URL — no chat message. */
export async function pickListingPhotoDirect(
  source: "camera" | "gallery" = "gallery"
): Promise<string | null> {
  const photo =
    source === "camera"
      ? Capacitor.isNativePlatform()
        ? await capturePhotoFromSource("camera")
        : await pickCameraPhotoWeb()
      : Capacitor.isNativePlatform()
        ? await capturePhotoFromSource("gallery")
        : await pickGalleryPhotoWeb();
  return photo?.dataUrl?.trim() || null;
}
