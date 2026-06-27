import type { CategoryAttributeFilters } from "@/lib/category-attribute-filters";
import type { AgentSearchFilters } from "@/lib/vauto-agent-client";

export type VoiceUiCommand =
  | { type: "apply_filter"; label: string; filters: AgentSearchFilters; categoryAttributes?: CategoryAttributeFilters }
  | { type: "add_favorite"; listingId?: string }
  | { type: "dismiss_listing"; mode: "next" | "close" }
  | { type: "none" };

const MECHANICAL = /\b(parodyk\s+)?(tik\s+)?(mechanin(e|ę|ės|es)|mechanine|mechaninė|mechanines)\b/i;
const AUTOMATIC = /\b(parodyk\s+)?(tik\s+)?(automat(in(e|ę|ės|es)|automatic)\b)/i;
const FAVORITE = /\b(įdėk|idek|issaugok|išsaugok|pridėk)\s+(šitą|ita|sitą|sita|šį|si)\s+(į\s+)?(simint|įsimint|favorit|megstam)/i;
const DISMISS = /\b(atmesk\s+(šitą|ita|sitą|sita)|sekantis|kitas\s+skelbimas|praleisk)\b/i;

/** Voice-Driven UI — greitas lokalių komandų parseris sąrašų naršymui. */
export function parseVoiceUiCommand(text: string): VoiceUiCommand {
  const t = text.trim();
  if (!t) return { type: "none" };

  if (FAVORITE.test(t)) {
    return { type: "add_favorite" };
  }

  if (DISMISS.test(t)) {
    return { type: "dismiss_listing", mode: /\b(sekantis|kitas|praleisk)\b/i.test(t) ? "next" : "close" };
  }

  if (MECHANICAL.test(t)) {
    return {
      type: "apply_filter",
      label: "Mechaninė pavarų dėžė",
      filters: { category: "vehicles" },
      categoryAttributes: { gearbox: "Mechaninė" },
    };
  }

  if (AUTOMATIC.test(t)) {
    return {
      type: "apply_filter",
      label: "Automatinė pavarų dėžė",
      filters: { category: "vehicles" },
      categoryAttributes: { gearbox: "Automatinė" },
    };
  }

  return { type: "none" };
}

export function voiceUiCommandReply(cmd: VoiceUiCommand): string | null {
  switch (cmd.type) {
    case "apply_filter":
      return `Gerai — filtruoju: ${cmd.label}.`;
    case "add_favorite":
      return "Įsiminau — pridėjau į mėgstamiausius.";
    case "dismiss_listing":
      return cmd.mode === "next" ? "Gerai, einame prie kito." : "Uždarau šią peržiūrą.";
    default:
      return null;
  }
}
