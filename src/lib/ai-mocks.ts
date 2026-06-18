import type { AiExtractedListing, ListingCategory } from "@/lib/types";

const AI_MOCK_DELAY_MS = 1500;

export async function mockExtractFromImage(
  _fileName?: string
): Promise<AiExtractedListing> {
  await delay(AI_MOCK_DELAY_MS);

  return {
    title: "Naudotas iPhone 12 — ekranas be įbrėžimų",
    price: 280,
    location: "Panevėžys",
    contact: "+370 612 34567",
    category: "electronics",
    confidence: 0.92,
    description: "Puiki būklė, komplektas su dėklu.",
    attributes: {},
  };
}

export async function mockExtractFromVoice(
  transcript?: string
): Promise<AiExtractedListing> {
  await delay(AI_MOCK_DELAY_MS);
  return parseTranscript(
    transcript ?? "Parduodu maišą obuolių, dešimt eurų, Panevėžyje"
  );
}

export async function mockExtractFromText(
  text: string
): Promise<AiExtractedListing> {
  await delay(AI_MOCK_DELAY_MS);
  if (!text.trim()) {
    return {
      title: "Skelbimas",
      price: 0,
      location: "Panevėžys",
      contact: "+370 612 34567",
      category: "other",
      confidence: 0.5,
      attributes: {},
    };
  }
  return parseTranscript(text);
}

function parseTranscript(text: string): AiExtractedListing {
  const category = detectCategory(text);
  const price = extractPrice(text, category);
  const locationMatch = text.match(
    /(Vilnius|Kaunas|Panevėžys|Klaipėda|Šiauliai)/i
  );

  const result: AiExtractedListing = {
    title: extractTitle(text, category),
    price,
    location: locationMatch?.[1] ?? "Panevėžys",
    contact: "+370 612 34567",
    category,
    confidence: 0.87,
    description: text.length > 80 ? text.slice(0, 120) : text,
    attributes: mockAttributesForCategory(text, category),
  };

  if (category === "services") {
    result.priceLabel = "€/val";
  } else if (category === "real_estate" && /nuom/i.test(text)) {
    result.priceLabel = "€/mėn";
  } else if (category === "jobs" && /mėn|men/i.test(text)) {
    result.priceLabel = "€/mėn";
  }

  return result;
}

function extractPrice(text: string, category: ListingCategory): number {
  const digitMatch = text.match(/\d+/);
  if (digitMatch) return parseInt(digitMatch[0], 10);

  if (/penkiolika|15/i.test(text)) return 15;
  if (/dvidešimt|20/i.test(text)) return 20;
  if (/šimt|100/i.test(text)) return 100;
  if (/(\d+)\s*€|(\d+)\s*eur/i.test(text)) {
    const m = text.match(/(\d+)\s*(?:€|eur)/i);
    if (m) return Number(m[1]);
  }

  switch (category) {
    case "vehicles":
      return 5500;
    case "clothing":
      return 25;
    case "real_estate":
      return 72000;
    case "jobs":
      return 900;
    case "services":
      return 20;
    default:
      return 10;
  }
}

function detectCategory(text: string): ListingCategory {
  const t = text.toLowerCase();

  if (
    /bmw|audi|auto|masin|mašin|vairas|rida|dyzel|benzin|opel|vw|golf/i.test(t)
  ) {
    return "vehicles";
  }
  if (/suknel|batai|zara|rubas|drabuž|marškin|striuk|nike|dydis|būklė/i.test(t)) {
    return "clothing";
  }
  if (/butas|namas|sklypas|nuomoju|kambar|kv\.?m|aukštas|nt\b|nekilnojam/i.test(t)) {
    return "real_estate";
  }
  if (/darbas|darbo|atlygin|etat|ieškau darbo|siūlau darb/i.test(t)) {
    return "jobs";
  }
  if (
    /pjaut|žol|elektrik|meistr|paslaug|remont|valym|sąskait/i.test(t)
  ) {
    return "services";
  }
  if (/telefon|iphone|samsung/i.test(t)) return "electronics";
  if (/obuol|maiš|daržov/i.test(t)) return "home";
  return "other";
}

