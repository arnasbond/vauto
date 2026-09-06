/**
 * E2.8 — deterministic USER-DATA extraction cleanup.
 *
 * The client may wrap the real user content in synthetic transport/context
 * prefixes, e.g. a proactive-offer trigger (note: the wrapper's closing
 * bracket encloses the ACTUAL user content):
 *
 *   [Proaktyvi intervencija: match — pranešk, kai atsiras kia sportage …]
 *   [Nuotraukos įkeltos]
 *   [Dokumentas įkeltas: …]
 *
 * These wrappers are orchestration metadata: they may legitimately inform
 * the model/planner, but they must NEVER leak into deterministic user-data
 * extraction or persistence provenance (wanted requirement query, price,
 * category, labels).
 *
 * NOTE: this helper is for DETERMINISTIC EXTRACTION ONLY. It does not
 * rewrite the message sent to the model/planner.
 */

/** `[Proaktyvi intervencija: <kind> — <actual user content>]` (content wrapped). */
const PROACTIVE_WRAPPED_RE =
  /^\[Proaktyvi intervencija:\s*[^\]]*?—\s*([\s\S]*)\]$/iu;
/** `[Proaktyvi intervencija: <kind> — <actual user content>` (no closing bracket). */
const PROACTIVE_PREFIX_RE = /^\[Proaktyvi intervencija:\s*[^\]]*?—\s*/iu;
/** Known complete bracketed attachment prefixes. */
const ATTACHMENT_PREFIX_RE =
  /^\[(?:Nuotraukos įkeltos|Dokumentas įkeltas:[^\]]*)\]\s*/iu;

export function stripClientTransportWrappers(text: string): string {
  let out = String(text ?? "").trim();
  let prev = "";
  while (prev !== out) {
    prev = out;
    const wrapped = PROACTIVE_WRAPPED_RE.exec(out);
    if (wrapped) {
      out = wrapped[1]!.trim();
      continue;
    }
    const prefix = PROACTIVE_PREFIX_RE.exec(out);
    if (prefix) {
      out = out.slice(prefix[0].length).trim();
      continue;
    }
    out = out.replace(ATTACHMENT_PREFIX_RE, "").trim();
  }
  return out;
}
