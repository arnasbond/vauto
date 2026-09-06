/**
 * E1.4 — stable unique turn ids for agent requests.
 *
 * One turnId per USER MESSAGE. The same turnId is re-sent on every automatic
 * retry of the same request (network timeout / SSE reconnect); a NEW user
 * message always mints a NEW turnId. The server uses it as the exactly-once
 * key — production idempotency never depends on message-count/hash
 * derivation.
 */

export function mintAgentTurnId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return `turn_${crypto.randomUUID()}`;
    }
  } catch {
    /* fall through */
  }
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return `turn_${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}
