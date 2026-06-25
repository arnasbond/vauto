import type { AgentSideEffect, AgentToolContext } from "./agent-tools.js";
import { executeAgentTool } from "./agent-tools.js";

const STATE_SEARCH_REPLY = "Atidarau skelbimus ekrane.";
const STATE_EMPTY_SEARCH_REPLY = "Rezultatų nerasta.";

export interface FastAgentSearchRequest {
  messages: { role: string; text: string }[];
}

export interface FastAgentSearchResponse {
  ok: true;
  reply: string;
  toolCalls: { name: string; result: unknown }[];
  actions: AgentSideEffect | { type: "none" };
}

const SEARCH_PREFIX =
  /^(?:ieškau|ieskau|i\s*eškau|i\s*eskau|rask|surask|parodyk(?:\s+visus)?|norėčiau|noreciau|ieškoti|ieskoti|find|search|show)\s+/i;

const SELLER_RE =
  /\b(parduod|įdėti\s+skelb|ideti\s+skelb|noriu\s+parduot|noriu\s+kelti\s+skelb|keliu\s+skelb)\b/i;

const SKIP_FAST =
  /\b(admin|moderuoti|blokiruoti|boost|apmokėti|apmoketi|iškel|iskel|business\s+pro|dashboard)\b/i;

const LT_CITY_PATTERNS: Array<[RegExp, string]> = [
  [/vilniuje|vilnius/i, "Vilnius"],
  [/kaune|kaunas/i, "Kaunas"],
  [/klaip[eė]doje|klaip[eė]da/i, "Klaipėda"],
  [/[šs]iauliuose|[šs]iauliai/i, "Šiauliai"],
  [/panev[eė][žz]yje|panev[eė][žz]ys/i, "Panevėžys"],
];

function stripSearchPrefixes(raw: string): string {
  let q = raw.trim();
  q = q.replace(SEARCH_PREFIX, "");
  q = q.replace(/\b(skelbimus?|skelbimus|visus|viso)\b/gi, " ");
  return q.replace(/\s+/g, " ").trim();
}

function detectCity(raw: string): string | undefined {
  for (const [pattern, city] of LT_CITY_PATTERNS) {
    if (pattern.test(raw)) return city;
  }
  return undefined;
}

function canUseFastSearch(text: string): boolean {
  const t = text.trim();
  if (!t || t.length > 140) return false;
  if (SELLER_RE.test(t)) return false;
  if (SKIP_FAST.test(t)) return false;
  return true;
}

function parseFastSearchParams(text: string) {
  if (!canUseFastSearch(text)) return null;
  const cityNominative = detectCity(text);
  let working = text;
  if (cityNominative) {
    for (const [pattern] of LT_CITY_PATTERNS) {
      working = working.replace(pattern, " ");
    }
  }
  const query = stripSearchPrefixes(working);
  if (query.length < 2) return null;
  const q = query.toLowerCase();
  let category: string | undefined;
  if (/\b(volvo|bmw|audi|vw|toyota|mercedes|ford|opel|auto|automob)\b/i.test(q)) {
    category = "vehicles";
  }
  return { query: q, category, cityNominative, limit: 12 };
}

export async function tryFastAgentSearchPath(
  req: FastAgentSearchRequest,
  ctx: AgentToolContext
): Promise<FastAgentSearchResponse | null> {
  const lastUser = [...req.messages].reverse().find((m) => m.role === "user");
  if (!lastUser) return null;

  const params = parseFastSearchParams(lastUser.text);
  if (!params) return null;

  const { result, sideEffect } = await executeAgentTool(
    "searchListings",
    {
      query: params.query,
      category: params.category,
      city: params.cityNominative,
      limit: params.limit,
    },
    ctx
  );

  const count =
    result && typeof result === "object" && "count" in result
      ? Number((result as { count?: number }).count)
      : 0;

  return {
    ok: true,
    reply: count > 0 ? STATE_SEARCH_REPLY : STATE_EMPTY_SEARCH_REPLY,
    toolCalls: [
      {
        name: "searchListings",
        result: {
          ...(typeof result === "object" && result ? result : {}),
          fastPath: true,
        },
      },
    ],
    actions: sideEffect ?? { type: "none" },
  };
}
