import { buildSupervisorSystemInstruction } from "./supervisor-system-instruction.js";

export const MAX_ADMIN_PROJECT_CONTEXT_CHARS = 12_000;

/**
 * Pagrindinė VAUTO agento sistemos instrukcija — System Supervisor lygis.
 */
export function buildVautoAgentSystemInstruction(): string {
  return buildSupervisorSystemInstruction();
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
