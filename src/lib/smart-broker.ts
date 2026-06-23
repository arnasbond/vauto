import type { ScoredListing } from "@/lib/types";

export type BrokerMode = "empty" | "weak-match";

export interface SmartBrokerSignal {
  active: boolean;
  mode: BrokerMode;
  query: string;
  city: string;
  categoryLabel: string;
  message: string;
  sellerPitch: string;
  suggestedQueries: string[];
  relatedListings: ScoredListing[];
}

const CITY_PATTERNS: Array<[RegExp, string]> = [
  [/vilniuje|vilnius/i, "Vilnius"],
  [/kaune|kaunas/i, "Kaunas"],
  [/klaip[eė]doje|klaip[eė]da/i, "Klaipėda"],
  [/[šs]iauliuose|[šs]iauliai/i, "Šiauliai"],
  [/panev[eė][žz]yje|panev[eė][žz]ys/i, "Panevėžys"],
  [/alytuje|alytus/i, "Alytus"],
  [/marijampol[eė]je|marijampol[eė]/i, "Marijampolė"],
  [/utenoje|utena/i, "Utena"],
  [/palangoje|palanga/i, "Palanga"],
];

function detectCity(query: string): string {
  for (const [pattern, city] of CITY_PATTERNS) {
    if (pattern.test(query)) return city;
  }
  return "Lietuva";
}

function detectCategoryLabel(query: string): string {
  if (/auto|automobil|ratlank|padang|vin|numer|golf|bmw|audi/i.test(query)) {
    return "auto / auto dalys";
  }
  if (/telefon|iphone|samsung|kompiuter|laptop/i.test(query)) {
    return "elektronika";
  }
  if (/meistr|remont|paslaug|elektrik|santechn|žol|pjov/i.test(query)) {
    return "paslaugos";
  }
  if (/but|nam|nuom|sklyp|nt\b/i.test(query)) return "nekilnojamas turtas";
  if (/darbas|atlygin|etat|vairuotoj|sand[eė]l/i.test(query)) return "darbas";
  return "prekės / paslaugos";
}

function suggestionSeed(query: string): string {
  return query
    .replace(/\b(vilniuje|kaune|klaipėdoje|siauliuose|šiauliuose|panevėžyje)\b/gi, "")
    .trim();
}

import { sanitizeSearchQuery } from "@/lib/portal-listing-filter";

export function buildSmartBrokerSignal(
  query: string,
  listings: ScoredListing[]
): SmartBrokerSignal | null {
  const q = sanitizeSearchQuery(query);
  if (q.length < 3) return null;

  const top = listings[0];
  const hasStrongMatch = Boolean(top && top.semanticRelevance >= 0.28);
  if (listings.length > 0 && hasStrongMatch) return null;

  const mode: BrokerMode = listings.length === 0 ? "empty" : "weak-match";
  const city = detectCity(q);
  const categoryLabel = detectCategoryLabel(q);
  const isServiceLead = categoryLabel === "paslaugos";
  const base = suggestionSeed(q) || q;
  const relatedListings = listings
    .filter((listing) => listing.semanticRelevance > 0.05 || listing.score > 0.25)
    .slice(0, 3);

  return {
    active: true,
    mode,
    query: q,
    city,
    categoryLabel,
    relatedListings,
    suggestedQueries: [
      `${base} ${city === "Lietuva" ? "Vilnius" : city}`,
      `${base} naudotas`,
      `${base} su pristatymu`,
    ],
    message:
      isServiceLead
        ? `VAUTO užfiksavo paslaugos užklausą „${q}". Meistrams ${city} tai taps realaus laiko lead’u.`
        : mode === "empty"
          ? `Tiesioginio atitikmens dar nėra. Patikslinkite užklausą arba įtraukite į pageidavimų sąrašą — pranešime, kai atsiras.`
          : `Radome tik panašius skelbimus. Įtraukite „${q}" į pageidavimų sąrašą — gausite pranešimą, kai atsiras tikslesnis pasiūlymas.`,
    sellerPitch: isServiceLead
      ? `Pro meistrai galės atidaryti kontaktą per pay-per-lead arba Pro Meistras planą.`
      : `Pardavėjams su ${categoryLabel} skelbimais ši paklausa bus rodoma kaip pirkėjo signalas ${city}.`,
  };
}
