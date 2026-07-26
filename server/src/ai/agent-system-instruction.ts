import { buildSupervisorSystemInstruction } from "./supervisor-system-instruction.js";
import {
  GEMINI_INTENT_RULES,
  GEMINI_INTENT_RULES_COMPACT,
} from "./gemini-intent-rules.js";

export const MAX_ADMIN_PROJECT_CONTEXT_CHARS = 12_000;

export type AgentInstructionMode = "full" | "intermediate";

/**
 * Pagrindinė VAUTO agento sistemos instrukcija — System Supervisor lygis.
 * Intermediate turns (active draft, no new media) use a compact rule slice.
 */
export function buildVautoAgentSystemInstruction(
  mode: AgentInstructionMode = "full"
): string {
  const rules =
    mode === "intermediate" ? GEMINI_INTENT_RULES_COMPACT : GEMINI_INTENT_RULES;
  return `${buildSupervisorSystemInstruction()}\n\n${rules}`;
}

export function buildAgentSystemInstruction(
  baseInstruction: string,
  adminProjectContext?: string
): string {
  const trimmed = adminProjectContext?.trim();
  if (!trimmed) return baseInstruction;
  const capped = trimmed.slice(0, MAX_ADMIN_PROJECT_CONTEXT_CHARS);
  return `${baseInstruction}\n\nProjekto kontekstas (atsižvelk natūraliai, ne cituok mechaniškai): ${capped}`;
}
