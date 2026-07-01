import type { AiExtractedListing } from "@/lib/types";
import { DEMO_AI_PLACEHOLDER_TITLES } from "@/lib/ai-safeguards";

export const VISION_CONVERSATIONAL_RECOVERY_PROMPT =
  "Nepavyko akimirksniu nustatyti objekto iš nuotraukos. Padėkite man! Brūkštelkite keliais žodžiais, ką norite parduoti arba rasti?";

export const RECOVERY_PROCESSING_TIMEOUT_MS = 42_000;

export const WIZARD_AGENT_EXPAND_EVENT = "vauto-wizard-agent-expand";

export function requestWizardAgentExpand(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(WIZARD_AGENT_EXPAND_EVENT));
}

/** Vision returned „Kita“ / placeholders — keep user in live conversation instead of dead-end form. */
export function isWeakVisionExtraction(data: AiExtractedListing): boolean {
  const confidence = data.confidence ?? 0;
  if (data.category === "other" && confidence < 0.58) return true;

  const titleKey = (data.title ?? "").trim().toLowerCase();
  if (DEMO_AI_PLACEHOLDER_TITLES.has(titleKey) && confidence < 0.65) return true;

  if (
    /nepavyko|neatpažin|neatpazin|nežinomas objekt|nezinomas objekt/i.test(
      `${data.title ?? ""} ${data.description ?? ""}`
    ) &&
    confidence < 0.6
  ) {
    return true;
  }

  return false;
}

export function shouldEnterConversationalRecovery(reason: string): boolean {
  return (
    reason === "timeout" ||
    reason === "invalid_extraction" ||
    reason === "invalid" ||
    reason === "empty" ||
    reason === "unclear_visual_service" ||
    reason === "weak_vision"
  );
}
