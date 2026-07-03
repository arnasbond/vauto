import { visionExtractJson } from "./llm-provider.js";
import { generateBuyerPersonaDescriptions } from "./description-personas.js";
import { WARDROBE_ANTI_HALLUCINATION_RULE } from "./vision-guardrails.js";

export interface WardrobeVisionItem {
  id: string;
  title: string;
  categoryGroup: string;
  categorySub: string;
  size: string;
  color: string;
  brand: string;
  condition: string;
  suggestedPrice: number;
  description: string;
  descriptionVariants?: {
    family?: string;
    youth?: string;
    rational?: string;
  };
}

export interface WardrobeVisionResult {
  items: WardrobeVisionItem[];
  voiceAnnouncement: string;
}

const WARDROBE_SCHEMA = `{
  "items": [
    {
      "id": "wardrobe-1",
      "title": "string — lietuviškas pavadinimas",
      "categoryGroup": "Moterims | Vyrams | Vaikams",
      "categorySub": "Suknelės | Palaidinės | Švarkai | Kelnės | …",
      "size": "XS | S | M | L | XL | …",
      "color": "string",
      "brand": "string — jei nežinoma, „Be ženklo"",
      "condition": "Nauja su etiketėmis | Labai gera | Gera | Patenkinama",
      "suggestedPrice": "number EUR",
      "description": "string — emocingas aprašymas 2–4 sakiniai"
    }
  ],
  "voiceAnnouncement": "string — šiltas sekretoriaus pranešimas vartotojai, pvz. „{Vardas}, tavo nuotraukoje matau 3 drabužius…""
}`;

function parseItems(raw: Record<string, unknown>): WardrobeVisionItem[] {
  const arr = raw.items;
  if (!Array.isArray(arr)) return [];
  return arr
    .map((entry, idx) => {
      if (!entry || typeof entry !== "object") return null;
      const o = entry as Record<string, unknown>;
      const title = String(o.title ?? `Drabužis ${idx + 1}`).trim();
      if (!title) return null;
      return {
        id: String(o.id ?? `wardrobe-${idx + 1}`),
        title,
        categoryGroup: String(o.categoryGroup ?? "Moterims"),
        categorySub: String(o.categorySub ?? "Kita"),
        size: String(o.size ?? "M"),
        color: String(o.color ?? "Mišri"),
        brand: String(o.brand ?? "Be ženklo"),
        condition: String(o.condition ?? "Labai gera"),
        suggestedPrice: Math.max(1, Number(o.suggestedPrice) || 15),
        description: String(o.description ?? title),
      } satisfies WardrobeVisionItem;
    })
    .filter((x): x is WardrobeVisionItem => x !== null);
}

/** Smart Wardrobe Vision — viena nuotrauka, keli drabužiai, AI Chameleon aprašymai. */
export async function analyzeWardrobePhoto(params: {
  imageDataUrl: string;
  userName?: string;
}): Promise<WardrobeVisionResult> {
  const name = params.userName?.trim().split(/\s+/)[0] || "drauge";
  const systemInstruction = `Tu esi VAUTO drabužių vedlio AI. Nuotraukoje gali būti KELI atskiri drabužiai (spinta, lentyna).
Kiekvienam matomam objektui sukurk atskirą įrašą su unikaliu id (wardrobe-1, wardrobe-2…).
Kategorijos universalios drabužiams. Aprašymai emocingi, šilti tonu.
SVARBU (be prielaidų): categoryGroup nustatyk pagal patį drabužį — Moterims, Vyrams ARBA Vaikams. Vyriški ir vaikų drabužiai NĖRA „Moterims". Jei tikrai neaišku — rink pagal kirpimą/dydį, ne pagal numatytą lytį.
Toleruok neaiškias detales — jei ženklas/dydis nematomas, naudok „Be ženklo" / spėk dydį pagal proporcijas, bet nefantazuok faktų.
${WARDROBE_ANTI_HALLUCINATION_RULE}
Grąžink tik JSON: ${WARDROBE_SCHEMA}`;

  const prompt = `Analizuok drabužių nuotrauką. Vartotojas: ${name}.
Jei matai kelis drabužius — grąžink kiekvieną atskirai items masyve.
voiceAnnouncement: „${name}, tavo nuotraukoje matau N drabužius. Paruošiau N atskirus skelbimus, tau beliko vienu paspaudimu juos patvirtinti!"`;

  const fullPrompt = `${systemInstruction}\n\n${prompt}`;

  // Never let a Gemini outage / unparseable response crash the wardrobe flow:
  // always return a friendly, structured result the client can render.
  let raw: Record<string, unknown>;
  try {
    raw = await visionExtractJson(fullPrompt, [params.imageDataUrl], 0.35);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const busy = /\b(429|503)\b|UNAVAILABLE|overloaded|rate.?limit|high demand/i.test(msg);
    console.warn("[analyzeWardrobePhoto] vision failed:", msg);
    return {
      items: [],
      voiceAnnouncement: busy
        ? `${name}, AI šiuo metu labai užimtas — pabandykite įkelti nuotrauką dar kartą po kelių sekundžių.`
        : `${name}, nepavyko atpažinti drabužio šioje nuotraukoje — įkelkite kitą, ryškesnę nuotrauką.`,
    };
  }

  const explicitError = String(raw.error ?? "").trim();
  if (/prekė neatpažinta|neatpažinta/i.test(explicitError)) {
    return {
      items: [],
      voiceAnnouncement: `${name}, nuotraukoje nematau aiškaus drabužio — įkelkite kitą nuotrauką.`,
    };
  }
  let items = parseItems(raw);

  if (!items.length) {
    return {
      items: [],
      voiceAnnouncement: `${name}, nuotraukoje nematau aiškaus drabužio — įkelkite kitą nuotrauką.`,
    };
  }

  const enriched: WardrobeVisionItem[] = [];
  for (const item of items.slice(0, 8)) {
    try {
      const variants = await generateBuyerPersonaDescriptions({
        title: item.title,
        category: "clothing",
        price: item.suggestedPrice,
        baseDescription: item.description,
        attributes: {
          size: item.size,
          color: item.color,
          brand: item.brand,
          condition: item.condition,
        },
      });
      enriched.push({
        ...item,
        description: variants.youth || item.description,
        descriptionVariants: variants,
      });
    } catch {
      enriched.push(item);
    }
  }

  const count = enriched.length;
  const voiceAnnouncement =
    String(raw.voiceAnnouncement ?? "").trim() ||
    `${name}, tavo nuotraukoje matau ${count} ${count === 1 ? "drabužį" : "drabužius"}. Paruošiau ${count} atskir${count === 1 ? "į" : "us"} skelbim${count === 1 ? "ą" : "us"}, tau beliko vienu paspaudimu juos patvirtinti!`;

  return { items: enriched, voiceAnnouncement };
}
