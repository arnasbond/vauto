/**
 * Supervisor Gemini tool loop — forced function calling + single clean reply.
 */

import {
  AGENT_FUNCTION_DECLARATIONS,
  executeAgentTool,
  type AgentSideEffect,
  type AgentToolContext,
} from "./agent-tools.js";
import { resolveGeminiApiKey } from "../load-env.js";
import {
  AgentRouteError,
  fetchWithTimeout,
  isAbortError,
} from "./agent-errors.js";
import { GEMINI_AGENT_TIMEOUT_MS } from "../lib/ai-timeout-policy.js";
import { resolveBrowseAllIntent } from "../lib/browse-all-intent.js";
import { detectServerSellIntent } from "./sell-intent-fallback.js";
import { isConversationalSearchIntent } from "./search-agent.js";
import { buildBrowseAllReply } from "../lib/browse-all-intent.js";
import { buildNoMatchLeadPrompt } from "../offer-engine.js";
import { inferSearchCategory, normalizeProductSearchQuery } from "./product-search-query.js";

export type GeminiPart =
  | { text: string }
  | { functionCall: { name: string; args: Record<string, unknown> } }
  | { functionResponse: { name: string; response: unknown } };

export interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

export type GeminiToolMode = "AUTO" | "ANY" | "NONE";

const PRODUCT_SEARCH_RE =
  /\b(volvo|bmw|audi|mercedes|toyota|vw|ford|opel|iphone|samsung|xiaomi|huawei|butas|namas|batai|kedai|sukn|drabuz|telefon|kompiuter|nešioj|nesioj|dvirat|motocikl|automob|laptop|v70|v60|xc\d|passat|golf)\b/i;

const SEARCH_VERB_RE =
  /\b(ieškau|ieskau|rask|surask|parodyk|rodyk|noriu|reikia|find|search|show)\b/i;

const SUPERVISOR_UI_TOOL_NAMES = new Set([
  "applyFilter",
  "clearAllFilters",
  "navigateTo",
  "updateUIFilters",
  "navigateToScreen",
  "searchListings",
]);

export function shouldForceSupervisorTools(text: string): boolean {
  const q = text.trim();
  if (q.length < 3) return false;
  if (resolveBrowseAllIntent(q)) return false;
  if (detectServerSellIntent(q)) return false;
  if (isConversationalSearchIntent(q)) return false;
  return PRODUCT_SEARCH_RE.test(q) || SEARCH_VERB_RE.test(q);
}

export function extractGeminiFunctionCalls(
  parts: GeminiPart[]
): Array<{ functionCall: { name: string; args: Record<string, unknown> } }> {
  const out: Array<{ functionCall: { name: string; args: Record<string, unknown> } }> = [];
  for (const part of parts) {
    if ("functionCall" in part && part.functionCall?.name) {
      out.push({
        functionCall: {
          name: part.functionCall.name,
          args: (part.functionCall.args ?? {}) as Record<string, unknown>,
        },
      });
      continue;
    }
    const legacy = part as {
      functionCall?: { name?: string; args?: Record<string, unknown> };
    };
    if (legacy.functionCall?.name) {
      out.push({
        functionCall: {
          name: legacy.functionCall.name,
          args: legacy.functionCall.args ?? {},
        },
      });
    }
  }
  return out;
}

export function sideEffectPriority(type: AgentSideEffect["type"]): number {
  switch (type) {
    case "browse_all":
      return 95;
    case "listing_draft":
    case "wardrobe_bulk":
    case "mark_listing_sold":
      return 90;
    case "search":
    case "apply_ui_filters":
    case "navigate_to_screen":
      return 70;
    case "empty_search":
      return 10;
    default:
      return 40;
  }
}

export function shouldReplaceSideEffect(
  current: AgentSideEffect | undefined,
  next: AgentSideEffect
): boolean {
  if (!current) return true;
  return sideEffectPriority(next.type) > sideEffectPriority(current.type);
}

export function isGenericEmptySearchReply(text: string): boolean {
  const t = text.trim().toLowerCase();
  return (
    !t ||
    t === "rezultatų nerasta." ||
    t === "rezultatų nerasta" ||
    t === "nerasta atitinkančių skelbimų." ||
    t.startsWith("nerasta ") ||
    t.startsWith("deja,") ||
    t.includes("nieko neradau") ||
    t.includes("nieko tinkamo neradau")
  );
}

