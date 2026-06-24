import type { VoiceIntentAnalysis } from "@/lib/voice-intent";

export const BUDDY_REPEAT_PROMPT =
  "Atsiprašau, ne viską aiškiai išgirdau. Ar galėtumėte pakartoti komandą?";

/** Detect garbled STT noise or unusable transcript before AI. */
export function isUnclearTranscript(text: string | null | undefined): boolean {
  if (!text?.trim()) return true;
  const t = text.trim();
  if (t.length < 2) return true;
  if (!/\p{L}/u.test(t)) return true;
  const letters = (t.match(/\p{L}/gu) ?? []).length;
  if (letters / t.length < 0.35) return true;
  if (/^(hm+|aha+|mm+|uh+|[.,?*#])+$/iu.test(t)) return true;
  return false;
}

export function isValidVoiceIntentPayload(
  raw: unknown
): raw is VoiceIntentAnalysis {
  if (!raw || typeof raw !== "object") return false;
  const r = raw as Record<string, unknown>;
  return (
    typeof r.understoodSummary === "string" &&
    typeof r.mergedTranscript === "string" &&
    typeof r.needsClarification === "boolean"
  );
}

export function createGracefulVoiceIntentFallback(
  transcript: string
): VoiceIntentAnalysis {
  return {
    understoodSummary: "Ne viską aiškiai supratau",
    needsClarification: true,
    followUpQuestion: BUDDY_REPEAT_PROMPT,
    missingFields: [],
    imageSearchQuery: "",
    mergedTranscript: transcript.trim(),
    category: "other",
    confidence: 0.2,
    intent: "general",
  };
}

export function buddyMessageForAgentFailure(error?: string): string {
  if (!error?.trim()) return BUDDY_REPEAT_PROMPT;
  if (/json|parse|invalid|unexpected token/i.test(error)) return BUDDY_REPEAT_PROMPT;
  if (/tuščia|empty|neaišk/i.test(error)) return BUDDY_REPEAT_PROMPT;
  return BUDDY_REPEAT_PROMPT;
}
