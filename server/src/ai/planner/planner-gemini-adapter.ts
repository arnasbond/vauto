/**
 * E2.2 — Gemini adapter for the planner structured-output contract.
 *
 * The ONLY module that knows the Google endpoint / key / response shape.
 * Model resolution goes through the VAUTO model router (FAST class) with
 * the historical default of gemini-2.5-flash.
 *
 * R4.3A — bounded provider resilience: a TRANSIENT planner-provider 429/5xx
 * no longer collapses the turn into deterministic AI-down. Retryable provider
 * failures are retried with exponential backoff across the primary model and
 * the established compatible fallback (gemini-2.5-flash-lite); only after
 * bounded exhaustion does the caller degrade. Non-retryable 4xx and
 * structured-output failures are NOT retried (never mis-classified as
 * provider overload).
 */
import "../../load-env.js";
import { AgentRouteError, fetchWithTimeout } from "../agent-errors.js";
import { GEMINI_AGENT_TIMEOUT_MS } from "../../lib/ai-timeout-policy.js";
import { resolveGeminiApiKey } from "../../load-env.js";
import { resolveAiModel } from "../foundation/model-router.js";
import {
  PlannerProviderUnavailableError,
  PlannerStructuredOutputError,
  type PlannerLlmAdapter,
  type PlannerStructuredRequest,
  type PlannerStructuredResponse,
} from "./planner-provider.js";

const DEFAULT_PLANNER_MODEL = "gemini-2.5-flash";
/** Established compatible fallback (matches the unified model chain). */
const PLANNER_FALLBACK_MODEL = "gemini-2.5-flash-lite";

/** Retryable HTTP statuses — transient overload/server errors only. */
const PLANNER_RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
/** Extra attempts per model (initial + this many retries). */
const PLANNER_MAX_RETRIES = 2;
/** Backoff base (ms) — mirrors the unified Gemini retry helper. */
const PLANNER_RETRY_BASE_MS = 400;
/** 429 rate-limit backoff base (ms). */
const PLANNER_429_RETRY_BASE_MS = 2_500;
/** Strict total latency ceiling for the WHOLE retry sequence (ms). */
const PLANNER_TOTAL_BUDGET_MS = 30_000;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * R4.3A — backoff sleep is itself bounded by the remaining total recovery
 * budget: a calculated 2500 ms backoff can never sleep past a 300 ms budget.
 */
function boundedSleep(
  backoffMs: number,
  started: number,
  totalBudgetMs: number
): Promise<void> {
  const remaining = totalBudgetMs - (Date.now() - started);
  const ms = Math.max(0, Math.min(backoffMs, remaining));
  return sleep(ms);
}

interface PlannerRetryTiming {
  maxRetries: number;
  retryBaseMs: number;
  retry429BaseMs: number;
  totalBudgetMs: number;
}

const DEFAULT_TIMING: PlannerRetryTiming = {
  maxRetries: PLANNER_MAX_RETRIES,
  retryBaseMs: PLANNER_RETRY_BASE_MS,
  retry429BaseMs: PLANNER_429_RETRY_BASE_MS,
  totalBudgetMs: PLANNER_TOTAL_BUDGET_MS,
};

interface GeminiFunctionCall {
  name?: string;
  args?: unknown;
}

function findFunctionCall(
  data: {
    candidates?: { content?: { parts?: Array<{ functionCall?: GeminiFunctionCall }> } }[];
  },
  schemaName: string
): GeminiFunctionCall | undefined {
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  return parts.find(
    (p) => p.functionCall?.name === schemaName && p.functionCall.args
  )?.functionCall;
}

function buildBody(req: PlannerStructuredRequest): Record<string, unknown> {
  return {
    systemInstruction: { parts: [{ text: req.systemInstruction }] },
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `${renderParts(req.parts)}\n\n[Paskutinė vartotojo žinutė]\n„${req.parts.lastUserText}“`,
          },
        ],
      },
    ],
    tools: [
      {
        functionDeclarations: [
          {
            name: req.schemaName,
            description: "Vienas struktūrizuotas sprendimas šiam turnui.",
            parameters: req.schemaJson,
          },
        ],
      },
    ],
    toolConfig: { functionCallingConfig: { mode: "ANY" } },
    generationConfig: { temperature: 0, maxOutputTokens: 2048 },
  };
}

/**
 * E2.3 — create a Gemini adapter BOUND to a concrete model. The provider
 * router supplies the model; this adapter is used ONLY when the route's
 * provider is "gemini" (a non-Gemini model can never reach the Google
 * endpoint).
 *
 * `timing` is an eval/test-only seam (production always uses the defaults) so
 * deterministic offline tests can exercise retry/bounded-exhaustion logic
 * without real backoff latency or live model calls.
 */
