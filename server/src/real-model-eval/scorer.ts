/**
 * REAL-MODEL EVALUATION SCORER — deterministic, transparent measurement.
 *
 * Maps captured production outcomes (planner decision, tool calls, draft
 * state, reply) against each case's conservative reference into six 0–2 axes,
 * critical flags, and a single primary failure classification per failing
 * turn. This scorer is measurement only — it never trains or gates production.
 */
import type { EvalCase, EvalTurn, EvalTurnReference } from "./dataset.js";
import type { EvalTurnOutcome } from "./harness.js";

export type AxisKey =
  | "semantic"
  | "continuity"
  | "structured"
  | "factual"
  | "correction"
  | "naturalness";

export type CriticalFlag =
  | "WRONG_VERTICAL"
  | "CONTEXT_RESET"
  | "INVENTED_FACT"
  | "LOST_USER_CORRECTION"
  | "TRANSPORT_BIAS"
  | "UNNECESSARY_CLARIFICATION"
  | "COMMAND_PARSER_BEHAVIOR"
  | "SILENT_CONSEQUENTIAL_ACTION"
  | "TAXONOMY_GAP";

export type FailureClass =
  | "MODEL SEMANTIC FAILURE"
  | "EXTRACTION / ORCHESTRATION FAILURE"
  | "STATE / CONTEXT FAILURE"
  | "AUTHORITY / PROVENANCE FAILURE"
  | "TAXONOMY / DOMAIN MODEL GAP"
  | "SEARCH / DATA LIMITATION"
  | "UX / NATURALNESS ISSUE"
  | "EVAL HARNESS ARTIFACT";

export interface TurnScore {
  index: number;
  text: string;
  scores: Record<AxisKey, number>;
  total: number;
  flags: CriticalFlag[];
  failureClass: FailureClass | null;
  reply: string;
  intent: string | null;
  toolCalls: string[];
  draftAfter: Record<string, unknown> | null;
}

export interface CaseScore {
  caseId: string;
  title: string;
  group: string;
  vertical?: string;
  turns: TurnScore[];
  maxTotal: number;
  total: number;
  flags: CriticalFlag[];
  failureClasses: FailureClass[];
  modelsUsed: string[];
}

function resolvedDraftVertical(draft: Record<string, unknown> | null): string {
  if (!draft) return "";
  return String(draft.category ?? "").toLowerCase();
}

function matchesReply(reply: string, fragments: string[] | undefined): boolean {
  const lower = reply.toLowerCase();
  return (fragments ?? []).every((f) => lower.includes(f.toLowerCase()));
}

function containsAny(reply: string, fragments: string[] | undefined): boolean {
  const lower = reply.toLowerCase();
  return (fragments ?? []).some((f) => lower.includes(f.toLowerCase()));
}

function isCannedReply(reply: string): boolean {
  const t = reply.trim();
  if (!t) return true;
  // AI-down / degenerate fallbacks are never "natural".
  if (/^esu čia padėti|negaliu|negalima atlikti|atsiprašau/i.test(t) && t.length < 120) {
    return true;
  }
  return false;
}

function draftFactValue(
  draft: Record<string, unknown> | null,
  key: string
): string {
  if (!draft) return "";
  if (key === "price") return String(draft.price ?? "");
  if (key === "title") return String(draft.title ?? "");
  if (key === "location") return String(draft.location ?? "");
  return String(((draft.attributes ?? {}) as Record<string, unknown>)[key] ?? "");
}

