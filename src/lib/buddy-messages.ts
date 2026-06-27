import type { AiExtractedListing, Listing, ScoredListing } from "@/lib/types";
import { WANTED_EMPTY_MESSAGE } from "@/lib/matching-service";
import { sanitizeSearchQuery } from "@/lib/portal-listing-filter";
import { getSearchMatchStatus } from "@/lib/search-match";
import { isConversationalSearchIntent } from "@/lib/search-conversational-intent";
import { listingToAdaptiveKey } from "@/lib/adaptive-categories";
import { getFirstName } from "@/lib/buddy-voice";

export type BuddyActionId =
  | "photo"
  | "publish"
  | "change_price"
  | "edit_details"
  | "call_provider"
  | "chat_provider"
  | "see_listings"
  | "promote_free"
  | "wishlist"
  | "refine_search";

export interface BuddyQuickAction {
  id: BuddyActionId;
  label: string;
  emoji: string;
  variant: "primary" | "secondary" | "danger";
}

const SERVICE_QUERY_RE =
  /meistr|remont|paslaug|elektrik|santechn|valym|kirp|statyb|transport/i;

export function isServiceSearchQuery(query: string): boolean {
  return SERVICE_QUERY_RE.test(query);
}

/** Buddy activates for product search — not for greetings / small talk. */
export function isBuddySearchQuery(query: string): boolean {
  const q = query.trim();
  if (q.length < 3) return false;
  return !isConversationalSearchIntent(q);
}

export function buildManualFallbackMessage(): string {
  return "Automatinis atpažinimas nepavyko. Užpildykite privalomus laukus žemiau ir patvirtinkite publikavimą.";
}

export function buildSellerBuddyMessage(params: {
  draft: AiExtractedListing;
  missingKeys: string[];
  hasPhoto: boolean;
  userPrompt?: string | null;
  manualFallback?: boolean;
}): string {
  const { draft, missingKeys, hasPhoto, userPrompt, manualFallback } = params;

  if (manualFallback) {
    return buildManualFallbackMessage();
  }

  const key = listingToAdaptiveKey(draft.category);
  const city = draft.location?.split(",")[0]?.trim() || "Lietuvoje";
  const title = draft.title || "skelbimas";

  if (!hasPhoto && key === "vehicles") {
    return `Automobilio skelbimas paruoštas. Publikuoti galima po nuotraukos įkėlimo ir VIN patikros.`;
  }

  if (!hasPhoto) {
    return `Skelbimas „${title}" (${city}) paruoštas. Publikuoti rekomenduojama su nuotrauka.`;
  }

  if (missingKeys.includes("price") || draft.price <= 0) {
    return `Nuotrauka įkelta. Nurodykite kainą — po to galėsite publikuoti.`;
  }

  if (missingKeys.length > 0) {
    const hints =
      key === "services"
        ? "patirtį ir paslaugų sąrašą"
        : key === "vehicles"
          ? "ridą arba techninę informaciją"
          : "papildomus laukus";
    return `Skelbimas „${title}" beveik paruoštas. Užpildykite: ${hints}.`;
  }

  if (userPrompt?.trim()) {
    return `Duomenys patikrinti. Skelbimas „${title}" (${city}) paruoštas publikavimui.`;
  }

  return `Skelbimas „${title}" (${city}) paruoštas. Patikrinkite laukus ir patvirtinkite publikavimą.`;
}

export function buildSellerQuickActions(params: {
  missingKeys: string[];
  hasPhoto: boolean;
  canPublish: boolean;
  needsPrice: boolean;
}): BuddyQuickAction[] {
  const { missingKeys, hasPhoto, canPublish, needsPrice } = params;
  const actions: BuddyQuickAction[] = [];

  if (!hasPhoto) {
    actions.push({
      id: "photo",
      label: "Pridėti nuotrauką",
      emoji: "",
      variant: "primary",
    });
  }

  if (needsPrice || missingKeys.includes("price")) {
    actions.push({
      id: "change_price",
      label: "Įvesti kainą",
      emoji: "",
      variant: "primary",
    });
  }

  if (canPublish) {
    actions.push({
      id: "publish",
      label: "Publikuoti",
      emoji: "",
      variant: "primary",
    });
  }

  if (missingKeys.length > 0 && !needsPrice) {
    actions.push({
      id: "edit_details",
      label: "Redaguoti laukus",
      emoji: "",
      variant: "secondary",
    });
  }

  if (!canPublish && hasPhoto && !needsPrice) {
    actions.push({
      id: "change_price",
      label: "Keisti kainą",
      emoji: "",
      variant: "danger",
    });
  }

  return actions.slice(0, 3);
}

