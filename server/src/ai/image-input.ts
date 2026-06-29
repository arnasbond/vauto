/**
 * Normalize image payloads for Gemini Vision — data URLs, raw base64, or HTTPS URLs.
 * Prevents 500s when clients send base64 without a data: prefix.
 */

const BASE64_RE = /^[A-Za-z0-9+/]+=*$/;

export function normalizeImageDataUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("data:")) {
    const match = /^data:([^;]+);base64,(.+)$/is.exec(trimmed);
    if (!match) return null;
    const data = match[2]!.replace(/\s/g, "");
    if (data.length < 16) return null;
    return `data:${match[1]!.trim()};base64,${data}`;
  }

  const cleaned = trimmed.replace(/\s/g, "");
  if (BASE64_RE.test(cleaned) && cleaned.length >= 16) {
    return `data:image/jpeg;base64,${cleaned}`;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  return null;
}

/** Normalize and dedupe image inputs; drops invalid entries. */
export function normalizeImageInputList(inputs: string[]): string[] {
  const out: string[] = [];
  for (const raw of inputs) {
    const normalized = normalizeImageDataUrl(raw);
    if (normalized && !out.includes(normalized)) {
      out.push(normalized);
    }
  }
  return out;
}
