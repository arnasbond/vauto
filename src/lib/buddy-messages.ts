import type { AiExtractedListing, Listing } from "@/lib/types";
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
  | "promote_free";

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

export function buildSellerBuddyMessage(params: {
  draft: AiExtractedListing;
  missingKeys: string[];
  hasPhoto: boolean;
  userPrompt?: string | null;
}): string {
  const { draft, missingKeys, hasPhoto, userPrompt } = params;
  const key = listingToAdaptiveKey(draft.category);
  const city = draft.location?.split(",")[0]?.trim() || "Panevėžyje";
  const title = draft.title || "skelbimą";

  if (!hasPhoto && key === "vehicles") {
    return `Sveiki! Labai gražus automobilis, kaina tikrai teisinga. Jau fone viską paruošiau ir patikrinau VIN. Kad galėtume publikuoti, man trūksta tik nuotraukos. Padarykime ją kartu?`;
  }

  if (!hasPhoto) {
    return `Labas! Viską supratau — „${title}" skamba puikiai. Jau paruošiau skelbimą ${city}, bet be nuotraukos žmonės mažiau spustelės. Pridėkime vieną kartu?`;
  }

  if (missingKeys.includes("price") || draft.price <= 0) {
    return `Puiku, nuotrauka jau yra! Dabar reikia tik kainos — parašykite arba pasakykite, kiek norite gauti, ir iškart publikuosime.`;
  }

  if (missingKeys.length > 0) {
    const hints =
      key === "services"
        ? "patirtį ir paslaugų sąrašą"
        : key === "vehicles"
          ? "ridą arba techninę informaciją"
          : "kelias smulkmenas";
    return `Beveik viskas! Skelbimas „${title}" jau beveik paruoštas. Trūksta tik ${hints} — padėsiu užpildyti žemiau.`;
  }

  if (userPrompt?.trim()) {
    return `Ačiū, kad pasakėte! Viską užrašiau ir patikrinau. Skelbimas „${title}" ${city} atrodo puikiai — galime publikuoti, kai būsite pasiruošę.`;
  }

  return `Viskas paruošta! Skelbimas „${title}" ${city} atrodo puikiai — jei viskas tinka, spauskite publikuoti. Aš būsiu šalia, jei prireiks pagalbos.`;
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
      label: "Nufotografuoti dabar",
      emoji: "📸",
      variant: "primary",
    });
  }

  if (needsPrice || missingKeys.includes("price")) {
    actions.push({
      id: "change_price",
      label: "Įvesti kainą",
      emoji: "💰",
      variant: "primary",
    });
  }

  if (canPublish) {
    actions.push({
      id: "publish",
      label: "Taip, publikuojam!",
      emoji: "✅",
      variant: "primary",
    });
  }

  if (missingKeys.length > 0 && !needsPrice) {
    actions.push({
      id: "edit_details",
      label: "Papildyti detales",
      emoji: "✏️",
      variant: "secondary",
    });
  }

  if (!canPublish && hasPhoto && !needsPrice) {
    actions.push({
      id: "change_price",
      label: "Pakeisti kainą",
      emoji: "❌",
      variant: "danger",
    });
  }

  return actions.slice(0, 3);
}

export function buildSearchBuddyMessage(
  query: string,
  listings: Listing[],
  city = "Panevėžyje"
): { message: string; listing: Listing | null } {
  const services = listings.filter((l) => l.category === "services" && l.status !== "sold");
  const top = services[0] ?? listings[0] ?? null;

  if (!top) {
    return {
      message: `Nesijaudinkite, jau ieškau „${query}" ${city}. Kol kas nieko tikslaus neradau — pabandykite kitą žodį arba pažiūrėkite populiarius skelbimus žemiau.`,
      listing: null,
    };
  }

  const providerName = extractProviderName(top.title);
  const dist =
    top.distanceKm < 2
      ? "labai arti"
      : top.distanceKm < 5
        ? "netoli jūsų"
        : `${top.distanceKm.toFixed(1)} km atstumu`;

  return {
    message: `Nesijaudinkite, aš jau ieškau patikimo meistro šalia jūsų ${city}. Radau ${providerName}, jis laisvas ir yra ${dist}. Norite, kad padėčiau susisiekti?`,
    listing: top,
  };
}

export function buildSearchQuickActions(
  listing: Listing | null
): BuddyQuickAction[] {
  if (!listing) {
    return [
      { id: "see_listings", label: "Rodyti visus skelbimus", emoji: "🔍", variant: "primary" },
    ];
  }
  return [
    {
      id: "call_provider",
      label: "Taip, skambinam meistrui",
      emoji: "📞",
      variant: "primary",
    },
    {
      id: "chat_provider",
      label: "Parašyti žinutę",
      emoji: "💬",
      variant: "secondary",
    },
    {
      id: "see_listings",
      label: "Žiūrėti kitus",
      emoji: "👀",
      variant: "secondary",
    },
  ];
}

export function buildBuddyViewNotification(
  location: string,
  viewerCount = 5
): string {
  const city = location.split(",")[0]?.trim() || "Panevėžyje";
  return `Labas! Tavo skelbimą ${city} ką tik peržiūrėjo dar ${viewerCount} žmonės. Atrodo, reikalai juda į priekį!`;
}

export function buildBuddySoldFollowUp(
  userName: string,
  listingTitle: string
): string {
  const name = getFirstName(userName);
  const shortTitle = listingTitle.length > 40 ? `${listingTitle.slice(0, 37)}…` : listingTitle;
  return `Sveikas, ${name}, užsukau paklausti — ar pavyko parduoti „${shortTitle}"? Jei dar ne, galiu nemokamai iškelti jį viršun, kad pamatytų kaimynai.`;
}

function extractProviderName(title: string): string {
  const beforeDash = title.split("—")[0]?.split("-")[0]?.trim();
  if (beforeDash && beforeDash.length <= 20 && !/meistr|paslaug|remont/i.test(beforeDash)) {
    return beforeDash;
  }
  return "Joną";
}