export type SearchInputMode = "text" | "voice" | "photo" | null;

export function buildSearchBuddyMessage(
  query: string,
  listings: ScoredListing[],
  city = "Lietuvoje",
  opts?: { inputMode?: SearchInputMode; subscribed?: boolean }
): { message: string; listing: Listing | null } {
  const q = sanitizeSearchQuery(query, "final");
  const matchStatus = getSearchMatchStatus(listings);
  const top = listings[0] ?? null;

  if (matchStatus === "none") {
    return {
      message: WANTED_EMPTY_MESSAGE,
      listing: null,
    };
  }

  if (matchStatus === "weak") {
    const wishlist = opts?.subscribed
      ? "Toliau stebime pageidavimų sąraše tikslesniam atitikmeniui."
      : "Įtraukite į pageidavimų sąrašą — pranešime, kai atsiras tikslesnis skelbimas.";
    return {
      message: `Radome panašius skelbimus, bet ne tiksliai „${q}". ${wishlist} Žemiau — artimiausi variantai.`,
      listing: top,
    };
  }

  if (!top) {
    return {
      message: `Pagal užklausą „${q}" (${city}) rezultatų nerasta.`,
      listing: null,
    };
  }

  if (top.category === "services") {
    const providerName = extractProviderName(top.title);
    const dist =
      top.distanceKm < 2
        ? "arti jūsų"
        : top.distanceKm < 5
          ? "netoli"
          : `${top.distanceKm.toFixed(1)} km`;

    return {
      message: `Rastas teikėjas ${providerName} (${dist}). Galite susisiekti tiesiogiai.`,
      listing: top,
    };
  }

  return {
    message: `Geriausias atitikmuo: „${top.title}" — ${top.price}€ (${city}). Peržiūrėkite detales.`,
    listing: top,
  };
}

export function buildSearchQuickActions(
  listing: Listing | null,
  opts?: { matchWeakOrNone?: boolean; subscribed?: boolean }
): BuddyQuickAction[] {
  if (!listing && opts?.matchWeakOrNone) {
    const actions: BuddyQuickAction[] = [];
    if (!opts.subscribed) {
      actions.push({
        id: "wishlist",
        label: "Įtraukti į pageidavimų sąrašą",
        emoji: "🔔",
        variant: "primary",
      });
    }
    actions.push({
      id: "refine_search",
      label: "Patikslinti paiešką",
      emoji: "",
      variant: "secondary",
    });
    actions.push({
      id: "see_listings",
      label: "Žiūrėti panašius",
      emoji: "",
      variant: "secondary",
    });
    return actions;
  }

  if (!listing) {
    return [
      { id: "see_listings", label: "Rodyti skelbimus", emoji: "", variant: "primary" },
    ];
  }
  return [
    {
      id: "call_provider",
      label: "Skambinti",
      emoji: "",
      variant: "primary",
    },
    {
      id: "chat_provider",
      label: "Rašyti žinutę",
      emoji: "",
      variant: "secondary",
    },
    {
      id: "see_listings",
      label: "Kiti skelbimai",
      emoji: "",
      variant: "secondary",
    },
  ];
}

export function buildBuddyViewNotification(
  location: string,
  viewerCount = 5
): string {
  const city = location.split(",")[0]?.trim() || "Lietuvoje";
  return `Jūsų skelbimą ${city} peržiūrėjo ${viewerCount} naudotojai.`;
}

export function buildBuddySoldFollowUp(
  userName: string,
  listingTitle: string
): string {
  const name = getFirstName(userName);
  const shortTitle = listingTitle.length > 40 ? `${listingTitle.slice(0, 37)}…` : listingTitle;
  return `${name}, ar pavyko parduoti „${shortTitle}"? Jei ne, galite nemokamai iškelti skelbimą.`;
}

function extractProviderName(title: string): string {
  const beforeDash = title.split("—")[0]?.split("-")[0]?.trim();
  if (beforeDash && beforeDash.length <= 20 && !/meistr|paslaug|remont/i.test(beforeDash)) {
    return beforeDash;
  }
  return "teikėjas";
}
