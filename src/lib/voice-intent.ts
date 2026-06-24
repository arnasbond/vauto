import { apiAnalyzeVoice } from "@/lib/api/client";
import { isAiProxyAvailable } from "@/lib/api/config";
import { detectSellerListingIntent } from "@/lib/scoring";
import { sanitizeSpeechTranscript } from "@/lib/speech-transcript";
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
  intent?: "sell" | "search" | "service" | "general";
}

const VOICE_INTENT_SCHEMA = `{
  "understoodSummary": "string — lietuviškai, trumpai ką supratai",
  "needsClarification": "boolean",
  "followUpQuestion": "string | null",
  "missingFields": ["string"],
  "imageSearchQuery": "string — tik paieškai",
  "mergedTranscript": "string",
  "intent": "sell | search | service | general",
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
  const isListing =
    mode === "listing" || detectSellerListingIntent(merged);

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
      imageSearchQuery: isListing ? "" : isPhone ? "smartphone" : isCar ? "car" : merged.slice(0, 40),
      mergedTranscript: merged,
      category: isPhone ? "electronics" : isCar ? "vehicles" : "other",
      confidence: 0.72,
      intent: isListing ? "sell" : "search",
    };
  }

  if (!isListing && isPhone && !hasModel) {
    return {
      understoodSummary: "Supratau: mobilus telefonas",
      needsClarification: true,
      followUpQuestion: "Koks tikslus modelis ir būklė? Pvz. iPhone 13, naudotas.",
      missingFields: ["modelis", "būklė"],
      imageSearchQuery: "smartphone",
      mergedTranscript: merged,
      category: "electronics",
      confidence: 0.55,
      intent: "search",
    };
  }

  if (!isListing && isCar && !hasYear) {
    return {
      understoodSummary: "Supratau: automobilis",
      needsClarification: true,
      followUpQuestion: "Koks modelis ir pagaminimo metai? Pvz. BMW 520d, 2018.",
      missingFields: ["modelis", "metai"],
      imageSearchQuery: "bmw car",
      mergedTranscript: merged,
      category: "vehicles",
      confidence: 0.55,
      intent: "search",
    };
  }

  return {
    understoodSummary: isListing
      ? `Supratau: norite įkelti skelbimą — ${merged.slice(0, 100)}`
      : `Supratau: ${merged.slice(0, 100)}`,
    needsClarification: false,
    followUpQuestion: null,
    missingFields: [],
    imageSearchQuery: isListing ? "" : merged.split(/\s+/).slice(0, 4).join(" "),
    mergedTranscript: merged,
    category: isPhone ? "electronics" : isCar ? "vehicles" : "other",
    confidence: 0.78,
    intent: isListing ? "sell" : "search",
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
  const transcript = sanitizeSpeechTranscript(params.transcript);

  if (isAiProxyAvailable()) {
    const remote = await apiAnalyzeVoice({
      transcript,
      mode: params.mode,
      history,
      userCity: city,
    });
    if (remote) {
      const intent =
        (remote as VoiceIntentAnalysis).intent ??
        (detectSellerListingIntent(transcript) || params.mode === "listing"
          ? "sell"
          : "search");
      return {
        ...remote,
        intent,
        imageSearchQuery: intent === "sell" ? "" : remote.imageSearchQuery,
        understoodSummary: remote.understoodSummary.replace(/\s*\(ieškoti\)\s*$/i, ""),
      };
    }
  }

  return mockAnalyzeVoiceIntent(transcript, params.mode, history);
}

export { VOICE_INTENT_SCHEMA };
