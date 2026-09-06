/**
 * E0 — scripted model provider (deterministic CI mode).
 *
 * Replaces ONLY the Gemini HTTP call with a deterministic script that returns
 * the real model contract shape (candidates[].content.parts[] with
 * functionCall / text parts) exactly as `geminiSupervisorTurn` parses it.
 * Everything downstream — routing, tool execution, policy, history handling —
 * stays the real code. The script is the neutral expression of the user's
 * intent; it never pre-writes server facts.
 */
import type { ScriptedModelResponse } from "./golden-types.js";

export interface ModelCallRecord {
  turnIndex: number;
  round: number;
  toolMode: string;
  parts: Array<{ name?: string; text?: string }>;
}

export interface ScriptedModelRecorder {
  calls: ModelCallRecord[];
  /** Install the provider; returns the previous fetch. */
  install: () => typeof fetch;
  /** Restore the original fetch. */
  restore: () => void;
}

export function createScriptedModelProvider(script: {
  /** Per-turn scripted model responses. */
  turns: Array<ScriptedModelResponse[]>;
  /** Extra responses returned after the script is exhausted (default: empty text). */
  exhausted?: ScriptedModelResponse;
}): ScriptedModelRecorder {
  const calls: ModelCallRecord[] = [];
  const original = globalThis.fetch;

  let currentTurn = 0;
  let roundInTurn = 0;

  return {
    calls,
    install: () => {
      globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
        const url = String(input);
        if (!url.includes("generativelanguage.googleapis.com")) {
          return original(input, init);
        }
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          toolConfig?: { functionCallingConfig?: { mode?: string } };
        };
        const toolMode = body.toolConfig?.functionCallingConfig?.mode ?? "AUTO";
        const turnScripts = script.turns[currentTurn] ?? [];
        const response =
          turnScripts[roundInTurn] ??
          (script.exhausted ?? { parts: [] });
        calls.push({
          turnIndex: currentTurn,
          round: roundInTurn,
          toolMode,
          parts: response.parts.map((p) =>
            "functionCall" in p
              ? { name: p.functionCall.name }
              : { text: p.text }
          ),
        });
        roundInTurn += 1;
        const parts = response.parts.map((p) =>
          "functionCall" in p
            ? { functionCall: { name: p.functionCall.name, args: p.functionCall.args } }
            : { text: p.text }
        );
        return new Response(
          JSON.stringify({ candidates: [{ content: { parts } }] }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }) as typeof fetch;
      return original;
    },
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

/** Advance the provider to the next scenario turn (the harness calls this). */
export function advanceScriptedTurn(
  recorder: ScriptedModelRecorder & { _advance?: () => void }
): void {
  void recorder;
}

/**
 * Helper to build a neutral reference plan for a turn:
 * `fc("tool", {…})` → function-call part, `text("…")` → text part,
 * composed into a round via `round(...)`.
 */
export function fc(name: string, args: Record<string, unknown>) {
  return { functionCall: { name, args } };
}
export function text(t: string) {
  return { text: t };
}
export function round(...parts: Array<ReturnType<typeof fc> | ReturnType<typeof text>>) {
  return { parts };
}
