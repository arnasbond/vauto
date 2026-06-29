import type { Listing } from "@/lib/types";
import {
  getClientGeminiApiKey,
  isClientGeminiAvailable,
} from "@/lib/gemini-browser";

export interface SearchBuyerInsight {
  summary: string;
  budgetNote: string;
  equipmentTips: string[];
  technicalTips: string[];
}

const INSIGHT_SCHEMA = `{
  "summary": "string — 2-3 sakiniai, draugiškas lietuviškas komentaras apie paiešką",
  "budgetNote": "string — biudžeto įvertinimas ir ką realiai galima rasti",
  "equipmentTips": ["string — rekomenduojama komplektacija arba savybės, iki 4 punktų"],
  "technicalTips": ["string — techniniai patarimai pirkėjui, iki 4 punktų"]
}`;

function parseBudgetFromQuery(query: string): number | null {
  const m = query.match(/(?:iki|max|ne\s+daugiau|≤|<=)\s*(\d[\d\s.]*)\s*(?:k|tūkst|eur|€)?/i);
  if (m) {
    let n = parseFloat(m[1]!.replace(/\s/g, ""));
    if (/k|tūkst/i.test(m[0]!) && n < 1000) n *= 1000;
    return Number.isFinite(n) ? n : null;
  }
  const plain = query.match(/(\d{4,6})\s*(?:€|eur)?/i);
  if (plain) return parseInt(plain[1]!, 10);
  return null;
}

function compactListingsForPrompt(listings: Listing[]): string {
  return listings
    .slice(0, 5)
    .map(
      (l, i) =>
        `${i + 1}. ${l.title} — ${l.price} €, ${l.location}${l.attributes?.make ? `, ${l.attributes.make}` : ""}`
    )
    .join("\n");
}

function localSearchInsight(
  query: string,
  listings: Listing[],
  userCity?: string
): SearchBuyerInsight {
  const budget = parseBudgetFromQuery(query);
  const city = userCity || "Lietuvoje";
  const isBmw = /bmw|530|520|320|x5|x3|f10|g30/i.test(query);
  const isVehicle = /auto|bmw|audi|vw|volvo|mercedes|toyota|honda|530|320/i.test(query);
  const count = listings.length;
  const top = listings[0];

  const budgetNote =
    budget != null
      ? `Už ${budget.toLocaleString("lt-LT")} € ${city} rinkoje ${isBmw ? "galima rasti gerą F10 LCI ar G30 variantą su protinga rida." : "galima rasti kelis solidžius variantus — verta lyginti ridą ir serviso istoriją."}`
      : count > 0 && top
        ? `Rastų skelbimų kainos prasideda nuo ${top.price.toLocaleString("lt-LT")} € — ${city} rinkoje verta tartis dėl 5–8 % nuolaidos.`
        : `Tikslesniam biudžetui nurodykite sumą (pvz. „iki 15 000 €") — parinksime geriausius variantus.`;

  const equipmentTips = isBmw
    ? ["M Sport paketas", "Head-Up Display", "Comfort sėdynės", "LED / Adaptive žibintai"]
    : isVehicle
      ? ["Klimato kontrolė", "Navigacija / CarPlay", "Odinis salonas", "Automatinė pavarų dėžė"]
      : ["Patikrinkite būklę nuotraukose", "Palyginkite kainas su panašiais skelbimais"];

  const technicalTips = isBmw
    ? [
        "Patikrinkite grandinės keitimo istoriją (N47/N57 varikliai)",
        "DPF ir EGR būklė — svarbu miesto režimui",
        "Serviso knygelė ir originalūs dalių čekiai",
      ]
    : isVehicle
      ? [
          "Techninė apžiūra ir ridos patikimumas",
          "Korozija ir dažų storio matavimas",
          "Variklio ir pavarų dėžės testas važiuojant",
        ]
      : ["Skaitykite aprašymą ir klauskite pardavėjo detalių"];

  const summary =
    count > 0
      ? `Pagal „${query}" radome ${count} atitinkančių skelbimų. ${top ? `Geriausias pasiūlymas dabar — „${top.title}" (${top.price.toLocaleString("lt-LT")} €).` : ""} Žemiau — mano TOP 5 rekomendacijos.`
      : `Pagal „${query}" tiesioginių atitikmenų kol kas nėra. ${budgetNote} Galite patikslinti užklausą arba įtraukti pageidavimą — pranešime, kai atsiras.`;

  return { summary, budgetNote, equipmentTips, technicalTips };
}

