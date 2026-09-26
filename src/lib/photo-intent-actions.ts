import type { MarketplaceFilterState } from "@/lib/marketplace-view";
import type { Listing, ListingCategory } from "@/lib/types";
import type { VautoAgentAction } from "@/lib/vauto-agent-client";
import {
  applyVisualPhotoSearchToGrid,
  type PhotoVisionSearchResult,
} from "@/lib/photo-vision-search";
import { buildVisualSearchProfile } from "@/lib/visual-search";
import { buildVisionSearchAgentAction } from "@/lib/vision-agent-bridge";
import { formatSearchAlternativeChips } from "@/lib/vision-choice-chips";
import type { PendingPhotoIntent } from "@/lib/photo-intent-resolution";

export interface PhotoIntentSearchDeps {
  listings: Listing[];
  marketplaceFilters: MarketplaceFilterState;
  userName: string;
  userCity: string;
  userPhone: string;
  wardrobeOnly?: boolean;
  applyVisualSearch: (
    profile: ReturnType<typeof buildVisualSearchProfile>
  ) => Promise<void>;
  syncAgentAction: (action: VautoAgentAction) => void;
  setSearchInputMode: (mode: "text" | "photo" | "voice") => void;
  setSearchQuery: (q: string) => void;
  setDraftQuery?: (q: string) => void;
  scrollToResults?: () => void;
  notifyPhotoSearch?: (label: string, count: number) => void;
  sendAgentMessage?: (
    text: string,
    opts?: { pendingImageUrls?: string[] }
  ) => Promise<unknown>;
  openWithGreeting?: (
    text: string,
    opts?: { quickReplies?: string[] }
  ) => void;
  showToast: (msg: string, kind?: "success" | "info" | "error") => void;
}

function visionFromPending(pending: PendingPhotoIntent): PhotoVisionSearchResult {
  const intent = pending.analysis.visionIntent!;
  return {
    intent,
    keywords: intent.cleanQuery,
    confidence: pending.analysis.confidence,
    category: pending.analysis.category as ListingCategory,
    title: pending.analysis.objectLabel,
  };
}

/** Execute search path after user picks „Ieškoti šio daikto“. */
export async function executePhotoIntentSearch(
  pending: PendingPhotoIntent,
  deps: PhotoIntentSearchDeps
): Promise<string> {
  if (!pending.analysis.visionIntent) {
    deps.showToast("Nepavyko pritaikyti paieškos filtrų.", "info");
    return "Bandykite dar kartą arba įveskite paiešką tekstu.";
  }

  const vision = visionFromPending(pending);
  const photos = pending.analysis.orderedImageUrls.length
    ? pending.analysis.orderedImageUrls
    : pending.photos;

  if (pending.wardrobeOnly) {
    deps.setSearchInputMode("photo");
    await deps.sendAgentMessage?.(
      "Nufotografavau drabužius — paruošk atskirus skelbimus.",
      { pendingImageUrls: photos }
    );
    return "Analizuoju drabužius — paruošiu skelbimus.";
  }

  if (pending.extraContext?.trim()) {
    deps.setSearchInputMode("photo");
    if (deps.setDraftQuery) deps.setDraftQuery(pending.extraContext.trim());
    await deps.sendAgentMessage?.(pending.extraContext.trim(), {
      pendingImageUrls: photos,
    });
    return `Ieškau pagal jūsų pastabą: ${pending.extraContext.trim()}`;
  }

  const itemLabel = vision.title || pending.analysis.objectLabel || "daiktą";
  deps.setSearchInputMode("photo");
  if (deps.setDraftQuery) deps.setDraftQuery(itemLabel);
  await deps.sendAgentMessage?.(`Surask ${itemLabel}`, {
    pendingImageUrls: photos,
  });
  return `Ieškau ${itemLabel}…`;
}

export interface PhotoIntentListingDeps {
  submitSellerContent: (payload: {
    imageDataUrl?: string | null;
    imageDataUrls?: string[];
    extraContext?: string;
    text?: string;
  }) => Promise<void>;
  showToast?: (msg: string, kind?: "success" | "info" | "error") => void;
}

/** Execute listing path after user picks „Įkelti skelbimą“. */
export async function executePhotoIntentListing(
  pending: PendingPhotoIntent,
  deps: PhotoIntentListingDeps
): Promise<string> {
  const photos = pending.analysis.orderedImageUrls.length
    ? pending.analysis.orderedImageUrls
    : pending.photos;

  await deps.submitSellerContent({
    imageDataUrls: photos,
    imageDataUrl: photos[0],
    extraContext: pending.extraContext,
  });

  deps.showToast?.("Analizuoju nuotrauką ir paruošiu skelbimą…", "info");
  return "Puiku — analizuoju nuotrauką ir paruošiu skelbimo juodraštį. Patikrinkite laukus ir tęskime pokalbį.";
}
