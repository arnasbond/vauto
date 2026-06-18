import type { AiExtractedListing, ListingCategory } from "@/lib/types";

export async function mockExtractFromImage(
  _fileName?: string
): Promise<AiExtractedListing> {
  await delay(100);

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
  await delay(100);
  return parseTranscript(
    transcript ?? "Parduodu maišą obuolių, dešimt eurų, Panevėžyje"
  );
}

export async function mockExtractFromText(
  text: string
): Promise<AiExtractedListing> {
  await delay(100);
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
  let price = 10;
  if (/penkiolika|15/i.test(text)) price = 15;
  if (/dvidešimt|20/i.test(text)) price = 20;
  if (/šimt|100/i.test(text)) price = 100;
  if (/(\d+)\s*€|(\d+)\s*eur/i.test(text)) {
    const m = text.match(/(\d+)\s*(?:€|eur)/i);
    if (m) price = Number(m[1]);
  }

  const category = detectCategory(text);
  const locationMatch = text.match(
    /(Vilnius|Kaunas|Panevėžys|Klaipėda|Šiauliai)/i
  );

  return {
    title: extractTitle(text, category),
    price,
    location: locationMatch?.[1] ?? "Panevėžys",
    contact: "+370 612 34567",
    category,
    confidence: 0.87,
    description: text.length > 80 ? text.slice(0, 120) : undefined,
    attributes: mockAttributesForCategory(text, category),
  };
}

function detectCategory(text: string): ListingCategory {
  if (/auto|bmw|vw|golf|opel|mašin|rida|dyzel|benzin/i.test(text))
    return "vehicles";
  if (/drabuž|marškin|suknel|dydis|nike|zara|būklė/i.test(text))
    return "clothing";
  if (/butas|namas|kambar|kv\.?m|aukštas|nt\b|nekilnojam/i.test(text))
    return "real_estate";
  if (/meistr|paslaug|remont|pjov|valym|sąskait/i.test(text))
    return "services";
  if (/telefon|iphone|samsung/i.test(text)) return "electronics";
  if (/obuol|maiš|daržov/i.test(text)) return "home";
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
          ? text.match(/(\d{2,3}\s?\d{3})\s*km/i)![1] + " km"
          : "",
        engine: /1[.,]\d|tdi|tsi/i.test(text)
          ? (text.match(/1[.,]\d\s?\w+|tdi|tsi/gi)?.[0] ?? "1.6")
          : "",
        fuelType: /dyzel/i.test(text)
          ? "Dyzelinas"
          : /benzin/i.test(text)
            ? "Benzinas"
            : "",
        taExpiry: "",
        defects: /defekt|įbrėžim/i.test(text) ? "Smulkūs įbrėžimai" : "",
      };
    case "clothing":
      return {
        size: text.match(/\b(XXS|XS|S|M|L|XL|XXL|\d{2})\b/i)?.[1] ?? "",
        brand: text.match(/\b(nike|zara|hm|adidas)\b/i)?.[1] ?? "",
        condition: /nauj/i.test(text)
          ? "Nauja"
          : /gera/i.test(text)
            ? "Gera"
            : "",
        color: text.match(/\b(juoda|balta|mėlyna|raudona)\b/i)?.[1] ?? "",
      };
    case "services":
      return {
        experience: /(\d+)\s*m(?:etų|\.)/i.test(text)
          ? text.match(/(\d+)\s*m/)![1] + " m."
          : "",
        serviceList: [/remont/i.test(text) ? "Remontas" : "", /montav/i.test(text) ? "Montavimas" : ""].filter(Boolean),
        invoicing: /sąskait/i.test(text) ? "Taip, su PVM" : "",
        workingRadius: "",
      };
    case "real_estate":
      return {
        area: text.match(/(\d+)\s*kv/i)?.[1]
          ? `${text.match(/(\d+)\s*kv/i)![1]} kv.m.`
          : "",
        rooms: text.match(/(\d+)\s*kamb/i)?.[1] ?? "",
        floor: text.match(/(\d+)\s*aukšt/i)?.[1] ?? "",
        heating: /centrin/i.test(text) ? "Centrinis" : "",
      };
    default:
      return {};
  }
}

function extractTitle(text: string, category: ListingCategory): string {
  if (category === "vehicles") return "Parduodu automobilį";
  if (category === "clothing") return "Drabužis pardavimui";
  if (category === "real_estate") return "Butas / namas";
  if (category === "services") return "Paslaugos";
  if (/obuol/i.test(text)) return "Maišas obuolių — švieži";
  if (/žol/i.test(text)) return "Žolės pjovimo paslauga";
  if (/telefon/i.test(text)) return "Mobilus telefonas";
  return text.slice(0, 60);
}

export async function mockTranscribeAudio(_blob?: Blob): Promise<string> {
  await delay(800);
  return "Parduodu maišą obuolių, dešimt eurų, Panevėžyje. Skambinkite.";
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
