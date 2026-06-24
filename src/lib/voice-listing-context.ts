import type { VoiceIntentAnalysis, VoiceIntentTurn } from "@/lib/voice-intent";

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
