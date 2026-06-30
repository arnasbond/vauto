/** Safe helpers for agent chat messages (S0 crash hardening). */

export function safeMessageText(text: unknown): string {
  if (typeof text === "string") return text;
  if (text == null) return "";
  try {
    return String(text);
  } catch {
    return "";
  }
}

export function safeMessageKey(role: string, index: number, text: unknown): string {
  const t = safeMessageText(text);
  return `${role}-${index}-${t.slice(0, 24) || "empty"}`;
}

/** Normalize draft.attributes from API / agent — never throw. */
export function safeDraftAttributes(
  raw: unknown
): Record<string, string | string[]> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!key || typeof key !== "string") continue;
    if (typeof value === "string") {
      out[key] = value;
    } else if (Array.isArray(value)) {
      out[key] = value.map((v) => String(v ?? "")).filter(Boolean);
    } else if (value != null) {
      out[key] = String(value);
    }
  }
  return out;
}
