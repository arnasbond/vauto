/**
 * JWT handoff from anonser.lt (WordPress) → vauto.anonser.lt.
 * WordPress can redirect with ?vauto_token=... or postMessage from an iframe/embed.
 */

const TOKEN_PARAM = "vauto_token";
const HANDOFF_MESSAGE_TYPE = "vauto_token_handoff";

export function isAllowedAnonserOrigin(origin: string): boolean {
  try {
    const { hostname } = new URL(origin);
    return hostname === "anonser.lt" || hostname.endsWith(".anonser.lt");
  } catch {
    return false;
  }
}

/** Read token from URL query, strip param from address bar. */
export function consumeTokenFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const token = params.get(TOKEN_PARAM)?.trim();
  if (!token) return null;

  params.delete(TOKEN_PARAM);
  const qs = params.toString();
  const next =
    window.location.pathname +
    (qs ? `?${qs}` : "") +
    (window.location.hash || "");
  window.history.replaceState({}, "", next);
  return token;
}

export function installTokenHandoffListener(
  onToken: (token: string) => void
): () => void {
  if (typeof window === "undefined") return () => {};

  const handler = (event: MessageEvent) => {
    if (!isAllowedAnonserOrigin(event.origin)) return;
    const data = event.data as { type?: string; token?: string } | null;
    if (data?.type !== HANDOFF_MESSAGE_TYPE) return;
    const token = data.token?.trim();
    if (token) onToken(token);
  };

  window.addEventListener("message", handler);
  return () => window.removeEventListener("message", handler);
}

/** Boot-time handoff: URL param first, then listen for parent postMessage. */
export function bootstrapTokenHandoff(
  onToken: (token: string) => void
): () => void {
  const urlToken = consumeTokenFromUrl();
  if (urlToken) onToken(urlToken);
  return installTokenHandoffListener(onToken);
}
