import { getDataApiBaseUrl } from "@/lib/api/config";
import { getAuthHeaders } from "@/lib/auth/session";
import { trimAgentRequestBody } from "@/lib/agent-request-trim";
import type { VautoAgentApiResult } from "@/lib/vauto-agent-client";
import { AI_VISION_FETCH_TIMEOUT_MS } from "@/lib/ai-safeguards";

export type VautoAgentStreamEvent =
  | { type: "status"; message: string }
  | { type: "tool_call"; name: string; message: string }
  | { type: "tool_result"; name: string }
  | { type: "final"; result: VautoAgentApiResult & { ok: true } }
  | { type: "error"; code: string; message: string };

export interface VautoAgentStreamHandlers {
  onEvent: (event: VautoAgentStreamEvent) => void;
}

function parseSseChunks(buffer: string): {
  events: VautoAgentStreamEvent[];
  rest: string;
} {
  const events: VautoAgentStreamEvent[] = [];
  const chunks = buffer.split("\n\n");
  const rest = chunks.pop() ?? "";
  for (const chunk of chunks) {
    const dataLine = chunk.split("\n").find((line) => line.startsWith("data: "));
    if (!dataLine) continue;
    try {
      events.push(JSON.parse(dataLine.slice(6)) as VautoAgentStreamEvent);
    } catch {
      /* ignore malformed */
    }
  }
  return { events, rest };
}

/** POST /api/vauto-agent/stream — SSE progress + authoritative final payload. */
export async function apiVautoAgentStream(
  body: Parameters<
    typeof import("@/lib/api/client").apiVautoAgent
  >[0],
  handlers: VautoAgentStreamHandlers,
  signal?: AbortSignal
): Promise<VautoAgentApiResult | null> {
  const trimmed = trimAgentRequestBody(body);
  const timeoutMs = trimmed.includeAdminContext ? 45_000 : AI_VISION_FETCH_TIMEOUT_MS;
  const renderBase = getDataApiBaseUrl();

  const bases: string[] = [];
  if (typeof window !== "undefined") {
    bases.push(window.location.origin);
  }
  if (renderBase && !bases.includes(renderBase)) {
    bases.push(renderBase);
  }

  for (const base of bases) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    const onAbort = () => controller.abort();
    signal?.addEventListener("abort", onAbort);

    try {
      const res = await fetch(`${base}/api/vauto-agent/stream`, {
        method: "POST",
        headers: {
          ...getAuthHeaders(),
          Accept: "text/event-stream",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(trimmed),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) continue;

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalResult: VautoAgentApiResult | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parsed = parseSseChunks(buffer);
        buffer = parsed.rest;
        for (const event of parsed.events) {
          handlers.onEvent(event);
          if (event.type === "final") {
            finalResult = event.result;
          }
          if (event.type === "error") {
            return {
              ok: false,
              error: event.message,
              code: event.code,
            };
          }
        }
      }

      if (finalResult) return finalResult;
    } catch {
      /* try next base */
    } finally {
      window.clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }
  }

  return null;
}