export async function geminiSupervisorTurn(
  contents: GeminiContent[],
  model: string,
  systemInstruction: string,
  toolMode: GeminiToolMode = "AUTO"
): Promise<{ parts: GeminiPart[]; text: string }> {
  const key = resolveGeminiApiKey();
  if (!key) {
    throw new AgentRouteError(
      "agent_unavailable",
      "GEMINI_API_KEY not configured on server",
      503
    );
  }

  const body: Record<string, unknown> = {
    systemInstruction: { parts: [{ text: systemInstruction }] },
    contents,
    generationConfig: { temperature: toolMode === "NONE" ? 0.55 : 0.6 },
  };

  if (toolMode !== "NONE") {
    body.tools = [{ functionDeclarations: AGENT_FUNCTION_DECLARATIONS }];
    body.toolConfig = { functionCallingConfig: { mode: toolMode } };
  }

  try {
    const res = await fetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": key,
        },
        body: JSON.stringify(body),
      },
      GEMINI_AGENT_TIMEOUT_MS
    );

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new AgentRouteError(
        "gemini_error",
        `Gemini ${model} returned ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`,
        res.status >= 500 ? 502 : 503,
        res.status
      );
    }

    const data = (await res.json()) as {
      candidates?: { content?: { parts?: GeminiPart[] } }[];
    };
    const parts = data.candidates?.[0]?.content?.parts ?? [];
    const text = parts
      .filter((p): p is { text: string } => "text" in p && Boolean(p.text))
      .map((p) => p.text)
      .join("\n")
      .trim();

    return { parts, text };
  } catch (e) {
    if (e instanceof AgentRouteError) throw e;
    if (isAbortError(e)) {
      throw new AgentRouteError(
        "timeout",
        "Gemini API užklausa užtruko. Sumažinkite admin kontekstą arba bandykite vėliau.",
        504
      );
    }
    throw new AgentRouteError(
      "gemini_error",
      e instanceof Error ? e.message : "Gemini API klaida",
      502
    );
  }
}

export async function runDeterministicSupervisorSearch(
  rawQuery: string,
  ctx: AgentToolContext
): Promise<{ result: unknown; sideEffect?: AgentSideEffect; toolName: string }> {
  const query = normalizeProductSearchQuery(rawQuery);
  const category = inferSearchCategory(query);
  const label = `Atfiltravau „${query}" — žiūrėk rezultatus ekrane.`;

  const { result, sideEffect } = await executeAgentTool(
    "searchListings",
    {
      query,
      ...(category ? { category } : {}),
    },
    ctx
  );

  return { toolName: "searchListings", result, sideEffect };
}

function toolResultLabel(result: unknown): string | undefined {
  if (!result || typeof result !== "object") return undefined;
  const r = result as Record<string, unknown>;
  const label = String(r.label ?? r.message ?? r.summary ?? "").trim();
  return label || undefined;
}

export interface SupervisorReplyInput {
  draftText: string;
  toolCalls: { name: string; result: unknown }[];
  sideEffect?: AgentSideEffect;
  uiFilterEffect?: AgentSideEffect;
  browseAllSideEffect?: AgentSideEffect;
  searchToolCount: number;
  lastUserQuery: string;
}

/** One high-end broker reply — no stacked fallbacks. */
export function resolveSupervisorFinalReply(input: SupervisorReplyInput): string {
  const supervisorTools = input.toolCalls.filter((t) =>
    SUPERVISOR_UI_TOOL_NAMES.has(t.name)
  );

  for (const call of [...supervisorTools].reverse()) {
    const label = toolResultLabel(call.result);
    if (label && !isGenericEmptySearchReply(label)) return label;
  }

  if (input.uiFilterEffect?.type === "apply_ui_filters" && input.uiFilterEffect.label) {
    return input.uiFilterEffect.label;
  }

  if (input.browseAllSideEffect?.type === "browse_all") {
    return (
      input.browseAllSideEffect.replyMessage?.trim() ||
      buildBrowseAllReply(input.browseAllSideEffect.listingCount)
    );
  }

  const draft = input.draftText.trim();
  if (draft && !isGenericEmptySearchReply(draft)) return draft;

  if (input.sideEffect?.type === "search" && input.searchToolCount > 0) {
    const q =
      input.sideEffect.searchQuery?.trim() ||
      normalizeProductSearchQuery(input.lastUserQuery);
    return `Radau ${input.searchToolCount} variantų pagal „${q}" — peržiūrėk ekrane.`;
  }

  if (input.sideEffect?.type === "apply_ui_filters" && input.sideEffect.label) {
    return input.sideEffect.label;
  }

  if (input.sideEffect?.type === "empty_search") {
    const q =
      input.sideEffect.searchQuery?.trim() ||
      normalizeProductSearchQuery(input.lastUserQuery);
    return buildNoMatchLeadPrompt(q);
  }

  if (input.searchToolCount > 0) {
    return "Radau variantus — pasižiūrėkim ekrane!";
  }

  return draft || "Supratau. Kuo dar galiu padėti?";
}
