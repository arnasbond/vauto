import type { AiExtractedListing } from "@/lib/types";
import { AI_TIMEOUT_POLICY } from "@/lib/ai-timeout-policy";

export const VISION_CONVERSATIONAL_RECOVERY_PROMPT =
  "Nepavyko akimirksniu nustatyti objekto iš nuotraukos. Padėkite man! Brūkštelkite keliais žodžiais, ką norite parduoti arba rasti?";

export const RECOVERY_PROCESSING_TIMEOUT_MS = AI_TIMEOUT_POLICY.recoveryMs;

export const WIZARD_AGENT_EXPAND_EVENT = "vauto-wizard-agent-expand";

export function requestWizardAgentExpand(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(WIZARD_AGENT_EXPAND_EVENT));
}

/**
 * Weak-vision divert — DISABLED.
 * Domain autonomy: always continue with Gemini draft; never short-circuit to recovery form.
 */
export function isWeakVisionExtraction(_data?: AiExtractedListing): boolean {
  void _data;
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
