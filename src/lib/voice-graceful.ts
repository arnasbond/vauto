import type { VoiceIntentAnalysis } from "@/lib/voice-intent";
import { VAUTO_IN_DOMAIN_RECOVERY } from "@vauto/shared/vauto-domain-autonomy";

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
    understoodSummary: "Tęsiame VAUTO pagalba",
    needsClarification: true,
    followUpQuestion: VAUTO_IN_DOMAIN_RECOVERY,
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
    normalizedCode === "payload_too_large" ||
    /413|payload too large|entity too large|request entity|užklausa per didel|per didelė/i.test(
      err
    )
  ) {
    return "Nuotraukos per didelės siuntimui vienu metu — bandykite dar kartą (jos bus sumažintos automatiškai) arba įkelkite po 2–3 nuotraukas.";
  }

  if (
    normalizedCode === "ai_rate_limit_exceeded" ||
    normalizedCode === "rate_limited" ||
    /rate.?limit|429|limitas pasiektas|per daug.*užklaus|bandykite po minutės/i.test(err)
  ) {
    return (
      err ||
      "Dabar daug užklausų — bandau dar kartą po minutės. Kol kas galite parašyti kitą klausimą dėl skelbimo ar paieškos."
    );
  }

  if (normalizedCode === "timeout" || /timeout|laiko limit|aborted/i.test(err)) {
    return "Užtruko ilgiau nei įprastai — nuotraukų siuntimas nutrūko. Bandykite dar kartą arba įkelkite mažiau nuotraukų vienu metu.";
  }

  if (
    normalizedCode === "network_error" ||
    /failed to fetch|networkerror|load failed|network request failed|err_network|connection reset|econnreset/i.test(
      err
    )
  ) {
    return "Ryšys nutrūko siunčiant nuotraukas — bandykite dar kartą. Jei kartojasi, įkelkite po 2–3 nuotraukas.";
  }

  // True upstream outage only — not every "serveris" substring in Lithuanian copy.
  if (
    normalizedCode === "agent_unavailable" ||
    /502|503|bad gateway|overloaded|high demand|nepasiekiamas — serveris atsistato/i.test(
      err
    )
  ) {
    return "AI asistentas šiuo metu nepasiekiamas — serveris atsistato. Bandykite po kelių minučių.";
  }

  return VAUTO_IN_DOMAIN_RECOVERY;
}
