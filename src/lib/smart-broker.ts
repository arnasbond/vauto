import type { ScoredListing } from "@/lib/types";
import { sanitizeSearchQuery } from "@/lib/portal-listing-filter";

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

const VEHICLE_BRANDS =
  /\b(bmw|audi|volkswagen|vw|mercedes|benz|toyota|volvo|ford|opel|skoda|seat|nissan|mazda|honda|hyundai|kia|peugeot|renault|citro[eë]n|fiat|lexus|porsche|tesla|subaru|mitsubishi|suzuki|dacia|jeep|land rover|mini)\b/i;

const NOISE_TOKENS = new Set([
  "home",
  "namai",
  "tipas",
  "spalva",
  "spalvos",
  "kategorija",
  "filtruok",
  "rodyk",
  "parodyk",
  "tik",
  "ir",
  "su",
  "be",
  "nuo",
  "iki",
  "eur",
  "€",
  "naudotas",
  "naudota",
  "naudoti",
  "pristatymu",
  "automatin",
  "mechanin",
  "benzin",
  "dyzel",
]);

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

function capSuggestion(text: string, max = 44): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (trimmed.length <= max) return trimmed;
  return trimmed.slice(0, max).replace(/\s+\S*$/, "").trim();
}

function extractBrand(query: string): string | null {
  const match = query.match(VEHICLE_BRANDS);
  if (!match) return null;
  const raw = match[1].toLowerCase();
  if (raw === "vw") return "Volkswagen";
  if (raw === "benz") return "Mercedes";
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function isCityToken(token: string): boolean {
  return CITY_PATTERNS.some(([pattern]) => pattern.test(token));
}

function meaningfulTokens(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[\s,./]+/)
    .map((t) => t.replace(/[^\p{L}\p{N}-]/gu, ""))
    .filter((t) => t.length > 1 && !NOISE_TOKENS.has(t) && !isCityToken(t));
}

function buildSuggestedQueries(
  query: string,
  city: string,
  categoryLabel: string
): string[] {
  const cityLabel = city === "Lietuva" ? "Vilnius" : city;
  const brand = extractBrand(query);
  const suggestions: string[] = [];

  if (brand) {
    suggestions.push(
      `${brand} ${cityLabel}`,
      `Naudoti ${brand}`,
      `${brand} automatas`
    );
  } else if (categoryLabel === "nekilnojamas turtas") {
    suggestions.push(
      `Butai ${cityLabel}`,
      `Namai ${cityLabel}`,
      `Sklypai ${cityLabel}`
    );
  } else if (categoryLabel === "paslaugos") {
    const topic = meaningfulTokens(query).slice(0, 2).join(" ");
    suggestions.push(
      topic ? `${topic} ${cityLabel}` : `Meistrai ${cityLabel}`,
      `Remontas ${cityLabel}`,
      `Paslaugos ${cityLabel}`
    );
  } else if (categoryLabel === "darbas") {
    const role = meaningfulTokens(query).slice(0, 2).join(" ");
    suggestions.push(
      role ? `${role} ${cityLabel}` : `Darbas ${cityLabel}`,
      `Darbas ${cityLabel}`,
      `Etatai ${cityLabel}`
    );
  } else if (categoryLabel === "elektronika") {
    const product = meaningfulTokens(query).slice(0, 2).join(" ");
    suggestions.push(
      product ? `${product} ${cityLabel}` : `Telefonai ${cityLabel}`,
      `Naudota elektronika ${cityLabel}`,
      `Kompiuteriai ${cityLabel}`
    );
  } else {
    const topic = meaningfulTokens(query).slice(0, 2).join(" ");
    suggestions.push(
      topic ? `${topic} ${cityLabel}` : `Prekės ${cityLabel}`,
      `Naudotos prekės ${cityLabel}`,
      `Pasiūlymai ${cityLabel}`
    );
  }

  const seen = new Set<string>();
  return suggestions
    .map((s) => capSuggestion(s))
    .filter((s) => s.length >= 3 && !seen.has(s.toLowerCase()) && seen.add(s.toLowerCase()))
    .slice(0, 3);
}

export function buildSmartBrokerSignal(
  query: string,
  listings: ScoredListing[]
): SmartBrokerSignal | null {
  const q = sanitizeSearchQuery(query, "final");
  if (q.length < 3) return null;

  const top = listings[0];
  const hasStrongMatch = Boolean(top && top.semanticRelevance >= 0.28);
  if (listings.length > 0 && hasStrongMatch) return null;

  const mode: BrokerMode = listings.length === 0 ? "empty" : "weak-match";
  const city = detectCity(q);
  const categoryLabel = detectCategoryLabel(q);
  const isServiceLead = categoryLabel === "paslaugos";
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
    suggestedQueries: buildSuggestedQueries(q, city, categoryLabel),
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