/** Score a single turn against its reference. */
export function scoreTurn(
  turn: EvalTurn,
  outcome: EvalTurnOutcome,
  priorDraft: Record<string, unknown> | null,
  caseVertical: string | undefined
): TurnScore {
  const ref: EvalTurnReference = turn.reference ?? {};
  const flags = new Set<CriticalFlag>();
  const reply = outcome.reply;

  // ── Semantic understanding ───────────────────────────────────────────────
  let semantic = 2;
  if (outcome.error) semantic = 0;
  else if (ref.intent && outcome.intent !== ref.intent) {
    semantic = 0;
    if (ref.intent === "catalog_search" && outcome.intent === "sell_create") {
      flags.add("COMMAND_PARSER_BEHAVIOR");
    }
  } else if (ref.intent && outcome.intent === ref.intent && !ref.replyMustMention?.length) {
    semantic = 2;
  } else if (!ref.intent && outcome.intent) {
    semantic = 1;
  }
  if (ref.replyMustMention?.length && !matchesReply(reply, ref.replyMustMention)) {
    semantic = Math.max(0, semantic - 1);
  }

  // ── Structured correctness + wrong-vertical ──────────────────────────────
  let structured = 2;
  if (ref.vertical) {
    const dv = resolvedDraftVertical(outcome.draftAfter);
    if (dv && dv !== ref.vertical) {
      structured = 0;
      flags.add("WRONG_VERTICAL");
      if (ref.vertical !== "vehicles" && dv === "vehicles") {
        flags.add("TRANSPORT_BIAS");
      }
    } else if (!dv) {
      structured = 1;
    }
  }
  if (ref.draftFact) {
    const actual = draftFactValue(outcome.draftAfter, ref.draftFact.key);
    if (ref.draftFact.value !== "" && actual !== ref.draftFact.value) {
      if (structured > 0) structured -= 1;
    }
  }
  if (ref.expectedTool !== undefined) {
    const has = outcome.toolCalls.includes(ref.expectedTool ?? "");
    if (ref.expectedTool && !has) {
      structured = Math.max(0, structured - 1);
    }
    if (!ref.expectedTool && outcome.toolCalls.length > 0) {
      flags.add("UNNECESSARY_CLARIFICATION");
    }
  }
  if (outcome.needsClarification && ref.intent && ref.intent !== "clarify_ambiguous") {
    flags.add("UNNECESSARY_CLARIFICATION");
    semantic = Math.max(0, semantic - 1);
  }

  // ── Factual discipline ───────────────────────────────────────────────────
  let factual = 2;
  if (ref.draftFact) {
    const actual = draftFactValue(outcome.draftAfter, ref.draftFact.key);
    if (ref.draftFact.value !== "" && actual !== "" && actual !== ref.draftFact.value) {
      factual = 1;
      flags.add("INVENTED_FACT");
    }
  }

  // ── Context continuity ───────────────────────────────────────────────────
  let continuity = 2;
  if (priorDraft && !outcome.draftAfter && outcome.index > 1) {
    continuity = 0;
    flags.add("CONTEXT_RESET");
  } else if (priorDraft && outcome.draftAfter) {
    const priorTitle = String(priorDraft.title ?? "");
    const afterTitle = String(outcome.draftAfter.title ?? "");
    if (priorTitle && afterTitle && priorTitle !== afterTitle && outcome.index > 1) {
      // Title changed unexpectedly — possible context reset (soft).
      continuity = 1;
    }
  }
  if (outcome.error) continuity = 0;

  // ── Human correction authority ───────────────────────────────────────────
  let correction = 2;
  if (ref.draftFact && ref.draftFact.key && ref.draftFact.value !== "") {
    const actual = draftFactValue(outcome.draftAfter, ref.draftFact.key);
    if (actual !== ref.draftFact.value) {
      correction = 0;
      flags.add("LOST_USER_CORRECTION");
    }
  }

  // ── Natural conversational quality ───────────────────────────────────────
  let naturalness = 2;
  const minChars = ref.minReplyChars ?? 40;
  if (reply.length < minChars) {
    naturalness = 0;
    flags.add("COMMAND_PARSER_BEHAVIOR");
  } else if (isCannedReply(reply)) {
    naturalness = 0;
    flags.add("COMMAND_PARSER_BEHAVIOR");
  } else if (reply.length < minChars * 2 && !ref.replyMustMention?.length) {
    naturalness = 1;
  }
  if (ref.replyMustNotMention?.length && containsAny(reply, ref.replyMustNotMention)) {
    naturalness = Math.max(0, naturalness - 1);
  }

  // ── Silent consequential action ──────────────────────────────────────────
  for (const e of ref.forbiddenEffects ?? []) {
    if (outcome.effects.includes(e)) {
      flags.add("SILENT_CONSEQUENTIAL_ACTION");
      correction = Math.max(0, correction - 1);
    }
  }
  for (const t of ref.forbiddenTools ?? []) {
    if (outcome.toolCalls.includes(t)) {
      flags.add("SILENT_CONSEQUENTIAL_ACTION");
      semantic = Math.max(0, semantic - 1);
    }
  }

  const total = semantic + continuity + structured + factual + correction + naturalness;

  const failureClass: FailureClass | null = classifyFailure(
    flags,
    outcome.error != null,
    ref
  );

  return {
    index: outcome.index,
    text: outcome.text,
    scores: { semantic, continuity, structured, factual, correction, naturalness },
    total,
    flags: Array.from(flags),
    failureClass,
    reply: reply.slice(0, 300),
    intent: outcome.intent,
    toolCalls: outcome.toolCalls,
    draftAfter: outcome.draftAfter,
  };
}

function classifyFailure(
  flags: Set<CriticalFlag>,
  hasError: boolean,
  ref: EvalTurnReference
): FailureClass | null {
  if (hasError) return "EVAL HARNESS ARTIFACT";
  if (flags.has("SILENT_CONSEQUENTIAL_ACTION") || flags.has("LOST_USER_CORRECTION")) {
    return "AUTHORITY / PROVENANCE FAILURE";
  }
  if (flags.has("CONTEXT_RESET")) return "STATE / CONTEXT FAILURE";
  if (flags.has("WRONG_VERTICAL")) {
    // A wrong vertical on a genuinely non-standard mapping is a domain gap;
    // otherwise it is a model semantic misread.
    return ref.vertical === "other" || ref.vertical === undefined
      ? "TAXONOMY / DOMAIN MODEL GAP"
      : "MODEL SEMANTIC FAILURE";
  }
  if (flags.has("TRANSPORT_BIAS")) return "MODEL SEMANTIC FAILURE";
  if (flags.has("INVENTED_FACT")) return "MODEL SEMANTIC FAILURE";
  if (flags.has("COMMAND_PARSER_BEHAVIOR")) return "UX / NATURALNESS ISSUE";
  if (flags.has("UNNECESSARY_CLARIFICATION")) return "UX / NATURALNESS ISSUE";
  return null;
}

export function scoreCase(
  c: EvalCase,
  turns: EvalTurnOutcome[],
  modelsUsed: string[]
): CaseScore {
  let priorDraft: Record<string, unknown> | null = null;
  const scored: TurnScore[] = [];
  for (let i = 0; i < c.turns.length; i++) {
    const s = scoreTurn(c.turns[i]!, turns[i]!, priorDraft, c.vertical);
    scored.push(s);
    priorDraft = turns[i]!.draftAfter ?? priorDraft;
  }
  const flags = Array.from(new Set(scored.flatMap((s) => s.flags)));
  const classes = scored
    .map((s) => s.failureClass)
    .filter((x): x is FailureClass => Boolean(x));
  return {
    caseId: c.id,
    title: c.title,
    group: c.group,
    vertical: c.vertical,
    turns: scored,
    maxTotal: c.turns.length * 12,
    total: scored.reduce((a, s) => a + s.total, 0),
    flags,
    failureClasses: Array.from(new Set(classes)),
    modelsUsed,
  };
}
