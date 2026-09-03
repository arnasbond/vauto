/**
 * F9 — structured quick-reply contract (bounded).
 *
 * Chips are no longer matched by visible Lithuanian text alone. A chip may
 * carry a machine-readable action: `{ id, label, action }`. Execution keys
 * off `action`/`id` — NEVER off `label`. Unknown or forged actions fail
 * closed (nothing executes). The legacy plain-string format is still
 * accepted through the existing text router as an explicitly bounded
 * compatibility path.
 *
 * Security invariants:
 *  - quick replies come from an UNTRUSTED model result, so every field is
 *    length-bounded and plain-string only;
 *  - `payload` is NOT part of this contract (no action reads it — any
 *    payload key sent by a model is discarded by the server wire layer);
 *  - malformed objects are dropped, never rendered as `[object Object]`;
 *  - no structured action may trigger a publish; publishing always requires
 *    the pre-publish card plus a separate human click;
 *  - the action registry below is the ONLY source of executable actions.
 */

export const QUICK_REPLY_ID_MAX = 64;
export const QUICK_REPLY_LABEL_MAX = 120;
export const QUICK_REPLY_ACTION_MAX = 64;

export interface AgentQuickReplyAction {
  id: string;
  label: string;
  action: string;
}

export type AgentQuickReplyOption = string | AgentQuickReplyAction;

const boundedString = (v: unknown, max: number): v is string =>
  typeof v === "string" && v.trim().length > 0 && v.length <= max;

export function isStructuredQuickReply(
  option: unknown
): option is AgentQuickReplyAction {
  if (option == null || typeof option !== "object" || Array.isArray(option)) {
    return false;
  }
  const o = option as Record<string, unknown>;
  return (
    boundedString(o.id, QUICK_REPLY_ID_MAX) &&
    boundedString(o.label, QUICK_REPLY_LABEL_MAX) &&
    boundedString(o.action, QUICK_REPLY_ACTION_MAX)
  );
}

/** Visible label — the ONLY part of a chip that ever reaches the UI. */
export function quickReplyLabel(option: AgentQuickReplyOption): string {
  if (typeof option === "string") return option.trim();
  if (isStructuredQuickReply(option)) return option.label;
  // Malformed object — never stringify to `[object Object]`.
  return "";
}

/** Unique render key — never trusts the label. */
export function quickReplyKey(option: AgentQuickReplyOption): string {
  return isStructuredQuickReply(option)
    ? `qr:${option.action}:${option.id}`
    : `qr:text:${typeof option === "string" ? option : ""}`;
}

/**
 * Known structured actions. Adding a handler here is the ONLY way a new
 * structured action can run. NO publish action may ever exist here.
 */
export const KNOWN_QUICK_REPLY_ACTIONS = ["missing_data_guide"] as const;
export type KnownQuickReplyAction = (typeof KNOWN_QUICK_REPLY_ACTIONS)[number];

export function isKnownQuickReplyAction(
  action: string
): action is KnownQuickReplyAction {
  return (KNOWN_QUICK_REPLY_ACTIONS as readonly string[]).includes(action);
}
