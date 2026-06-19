import type { Listing } from "@/lib/types";
import { logWakeEvent } from "@/lib/wake-word-engine";

export type VoiceIntentType = "check_new_ads" | "service_request" | "unknown";

export interface VoiceIntent {
  type: VoiceIntentType;
  topic: string;
  city: string;
  raw: string;
}

export interface VoiceIntentResult {
  intent: VoiceIntent;
  response: string;
  topListing: Listing | null;
  matchCount: number;
}

const NEW_ADS_RE =
  /(?:ar\s+)?(?:atsirado|yra|radai|rasti)\s+(?:nauj[ųu]\s+)?(?:skelbim[ųu]|įraš[ųu]|pasiūlym[ųu])?(?:\s+(.+))?/i;
const SERVICE_RE =
  /(?:surask|rask|ieškok|reikia)\s+(?:man\s+)?(?:laisv[ąa]\s+)?(.+?)(?:\s+panev[eė]žyje|\s+šalia|$)/i;
const SERVICE_ALT_RE = /(?:meistr[ąa]|paslaug[ąa]|specialist[ąa])\s+(.+)?/i;

function normalizeCity(city: string): string {
  return city.split(",")[0]?.trim() || "Panevėžys";
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s,.;:!?—–-]+/)
    .filter((t) => t.length >= 3);
}

function listingMatchesTopic(listing: Listing, topic: string): boolean {
  const tokens = tokenize(topic);
  if (!tokens.length) return true;
  const haystack = [
    listing.title,
    listing.category,
    listing.location,
    ...listing.tags,
    listing.description ?? "",
  ]
    .join(" ")
    .toLowerCase();
  return tokens.some((t) => haystack.includes(t));
}

function listingInCity(listing: Listing, city: string): boolean {
  const c = city.toLowerCase();
  return listing.location.toLowerCase().includes(c) || c.includes("panev");
}

function scoreListing(listing: Listing): number {
  return (
    (listing.views ?? 0) +
    (listing.callClicks ?? 0) * 3 +
    (listing.saveCount ?? 0) * 2 +
    (listing.providerVerified ? 10 : 0) +
    (listing.promoted ? 5 : 0)
  );
}

export function parseVoiceIntent(
  transcript: string,
  defaultCity = "Panevėžys"
): VoiceIntent {
  const raw = transcript.trim();
  const city = /panev[eė]žyje/i.test(raw) ? "Panevėžys" : defaultCity;

  const newAds = raw.match(NEW_ADS_RE);
  if (newAds) {
    const topic = (newAds[1] ?? "").replace(/panev[eė]žyje/gi, "").trim() || "bendri";
    return { type: "check_new_ads", topic, city, raw };
  }

  const service = raw.match(SERVICE_RE) ?? raw.match(SERVICE_ALT_RE);
  if (service || /meistr|paslaug|remont|elektrik|santechn/i.test(raw)) {
    const topic =
      (service?.[1] ?? raw)
        .replace(/panev[eė]žyje/gi, "")
        .replace(/laisv[ąa]/gi, "")
        .trim() || "meistras";
    return { type: "service_request", topic, city, raw };
  }

  return { type: "unknown", topic: "", city, raw };
}

export function findNewListings(
  listings: Listing[],
  topic: string,
  city: string,
  hours = 24
): Listing[] {
  const cutoff = Date.now() - hours * 60 * 60 * 1000;
  return listings
    .filter(
      (l) =>
        l.status !== "sold" &&
        !l.banned &&
        new Date(l.createdAt).getTime() >= cutoff &&
        listingInCity(l, city) &&
        listingMatchesTopic(l, topic)
    )
    .sort((a, b) => scoreListing(b) - scoreListing(a));
}

export function findVerifiedServices(
  listings: Listing[],
  topic: string,
  city: string
): Listing[] {
  return listings
    .filter(
      (l) =>
        l.category === "services" &&
        l.status !== "sold" &&
        !l.banned &&
        listingInCity(l, city) &&
        listingMatchesTopic(l, topic)
    )
    .sort((a, b) => scoreListing(b) - scoreListing(a));
}

export function executeVoiceIntent(
  intent: VoiceIntent,
  listings: Listing[]
): VoiceIntentResult {
  logWakeEvent("intent_execute", { type: intent.type, topic: intent.topic });

  if (intent.type === "check_new_ads") {
    const matches = findNewListings(listings, intent.topic, intent.city);
    const top = matches[0] ?? null;
    const cityLabel = normalizeCity(intent.city);

    if (!matches.length) {
      return {
        intent,
        matchCount: 0,
        topListing: null,
        response: `Deja, per paskutines 24 valandas naujų skelbimų tema „${intent.topic}" ${cityLabel} neradau. Galiu pranešti, kai atsiras.`,
      };
    }

    const best = top ? ` Štai geriausias variantas: ${top.title}, ${top.price} eurų.` : "";
    return {
      intent,
      matchCount: matches.length,
      topListing: top,
      response: `Taip, radau ${matches.length} naujus skelbimus ${cityLabel} ta tema.${best}`,
    };
  }

  if (intent.type === "service_request") {
    const services = findVerifiedServices(listings, intent.topic, intent.city);
    const top = services[0] ?? null;
    const cityLabel = normalizeCity(intent.city);

    if (!top) {
      return {
        intent,
        matchCount: 0,
        topListing: null,
        response: `Kol kas neradau laisvo meistro tema „${intent.topic}" ${cityLabel}. Pabandykite paieškoje arba palaukite — pranešiu, kai atsiras.`,
      };
    }

    const verified = top.providerVerified ? " Patikrintas meistras." : "";
    const dist =
      top.distanceKm < 2 ? "labai arti jūsų" : `už ${top.distanceKm.toFixed(1)} km`;
    return {
      intent,
      matchCount: services.length,
      topListing: top,
      response: `Radau ${top.title} ${cityLabel}, ${dist}.${verified} Kaina ${top.priceLabel ?? `${top.price} eurų`}. Norite paskambinti?`,
    };
  }

  return {
    intent,
    matchCount: 0,
    topListing: null,
    response:
      "Supratau. Galite paklausti, ar atsirado naujų skelbimų, ar paprašyti surasti meistrą Panevėžyje.",
  };
}