function mockAttributesForCategory(
  text: string,
  category: ListingCategory
): Record<string, string | string[]> {
  switch (category) {
    case "vehicles":
      return {
        mileage: /(\d{2,3}\s?\d{3})\s*km/i.test(text)
          ? text.match(/(\d{2,3}\s?\d{3})\s*km/i)![1].replace(/\s/g, "") + " km"
          : "185,000 km",
        engine: /1[.,]\d|tdi|tsi/i.test(text)
          ? (text.match(/1[.,]\d\s?\w+|tdi|tsi/gi)?.[0] ?? "1.6 TDI")
          : "1.6 TDI",
        fuelType: /dyzel/i.test(text)
          ? "Dyzelinas"
          : /benzin/i.test(text)
            ? "Benzinas"
            : "Dyzelinas",
        taExpiry: /20\d{2}[-/]\d{2}/.test(text)
          ? (text.match(/20\d{2}[-/]\d{2}/)?.[0] ?? "2027-05")
          : "2027-05",
        defects: /defekt|įbrėžim/i.test(text) ? "Smulkūs įbrėžimai" : "",
        vin: "WBA3A510X0KXXXXXX",
      };
    case "clothing":
      return {
        size: text.match(/\b(XXS|XS|S|M|L|XL|XXL|\d{2})\b/i)?.[1] ?? "M",
        brand: text.match(/\b(nike|zara|hm|adidas)\b/i)?.[1] ?? "Zara",
        condition: /nauj/i.test(text)
          ? "Nauja"
          : /gera|labai gera/i.test(text)
            ? "Labai gera"
            : "Gera",
        color: text.match(/\b(juoda|balta|mėlyna|raudona)\b/i)?.[1] ?? "",
      };
    case "services":
      return {
        experience: /(\d+)\s*m(?:etų|\.)/i.test(text)
          ? text.match(/(\d+)\s*m/)![1] + " metai"
          : "5 metai",
        serviceList: [
          /remont/i.test(text) ? "Remontas" : "",
          /pjov|žol/i.test(text) ? "Žolės pjovimas" : "",
          /elektrik/i.test(text) ? "Elektros darbai" : "",
          /montav/i.test(text) ? "Montavimas" : "",
        ].filter(Boolean),
        invoicing: /sąskait/i.test(text) ? "Išrašoma MB/IV" : "Išrašoma MB/IV",
        workingRadius: "30 km aplink Panevėžį",
      };
    case "real_estate":
      return {
        area: text.match(/(\d+)\s*kv/i)?.[1]
          ? `${text.match(/(\d+)\s*kv/i)![1]} kv.m.`
          : "54 kv.m.",
        rooms: text.match(/(\d+)\s*kamb/i)?.[1] ?? "2",
        floor: text.match(/(\d+)\s*aukšt/i)?.[1] ?? "",
        heating: /centrin/i.test(text)
          ? "Centrinis"
          : /autonom/i.test(text)
            ? "Autonominis"
            : "Autonominis",
      };
    case "jobs":
      return {
        jobType: /siūlau darb|siulau darb/i.test(text)
          ? "Siūlau darbą"
          : "Ieškau darbo",
        employmentType: /pilnas etat/i.test(text) ? "Pilnas etatas" : "Derinamas",
        salaryType: /mėn|men/i.test(text) ? "Mėnesinis" : "Derinamas",
        schedule: "",
        requirements: "",
      };
    default:
      return {};
  }
}

function extractTitle(text: string, category: ListingCategory): string {
  switch (category) {
    case "vehicles":
      return "Automobilis (atpažintas iš AI)";
    case "clothing":
      return "Drabužis / Apranga";
    case "real_estate":
      return /nuom/i.test(text) ? "Nuomojamas būstas" : "Nekilnojamas turtas";
    case "services":
      return /žol|pjov/i.test(text)
        ? "Žolės pjovimo paslauga"
        : /elektrik/i.test(text)
          ? "Elektros paslaugos"
          : "Profesionali paslauga";
    case "jobs":
      return /siūlau darb|siulau darb/i.test(text)
        ? "Siūlomas darbas"
        : "Ieškau darbo";
    case "electronics":
      return "Mobilus telefonas";
    case "home":
      return /obuol/i.test(text) ? "Maišas obuolių — švieži" : "Buitinė prekė";
    default:
      return text.length > 60 ? text.slice(0, 60) : "Universalus daiktas";
  }
}

export async function mockTranscribeAudio(_blob?: Blob): Promise<string> {
  await delay(800);
  return "Parduodu maišą obuolių, dešimt eurų, Panevėžyje. Skambinkite.";
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
