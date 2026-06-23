import { apiAnalyzeVoice } from "@/lib/api/client";
import { isAiProxyAvailable } from "@/lib/api/config";
import { hasOpenAiKey } from "@/lib/openai-settings";
import { analyzeVoiceIntentOpenAI } from "@/lib/openai";
import { isVehicleQuery } from "@/lib/vehicle-keywords";

export interface VoiceIntentTurn {
  role: "user" | "assistant";
  text: string;
}

export interface VoiceIntentAnalysis {
  understoodSummary: string;
  needsClarification: boolean;
  followUpQuestion: string | null;
  missingFields: string[];
  imageSearchQuery: string;
  mergedTranscript: string;
  category: string;
  confidence: number;
}

const VOICE_INTENT_SCHEMA = `{
  "understoodSummary": "string — lietuviškai, trumpai ką supratai (pvz. Supratau: iPhone, naudotas, Vilnius)",
  "needsClarification": "boolean — true jei trūksta svarbios info",
  "followUpQuestion": "string | null — vienas konkretus klausimas lietuviškai (modelis, metai, būklė ir pan.)",
  "missingFields": ["string"],
  "imageSearchQuery": "string — 2-5 žodžių paieška nuotraukoms anglų arba neutralia kalba",
  "mergedTranscript": "string — visas vartotojo ketinimas vienu sakiniu",
  "category": "electronics | vehicles | services | home | clothing | real_estate | other",
  "confidence": "number 0-1"
}`;

function mockAnalyzeVoiceIntent(
  transcript: string,
  mode: "search" | "listing",
  history: VoiceIntentTurn[]
): VoiceIntentAnalysis {
  const merged = [...history.filter((h) => h.role === "user"), { role: "user" as const, text: transcript }]
    .map((h) => h.text)
    .join(". ");
  const lower = merged.toLowerCase();

  const isPhone = /telefon|iphone|samsung|xiaomi|huawei|mobilus/i.test(lower);
  const isCar = isVehicleQuery(lower);
  const hasModel = /\b(c[1-5]|xsara|berlingo|308|208|golf|passat|corolla|520|320|a4|a6|c3|c4|c5)\b/i.test(lower);
  const hasYear = /\b(19|20)\d{2}\b/.test(lower);
  const rounds = history.filter((h) => h.role === "assistant").length;

  if (rounds >= 2) {
    return {
      understoodSummary: `Supratau: ${merged.slice(0, 120)}`,
      needsClarification: false,
      followUpQuestion: null,
      missingFields: [],
      imageSearchQuery: isPhone ? "smartphone" : isCar ? "car" : merged.slice(0, 40),
      mergedTranscript: merged,
      category: isPhone ? "electronics" : isCar ? "vehicles" : "other",
      confidence: 0.72,
    };
  }

  if (isPhone && !hasModel) {
    return {
      understoodSummary: "Supratau: mobilus telefonas",
      needsClarification: true,
      followUpQuestion: "Koks tikslus modelis ir būklė? Pvz. iPhone 13, naudotas.",
      missingFields: ["modelis", "būklė"],
      imageSearchQuery: "smartphone",
      mergedTranscript: merged,
      category: "electronics",
      confidence: 0.55,
    };
  }

  if (isCar && !hasYear) {
    return {
      understoodSummary: "Supratau: automobilis",
      needsClarification: true,
      followUpQuestion: "Koks modelis ir pagaminimo metai? Pvz. BMW 520d, 2018.",
      missingFields: ["modelis", "metai"],
      imageSearchQuery: "bmw car",
      mergedTranscript: merged,
      category: "vehicles",
      confidence: 0.55,
    };
  }

  const action =
    mode === "listing" || /\bparduod|siūlau|nuomoj/i.test(lower)
      ? "parduoti / įdėti skelbimą"
      : "ieškoti";

  return {
    understoodSummary: `Supratau: ${merged.slice(0, 100)} (${action})`,
    needsClarification: false,
    followUpQuestion: null,
    missingFields: [],
    imageSearchQuery: merged.split(/\s+/).slice(0, 4).join(" "),
    mergedTranscript: merged,
    category: isPhone ? "electronics" : isCar ? "vehicles" : "other",
    confidence: 0.78,
  };
}

export async function analyzeVoiceIntent(params: {
  transcript: string;
  mode: "search" | "listing";
  history?: VoiceIntentTurn[];
  userCity?: string;
}): Promise<VoiceIntentAnalysis> {
  const history = params.history ?? [];
  const city = params.userCity ?? "Lietuva";

  if (isAiProxyAvailable()) {
    const remote = await apiAnalyzeVoice({
      transcript: params.transcript,
      mode: params.mode,
      history,
      userCity: city,
    });
    if (remote) return remote;
  }

  if (hasOpenAiKey()) {
    try {
      return await analyzeVoiceIntentOpenAI({
        transcript: params.transcript,
        mode: params.mode,
        history,
        userCity: city,
        schema: VOICE_INTENT_SCHEMA,
      });
    } catch (e) {
      console.warn("[Vauto] Voice intent OpenAI failed:", e);
    }
  }

  return mockAnalyzeVoiceIntent(params.transcript, params.mode, history);
}
