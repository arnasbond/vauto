/**
 * E2.2 — PlannerContextBuilder.
 *
 * Builds the planner input from the CANONICAL E1 ThreadStore history plus
 * structured state — never a blind `.slice(-8)`:
 *  - bounded recent window (user+assistant turns);
 *  - compact deterministic memory of OLDER turns (bounded, advisory);
 *  - canonical significant facts (deterministic extractors + draft state —
 *    the fact authority for context; conflicts prefer canonical structured
 *    values, never a stale recent utterance);
 *  - current goal + unresolved/pending action signals.
 *
 * The compact memory is ADVISORY ONLY: it never participates in
 * security/authority decisions (finances, ownership, VIN, trusted values)
 * — those always come from canonical structured state + the action layer.
 */
import { extractConditionFromText } from "../../shared/fact-conflict.js";
import { extractLtCityNominativeFromText } from "../lithuanian-location-normalize.js";
import { parsePriceFromChatInput } from "../listing-chat-input.js";
import type { PlannerContextInput } from "./planner-types.js";

export interface PlannerContextBuilderInput {
  /** FULL canonical thread history (server-authoritative). */
  messages: Array<{ role: "user" | "assistant"; text: string }>;
  lastUserText: string;
  hasDraft: boolean;
  draftTitle?: string;
  draftCategory?: string;
  draftPrice?: number;
  draftLocation?: string;
  flowState?: string;
  isAuthenticated: boolean;
  hasSearchSession: boolean;
  modelAvailable: boolean;
  /** Canonical draft attributes (trusted structured state). */
  draftAttributes?: Record<string, string>;
  /** Unresolved pending action markers (confirmation / VIN review). */
  pendingAction?: string;
  /** Current intent marker from canonical state, if known. */
  currentIntent?: string;
  /** E2.6 — canonical seller listings (consequential-target resolution). */
  myListings?: Array<{ id: string; title: string; status: string }>;
  /** E2.6 — currently open listing id. */
  activeListingId?: string;
}

const RECENT_WINDOW = 10;
const MEMORY_MAX_ITEMS = 14;
const MEMORY_ITEM_MAX_CHARS = 160;
const FACTS_MAX = 10;
const SALIENT_MAX_CHARS = 2200;
const SALIENT_LINE_MAX_CHARS = 160;

/** E2.3 — durable preference/goal markers (beyond price/city/condition). */
const PREFERENCE_MARKER_RE =
  /\b(noriu|norėčiau|noreciau|svarbu|pageidauju|b[ūu]tinai|pageidautina|tinka|prefer|tik\s+(?![a-z]*\b(su|prie))\b)/i;

/** E2.3 — assistant agreement markers for salient memory. */
const AGREEMENT_MARKER_RE =
  /\b(sutarta|susitar[ėe]m|patvirtinu|atnaujinau|nusta[čc]iau|užfiksuota|uzfiksuota)\b/i;

interface SignificantFact {
  key: string;
  value: string;
  source: "draft" | "user_fact";
}

/** Deterministic fact extraction from older user turns (canonical text).
 *  E2.3 — the city source is the broad Lithuanian location normalizer
 *  (locatives like „Kaune“ resolve to the canonical nominative). */
function factsFromText(text: string): Array<{ key: string; value: string }> {
  const out: Array<{ key: string; value: string }> = [];
  const price = parsePriceFromChatInput(text);
  if (price != null) out.push({ key: "price", value: String(price) });
  const condition = extractConditionFromText(text);
  if (condition) out.push({ key: "condition", value: condition });
  const city = extractLtCityNominativeFromText(text);
  if (city) out.push({ key: "city", value: city });
  return out;
}

/** Canonical structured facts from the trusted draft (authority for context). */
function factsFromDraft(
  input: PlannerContextBuilderInput
): SignificantFact[] {
  const out: SignificantFact[] = [];
  if (input.draftTitle) out.push({ key: "title", value: input.draftTitle, source: "draft" });
  if (input.draftCategory) out.push({ key: "category", value: input.draftCategory, source: "draft" });
  if (input.draftPrice != null && Number(input.draftPrice) > 0) {
    out.push({ key: "price", value: String(input.draftPrice), source: "draft" });
  }
  if (input.draftLocation) out.push({ key: "location", value: input.draftLocation, source: "draft" });
  for (const key of ["condition", "year", "make", "model", "rooms", "workType"]) {
    const v = input.draftAttributes?.[key];
    if (v) out.push({ key, value: String(v), source: "draft" });
  }
  return out;
}

function buildCompactMemory(
  olderTurns: Array<{ role: "user" | "assistant"; text: string }>
): string {
  if (!olderTurns.length) return "";
  const lines = olderTurns
    .slice(-MEMORY_MAX_ITEMS)
    .map((m) => {
      const text = m.text.replace(/\s+/g, " ").trim();
      const clipped =
        text.length > MEMORY_ITEM_MAX_CHARS
          ? `${text.slice(0, MEMORY_ITEM_MAX_CHARS)}…`
          : text;
      return `${m.role === "user" ? "vartotojas" : "asistentas"}: ${clipped}`;
    });
  return `(senesni turnai, ${olderTurns.length} žinučių)\n${lines.join("\n")}`;
}

