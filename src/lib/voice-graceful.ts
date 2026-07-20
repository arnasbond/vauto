import type { VoiceIntentAnalysis } from "@/lib/voice-intent";

export const BUDDY_REPEAT_PROMPT =
  "Hmm, ne visai supratau — gal galite parašyti kitaip arba trumpiau apibūdinti, ko ieškote?";

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

export function buddyMessageForAgentFailure(error?: string, code?: string): string {
  const err = error?.trim() ?? "";
  const normalizedCode = code?.trim().toLowerCase() ?? "";

  if (
    normalizedCode === "ai_rate_limit_exceeded" ||
    normalizedCode === "rate_limited" ||
    /rate.?limit|429|limitas pasiektas|per daug.*užklaus|bandykite po minutės/i.test(err)
  ) {
    return (
      err ||
      "Dabar daug užklausų — bandau dar kartą po minutės. Kol kas galite parašyti kitą klausimą."
    );
  }

  if (
    normalizedCode === "agent_unavailable" ||
    /502|503|bad gateway|unavailable|nepasiekiamas|overloaded|high demand|serveris/i.test(
      err
    )
  ) {
    return "AI asistentas šiuo metu nepasiekiamas — serveris atsistato. Bandykite po kelių minučių.";
  }

  if (normalizedCode === "timeout" || /timeout|laiko limit/i.test(err)) {
    return "Užtruko ilgiau nei įprastai — bandykite dar kartą, aš pasiruošęs padėti.";
  }

  if (!err) return BUDDY_REPEAT_PROMPT;
  if (/json|parse|invalid|unexpected token/i.test(err)) return BUDDY_REPEAT_PROMPT;
  if (/tuščia|empty|neaišk/i.test(err)) return BUDDY_REPEAT_PROMPT;
  return BUDDY_REPEAT_PROMPT;
}