export function createGeminiPlannerAdapter(
  modelOverride?: string,
  timing?: Partial<PlannerRetryTiming>
): PlannerLlmAdapter {
  const t: PlannerRetryTiming = { ...DEFAULT_TIMING, ...(timing ?? {}) };
  const resolved = modelOverride?.trim() || DEFAULT_PLANNER_MODEL;
  const models =
    resolved === PLANNER_FALLBACK_MODEL
      ? [resolved]
      : [resolved, PLANNER_FALLBACK_MODEL];

  return {
    providerId: "gemini",

    async planStructured(
      req: PlannerStructuredRequest
    ): Promise<PlannerStructuredResponse> {
      const key = resolveGeminiApiKey();
      if (!key) {
        throw new PlannerProviderUnavailableError(
          "GEMINI_API_KEY not configured for the planner"
        );
      }

      const modelsTried: string[] = [];
      const started = Date.now();
      let attempts = 0;
      let lastStatus: number | null = null;
      let lastMessage = "";

      for (const model of models) {
        modelsTried.push(model);
        for (let attempt = 0; attempt <= t.maxRetries; attempt++) {
          // Strict total latency ceiling — a single attempt must never exceed
          // the REMAINING budget (never the general 120s Gemini timeout).
          const remaining = t.totalBudgetMs - (Date.now() - started);
          if (remaining <= 0) {
            console.warn("[planner] retry latency budget exceeded:", {
              modelsTried,
              attempts,
            });
            throw new PlannerProviderUnavailableError(
              "planner provider exhausted (total latency budget)",
              undefined,
              { retryExhausted: true, attempts, modelsTried }
            );
          }
          const attemptTimeoutMs = Math.min(12_000, remaining);

          attempts += 1;
          let res: Response;
          try {
            res = await fetchWithTimeout(
              `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "x-goog-api-key": key,
                },
                body: JSON.stringify(buildBody(req)),
              },
              attemptTimeoutMs
            );
          } catch (e) {
            // Network / timeout — transient provider-availability failure.
            const msg = e instanceof Error ? e.message : String(e);
            const isRouteError = e instanceof AgentRouteError;
            const canRetry = attempt < t.maxRetries;
            console.warn(
              `[planner] ${model} attempt ${attempt + 1} network/timeout${canRetry ? " (will retry)" : ""}:`,
              msg.slice(0, 240)
            );
            lastStatus = isRouteError ? (e as AgentRouteError).geminiStatus ?? null : null;
            lastMessage = msg;
            if (canRetry) {
              await boundedSleep(t.retryBaseMs * 2 ** attempt, started, t.totalBudgetMs);
              continue;
            }
            break; // retryable exhaustion → next model
          }

          if (!res.ok) {
            const status = res.status;
            const detail = await res.text().catch(() => "");
            if (!PLANNER_RETRYABLE_STATUSES.has(status)) {
              // Request/config/auth failure — model-independent, so a fallback
              // model would receive the same invalid request. FAIL FAST.
              console.warn(
                `[planner] ${model} non-retryable status ${status} — fail fast`,
                detail.slice(0, 200)
              );
              throw new PlannerProviderUnavailableError(
                `planner model returned ${status}${detail ? `: ${detail.slice(0, 160)}` : ""}`,
                undefined,
                { retryExhausted: false, attempts, modelsTried }
              );
            }
            // For 503 (model experiencing high demand), quickly fail over to the compatible fallback
            const maxModelRetries =
              status === 503 && models.length > 1 && model !== PLANNER_FALLBACK_MODEL
                ? 0
                : t.maxRetries;
            const canRetry = attempt < maxModelRetries;
            console.warn(
              `[planner] ${model} attempt ${attempt + 1} status ${status}${canRetry ? " (will retry)" : ""}`,
              detail.slice(0, 200)
            );
            lastStatus = status;
            lastMessage = detail;
            if (canRetry) {
              const base = status === 429 ? t.retry429BaseMs : t.retryBaseMs;
              await boundedSleep(base * 2 ** attempt, started, t.totalBudgetMs);
              continue;
            }
            break; // retryable exhaustion → next model
          }

          const data = (await res.json()) as {
            candidates?: {
              content?: { parts?: Array<{ functionCall?: GeminiFunctionCall; text?: string }> };
            }[];
          };
          const call = findFunctionCall(data, req.schemaName);
          if (!call?.args) {
            if (models.length > 1 && model !== models[models.length - 1]) {
              console.warn(
                `[planner] ${model} returned no valid function call (possible MALFORMED_FUNCTION_CALL) — failing over to fallback model`
              );
              break;
            }
            // Last model exhausted or no fallback — honest structured output error.
            throw new PlannerStructuredOutputError(
              "planner returned no planTurn function call"
            );
          }

          return {
            args: call.args as Record<string, unknown>,
            provider: "gemini",
            model,
            attempts,
            modelsTried,
          };
        }
      }

      console.warn("[planner] provider exhausted after retries:", {
        modelsTried,
        attempts,
        lastStatus,
      });
      const statusNote =
        lastStatus != null ? `planner model returned ${lastStatus}` : "planner provider failed";
      const detail = lastMessage ? `: ${lastMessage.slice(0, 160)}` : "";
      throw new PlannerProviderUnavailableError(`${statusNote}${detail}`, undefined, {
        retryExhausted: true,
        attempts,
        modelsTried,
      });
    },
  };
}

/** Historical default adapter (model router default). */
export const geminiPlannerAdapter: PlannerLlmAdapter =
  createGeminiPlannerAdapter();

function renderParts(parts: PlannerStructuredRequest["parts"]): string {
  const blocks: string[] = [];
  if (parts.stateBlock.trim()) blocks.push(`[Struktūrinė būsena]\n${parts.stateBlock}`);
  if (parts.factsBlock.trim()) {
    blocks.push(
      `[Kanoniniai faktai — autoritetinga struktūrinė būsena]\n${parts.factsBlock}`
    );
  }
  if (parts.goalBlock.trim()) blocks.push(`[Dabartinis tikslas]\n${parts.goalBlock}`);
  if (parts.pendingBlock.trim()) {
    blocks.push(`[Laukiantis veiksmas / patvirtinimas]\n${parts.pendingBlock}`);
  }
  if (parts.salientMemoryBlock.trim()) {
    blocks.push(`[Ilgalaikė atmintis]\n${parts.salientMemoryBlock}`);
  }
  if (parts.memoryBlock.trim()) {
    blocks.push(`[Kompaktiška atmintis]\n${parts.memoryBlock}`);
  }
  if (parts.historyBlock.trim()) blocks.push(`[Kanono istorija]\n${parts.historyBlock}`);
  return blocks.join("\n\n");
}
