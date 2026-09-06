/**
 * LIVE gate SSE wire parser — matches the REAL /stream wire contract:
 *
 *   data: {"type":"status",...}
 *   data: {"type":"final","result":{ reply, toolCalls, actions, thread, ... }}
 *   data: {"type":"error","code":"...","message":"..."}
 *
 * The final payload lives under `.result` (server/src/routes/vauto-agent.ts).
 * An SSE `error` event is an explicit infrastructure/runtime ERROR — it is
 * NEVER converted into `reply=""` or a behavioral FAIL.
 */

export interface ParsedToolCall {
  name: string;
  result?: unknown;
}

export interface ParsedFinalResult {
  reply: string;
  toolCalls: ParsedToolCall[];
  actions: Record<string, unknown>;
  thread: {
    threadId?: string;
    version?: number;
    anonSessionToken?: string;
  } | null;
  quickReplies?: unknown;
  prePublishCard?: unknown;
}

export interface ParsedLiveStream {
  rawText: string;
  events: Array<Record<string, unknown>>;
  finalEvent: Record<string, unknown> | null;
  errorEvent: { code: string; message: string } | null;
  /** Fully unpacked final payload — null when no final event arrived. */
  finalResult: ParsedFinalResult | null;
  /** Thread identity: from the final payload, falling back to the previous
   *  turn's identity (an errored turn carries no thread metadata). */
  threadId: string | null;
  anonSessionToken: string | null;
  statusEvents: number;
}

export interface LiveStreamFallbackThread {
  threadId: string | null;
  anonSessionToken: string | null;
}

export function parseLiveStreamBody(
  bodyText: string,
  fallbackThread: LiveStreamFallbackThread = { threadId: null, anonSessionToken: null }
): ParsedLiveStream {
  const events: Array<Record<string, unknown>> = [];
  for (const chunk of bodyText.split(/\n\n/)) {
    for (const line of chunk.split("\n")) {
      if (!line.startsWith("data:")) continue;
      const raw = line.slice(5).trim();
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (parsed && typeof parsed === "object") {
          events.push(parsed as Record<string, unknown>);
        }
      } catch {
        // Malformed line — keep scanning; the caller reports it via the
        // errorEvent (missing) instead of silently replying "".
      }
    }
  }

  const finalEvent = events.find((e) => e.type === "final") ?? null;
  const errorRaw = events.find((e) => e.type === "error");
  const errorEvent = errorRaw
    ? { code: String(errorRaw.code ?? "unknown_error"), message: String(errorRaw.message ?? "") }
    : null;

  const result = (finalEvent?.result ?? null) as Record<string, unknown> | null;
  const thread = (result?.thread ?? null) as
    | { threadId?: string; version?: number; anonSessionToken?: string }
    | null;

  const toolCalls: ParsedToolCall[] = Array.isArray(result?.toolCalls)
    ? (result!.toolCalls as Array<Record<string, unknown>>).map((t) => ({
        name: String(t.name ?? ""),
        result: t.result,
      }))
    : [];

  return {
    rawText: bodyText,
    events,
    finalEvent,
    errorEvent,
    finalResult: result
      ? {
          reply: String(result.reply ?? ""),
          toolCalls,
          actions: (result.actions ?? {}) as Record<string, unknown>,
          thread,
          quickReplies: result.quickReplies,
          prePublishCard: result.prePublishCard,
        }
      : null,
    threadId: thread?.threadId ? String(thread.threadId) : fallbackThread.threadId,
    anonSessionToken: thread?.anonSessionToken
      ? String(thread.anonSessionToken)
      : fallbackThread.anonSessionToken,
    statusEvents: events.filter((e) => e.type === "status").length,
  };
}
