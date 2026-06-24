export const MAX_ADMIN_PROJECT_CONTEXT_CHARS = 80_000;

export const ADMIN_PROJECT_CONTEXT_STORAGE_KEY =
  "vauto_admin_gemini_project_context_v1";

export function buildAgentSystemInstruction(
  baseInstruction: string,
  adminProjectContext?: string
): string {
  const trimmed = adminProjectContext?.trim();
  if (!trimmed) return baseInstruction;
  const capped = trimmed.slice(0, MAX_ADMIN_PROJECT_CONTEXT_CHARS);
  return `${baseInstruction}\n\nTu privalai atsižvelgti į šią istorinę projekto vystymo medžiagą: ${capped}`;
}
