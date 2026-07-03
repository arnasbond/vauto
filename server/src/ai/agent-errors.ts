export type AgentErrorCode =
  | "timeout"
  | "gemini_error"
  | "agent_unavailable"
  | "invalid_request";

export class AgentRouteError extends Error {
  constructor(
    public readonly code: AgentErrorCode,
    message: string,
    public readonly status = 503,
    /** Upstream Gemini HTTP status, when this error wraps a Gemini API response. */
    public readonly geminiStatus?: number
  ) {
    super(message);
    this.name = "AgentRouteError";
  }
}

export function isAbortError(e: unknown): boolean {
  return (
    e instanceof Error &&
    (e.name === "AbortError" || /aborted|timeout/i.test(e.message))
  );
}

export function normalizeAgentRouteError(e: unknown): {
  status: number;
  code: AgentErrorCode;
  message: string;
} {
  if (e instanceof AgentRouteError) {
    return { status: e.status, code: e.code, message: e.message };
  }
  if (isAbortError(e)) {
    return {
      status: 504,
      code: "timeout",
      message:
        "AI užklausa užtruko per ilgai. Bandykite trumpesnį klausimą arba sumažinkite Gemini kontekstą.",
    };
  }
  const message = e instanceof Error ? e.message : String(e);
  return {
    status: 503,
    code: "agent_unavailable",
    message: message || "AI agentas laikinai nepasiekiamas",
  };
}

export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
