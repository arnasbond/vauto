import type { VoiceIntentAnalysis, VoiceIntentTurn } from "@/lib/voice-intent";
import type { AiExtractedListing } from "@/lib/types";

export function buildPartialListingVoicePrompt(params: {
  category?: string;
  attributes?: Record<string, string | string[] | undefined>;
  price?: number;
}): string | null {
  const category = params.category ?? "other";
  const attrs = params.attributes ?? {};
  const attr = (key: string) => {
    const v = attrs[key];
    if (Array.isArray(v)) return v.join(", ").trim();
    return String(v ?? "").trim();
  };

  const missing: string[] = [];
  if (!params.price || params.price <= 0) missing.push("price");

  if (category === "vehicles") {
    if (!attr("make")) missing.push("make");
    if (!attr("model")) missing.push("model");
    if (!attr("year")) missing.push("year");
  }

  if (!missing.length) return null;

  if (category === "vehicles") {
    const filled: string[] = [];
    if (!missing.includes("make")) filled.push("markę");
    if (!missing.includes("model")) filled.push("modelį");
    const filledPhrase =
      filled.length === 2
        ? "markę ir modelį"
        : filled.length === 1
          ? filled[0]
          : null;

    const questions: string[] = [];
    if (missing.includes("year")) {
      questions.push("kokiais metais pagamintas jūsų automobilis");
    }
    if (missing.includes("price")) {
      questions.push("kokia būtų kaina");
    }
    if (missing.includes("make") && !filledPhrase?.includes("markę")) {
      questions.push("kokia automobilio markė");
    }
    if (missing.includes("model") && !filledPhrase?.includes("modelį")) {
      questions.push("koks modelis");
    }

    if (filledPhrase && questions.length) {
      const q =
        questions[0]!.charAt(0).toUpperCase() +
        questions[0]!.slice(1) +
        (questions.length > 1 ? ` ir ${questions.slice(1).join(" ir ")}` : "");
      return `AI užpildė ${filledPhrase}. ${q}?`;
    }
  }

  return null;
}

export function buildPartialListingVoicePromptFromDraft(
  draft: AiExtractedListing
): string | null {
  return buildPartialListingVoicePrompt({
    category: draft.category,
    attributes: draft.attributes,
    price: draft.price,
  });
}

export function buildVoiceListingExtraContext(params: {
  mergedTranscript: string;
  analysis: VoiceIntentAnalysis;
  history?: VoiceIntentTurn[];
}): string {
  const lines: string[] = [
    "Užduotis: sugeneruok pilną profesionalų skelbimo aprašymą lietuviškai (4–8 sakiniai), pirkėjus traukiantį toną.",
    `Santrauka: ${params.analysis.understoodSummary}`,
    `Pilnas vartotojo kontekstas: ${params.mergedTranscript}`,
  ];

  if (params.analysis.category) {
    lines.push(`Kategorija: ${params.analysis.category}`);
  }

  if (params.history?.length) {
    const dialog = params.history
      .map((t) => `${t.role === "user" ? "Vartotojas" : "Asistentas"}: ${t.text}`)
      .join("\n");
    lines.push(`Pokalbio istorija:\n${dialog}`);
  }

  return lines.join("\n\n");
}
