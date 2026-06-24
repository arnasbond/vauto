export const ADMIN_PROJECT_CONTEXT_STORAGE_KEY =
  "vauto_admin_gemini_project_context_v1";

export const MAX_ADMIN_PROJECT_CONTEXT_CHARS = 80_000;

export function loadAdminProjectContextFromStorage(): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(ADMIN_PROJECT_CONTEXT_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveAdminProjectContextToStorage(text: string): string {
  const capped = text.slice(0, MAX_ADMIN_PROJECT_CONTEXT_CHARS);
  if (typeof window === "undefined") return capped;
  try {
    localStorage.setItem(ADMIN_PROJECT_CONTEXT_STORAGE_KEY, capped);
  } catch {
    /* ignore quota */
  }
  return capped;
}