async function geminiSearchInsight(
  query: string,
  listings: Listing[],
  userCity?: string
): Promise<SearchBuyerInsight> {
  const apiKey = getClientGeminiApiKey();
  if (!apiKey) throw new Error("Gemini API key missing");

  const listingBlock =
    listings.length > 0
      ? `\nRealūs skelbimai duomenų bazėje:\n${compactListingsForPrompt(listings)}`
      : "\nDuomenų bazėje šiuo metu nėra tiesioginių atitikmenų.";

  const userPrompt = [
    "Tu esi VAUTO AI pirkėjo patarėjas Lietuvoje.",
    `Paieškos užklausa: "${query}"`,
    `Vartotojo miestas: ${userCity || "Lietuva"}`,
    listingBlock,
    "Duok įžvalgų komentarą: biudžeto vertinimas, rekomenduojama komplektacija, techniniai patarimai pirkėjui.",
    "Rašyk lietuviškai, konkrečiai, kaip patyręs konsultantas.",
    `Grąžink JSON: ${INSIGHT_SCHEMA}`,
  ].join("\n");

  const models = ["gemini-2.5-flash", "gemini-1.5-flash"];
  let lastErr: unknown;
  for (const model of models) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: "Grąžink tik JSON." }] },
            contents: [{ role: "user", parts: [{ text: userPrompt }] }],
            generationConfig: { responseMimeType: "application/json", temperature: 0.35 },
          }),
        }
      );
      if (!res.ok) continue;
      const data = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      const parsed = JSON.parse(text) as Partial<SearchBuyerInsight>;
      if (parsed.summary?.trim()) {
        return {
          summary: parsed.summary.trim(),
          budgetNote: parsed.budgetNote?.trim() || "",
          equipmentTips: Array.isArray(parsed.equipmentTips)
            ? parsed.equipmentTips.filter(Boolean).slice(0, 4)
            : [],
          technicalTips: Array.isArray(parsed.technicalTips)
            ? parsed.technicalTips.filter(Boolean).slice(0, 4)
            : [],
        };
      }
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr ?? new Error("Gemini search insight failed");
}

const insightCache = new Map<string, { at: number; insight: SearchBuyerInsight }>();
const CACHE_TTL_MS = 60_000;

export async function generateSearchBuyerInsight(
  query: string,
  listings: Listing[],
  userCity?: string
): Promise<SearchBuyerInsight> {
  const q = query.trim();
  if (!q) {
    return localSearchInsight(q, listings, userCity);
  }

  const key = `${q.toLowerCase()}|${listings.slice(0, 3).map((l) => l.id).join(",")}`;
  const cached = insightCache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.insight;
  }

  if (isClientGeminiAvailable()) {
    try {
      const insight = await geminiSearchInsight(q, listings, userCity);
      insightCache.set(key, { at: Date.now(), insight });
      return insight;
    } catch {
      /* fallback */
    }
  }

  const fallback = localSearchInsight(q, listings, userCity);
  insightCache.set(key, { at: Date.now(), insight: fallback });
  return fallback;
}

export function formatInsightAsMessage(insight: SearchBuyerInsight): string {
  const parts = [insight.summary];
  if (insight.budgetNote) parts.push(insight.budgetNote);
  if (insight.equipmentTips.length) {
    parts.push(`Rekomenduojama: ${insight.equipmentTips.join(", ")}.`);
  }
  if (insight.technicalTips.length) {
    parts.push(`Į ką atkreipti dėmesį: ${insight.technicalTips.join("; ")}.`);
  }
  return parts.join(" ");
}