function clipLine(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > SALIENT_LINE_MAX_CHARS
    ? `${t.slice(0, SALIENT_LINE_MAX_CHARS)}…`
    : t;
}

/**
 * E2.3 — DURABLE salient memory derived deterministically from the FULL
 * canonical thread (stateless, server-authoritative by construction):
 *  - long-term goals (latest sell goal + latest search goal);
 *  - important preferences/facts the field extractors do not capture
 *    (LAST utterance wins per topic);
 *  - assistant agreements (latest confirmed decisions).
 * Bounded to SALIENT_MAX_CHARS. ADVISORY ONLY — the canonical structured
 * state (draft) always wins over anything written here.
 */
function buildSalientMemory(
  all: Array<{ role: "user" | "assistant"; text: string }>,
  lastUserText: string
): string {
  let sellGoal = "";
  let searchGoal = "";
  const preferences: string[] = [];
  const agreements: string[] = [];

  for (const m of all) {
    const text = clipLine(m.text);
    if (!text) continue;
    if (m.role === "user") {
      const lower = text.toLowerCase();
      if (/parduodu|parduosi|parduoti|p[аa]rdavin[ėe]ju/i.test(lower) && text !== lastUserText) {
        sellGoal = text;
      }
      if (/\b(ieškau|ieskau|ieškok|ieskok|surask|paieškok|paieskok)\b/i.test(lower) && text !== lastUserText) {
        searchGoal = text;
      }
      if (PREFERENCE_MARKER_RE.test(lower) && text !== lastUserText) {
        preferences.push(text);
      }
    } else if (AGREEMENT_MARKER_RE.test(text.toLowerCase())) {
      agreements.push(text);
    }
  }

  const lines: string[] = [];
  if (sellGoal) lines.push(`Pardavimo tikslas: ${sellGoal}`);
  if (searchGoal) lines.push(`Paieškos tikslas: ${searchGoal}`);
  const prefs = preferences.slice(-6);
  if (prefs.length) {
    lines.push("Vartotojo preferencijos (naujausia laimi):");
    for (const p of prefs) lines.push(`- ${p}`);
  }
  const agrs = agreements.slice(-4);
  if (agrs.length) {
    lines.push("Asistento susitarimai:");
    for (const a of agrs) lines.push(`- ${a}`);
  }
  const joined = lines.join("\n");
  return joined.length > SALIENT_MAX_CHARS
    ? `${joined.slice(0, SALIENT_MAX_CHARS)}…`
    : joined;
}

/**
 * E2.2 — build the full planner context from the canonical thread.
 */
export function buildPlannerContext(
  input: PlannerContextBuilderInput
): PlannerContextInput {
  const all = input.messages.map((m) => ({
    role: m.role,
    text: String(m.text ?? ""),
  }));
  const userTurns = all.filter((m) => m.role === "user");
  const lastUserIndex = userTurns.length - 1;

  // Bounded recent window — always includes the CURRENT user turn.
  const recentWindow = all.slice(-RECENT_WINDOW);
  // Older turns become compact memory (bounded, advisory).
  const olderTurns = all.slice(0, Math.max(0, all.length - RECENT_WINDOW));

  // Significant facts: canonical draft facts WIN over older user-text facts.
  // E2.3 — non-draft user facts are LAST-WINS (a later clear correction
  // overrides an earlier advisory fact); the draft location suppresses the
  // advisory city so canonical structured state always wins that slot.
  const draftFacts = factsFromDraft(input);
  const draftKeys = new Set(draftFacts.map((f) => f.key));
  if (input.draftLocation) draftKeys.add("city");
  const userFacts = new Map<string, { key: string; value: string }>();
  for (const m of all) {
    if (m.role !== "user") continue;
    // E2.3 — the CURRENT turn participates too: a later clear correction
    // (even this turn) overrides an earlier advisory fact. Canonical draft
    // keys stay suppressed regardless.
    for (const fact of factsFromText(m.text)) {
      if (!draftKeys.has(fact.key)) {
        userFacts.set(fact.key, { key: fact.key, value: fact.value });
      }
    }
  }
  const olderFacts = [...userFacts.values()];
  const significantFacts = [...draftFacts, ...olderFacts].slice(0, FACTS_MAX);
  const factsMap: Record<string, string> = {};
  for (const f of significantFacts) factsMap[f.key] = f.value;

  const pendingAction =
    input.pendingAction ??
    (input.flowState === "AWAITING_CONFIRMATION"
      ? "AWAITING_CONFIRMATION — laukia skelbimo patvirtinimo"
      : "");

  return {
    messages: recentWindow,
    lastUserText: input.lastUserText,
    hasDraft: input.hasDraft,
    draftTitle: input.draftTitle,
    draftCategory: input.draftCategory,
    draftPrice: input.draftPrice,
    draftLocation: input.draftLocation,
    flowState: input.flowState,
    isAuthenticated: input.isAuthenticated,
    hasSearchSession: input.hasSearchSession,
    modelAvailable: input.modelAvailable,
    compactMemory: buildCompactMemory(olderTurns),
    salientMemory: buildSalientMemory(all, input.lastUserText),
    significantFacts: factsMap,
    currentGoal: input.currentIntent?.trim() || "",
    pendingAction,
    myListings: input.myListings,
    activeListingId: input.activeListingId,
  };
}
