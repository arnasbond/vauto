/**
 * VAUTO AI Core v2 — webResearch capability (READ).
 *
 * Bounded public web retrieval capability powered by Brave Search API.
 * Read-only: no mutation, no consequential action, no state changes.
 * Surfaced to DeepSeek as a tool to retrieve public external evidence.
 */
import type {
  CapabilityContext,
  CapabilityContract,
  CapabilityResult,
} from "../capability.js";

export interface WebResearchArgs {
  query: string;
}

export interface WebResearchSource {
  title: string;
  url: string;
  source: string;
  snippet: string;
  timestamp: string;
  provenanceTag: "WEB_RESEARCH";
}

export interface WebResearchData {
  query: string;
  count: number;
  sources: WebResearchSource[];
}

export interface BraveSearchExecuteOptions {
  apiKey?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxResults?: number;
}

const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_MAX_RESULTS = 3;

function parseDomain(urlStr: string): string {
  try {
    const parsed = new URL(urlStr);
    return parsed.hostname.replace(/^www\./i, "");
  } catch {
    return "web";
  }
}

function truncateSnippet(text: string | undefined, maxLen: number = 250): string {
  if (!text) return "";
  const t = text.trim().replace(/\s+/g, " ");
  if (t.length <= maxLen) return t;
  return t.slice(0, maxLen - 1) + "…";
}

/**
 * Low-level Brave Search API fetch wrapper.
 * Server-side only; fails closed if key is missing or HTTP request fails.
 */
export async function fetchBraveSearch(
  query: string,
  opts: BraveSearchExecuteOptions = {}
): Promise<{ ok: boolean; data?: WebResearchData; error?: string; failureKind?: "unavailable" }> {
  const apiKey = opts.apiKey ?? process.env.BRAVE_SEARCH_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    return { ok: false, error: "BRAVE_SEARCH_API_KEY not configured", failureKind: "unavailable" };
  }

  const doFetch = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const limit = opts.maxResults ?? DEFAULT_MAX_RESULTS;

  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query.trim())}&count=${limit}`;
  const t0 = Date.now();

  try {
    const res = await doFetch(url, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "Accept-Encoding": "gzip",
        "X-Subscription-Token": apiKey.trim(),
      },
      signal: AbortSignal.timeout(timeoutMs),
    });

    const elapsedMs = Date.now() - t0;

    if (!res.ok) {
      console.warn("[web-research-telemetry]", {
        provider: "brave",
        query: query.slice(0, 50),
        status: res.status,
        elapsedMs,
        ok: false,
      });
      return { ok: false, error: `Brave Search HTTP ${res.status}`, failureKind: "unavailable" };
    }

    const json = (await res.json()) as {
      web?: {
        results?: Array<{
          title?: string;
          url?: string;
          description?: string;
          page_age?: string;
        }>;
      };
    };

    const results = json.web?.results ?? [];
    const sources: WebResearchSource[] = results.slice(0, limit).map((r) => {
      const pageUrl = r.url ?? "";
      return {
        title: (r.title ?? "").trim() || "Untitled",
        url: pageUrl,
        source: parseDomain(pageUrl),
        snippet: truncateSnippet(r.description),
        timestamp: r.page_age ?? new Date().toISOString(),
        provenanceTag: "WEB_RESEARCH",
      };
    });

    console.warn("[web-research-telemetry]", {
      provider: "brave",
      query: query.slice(0, 50),
      sourceCount: sources.length,
      elapsedMs,
      ok: true,
    });

    return {
      ok: true,
      data: {
        query: query.trim(),
        count: sources.length,
        sources,
      },
    };
  } catch (err) {
    console.warn("[web-research-telemetry]", {
      provider: "brave",
      query: query.slice(0, 50),
      error: err instanceof Error ? err.message : "search failed",
      ok: false,
    });
    return {
      ok: false,
      error: err instanceof Error ? err.message : "web search failed",
      failureKind: "unavailable",
    };
  }
}

export const webResearchCapability: CapabilityContract<
  WebResearchArgs,
  WebResearchData
> = {
  name: "webResearch",
  description:
    "Ieškoti viešos viešojo interneto informacijos (pvz., produktų/automobilių patikimumo, specifikacijų, dažnų problemų ar rinkos apžvalgų) VAUTO vartotojo tikslui.",
  operation: "READ",
  validate(raw: unknown): WebResearchArgs {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error("webResearch args must be an object");
    }
    const q = (raw as Record<string, unknown>).query;
    if (typeof q !== "string" || !q.trim()) {
      throw new Error("webResearch requires a non-empty query string");
    }
    return { query: q.trim() };
  },
  async execute(
    args: WebResearchArgs,
    _ctx: CapabilityContext
  ): Promise<CapabilityResult<WebResearchData>> {
    const res = await fetchBraveSearch(args.query);
    if (!res.ok) {
      return {
        ok: false,
        error: res.error ?? "web research failed",
        failureKind: res.failureKind ?? "unavailable",
      };
    }
    return {
      ok: true,
      data: res.data,
      provenance: "TOOL_DERIVED",
    };
  },
};
