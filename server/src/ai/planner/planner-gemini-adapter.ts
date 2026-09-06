/**
 * E2.2 — Gemini adapter for the planner structured-output contract.
 *
 * The ONLY module that knows the Google endpoint / key / response shape.
 * Model resolution goes through the VAUTO model router (FAST class) with
 * the historical default of gemini-2.5-flash.
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

/**
 * E2.3 — create a Gemini adapter BOUND to a concrete model. The provider
 * router supplies the model; this adapter is used ONLY when the route's
 * provider is "gemini" (a non-Gemini model can never reach the Google
 * endpoint).
 */
export function createGeminiPlannerAdapter(
  modelOverride?: string
): PlannerLlmAdapter {
  const resolved = modelOverride?.trim() || DEFAULT_PLANNER_MODEL;
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
      const model = resolved;
      const provider = "gemini";

      const body: Record<string, unknown> = {
        systemInstruction: { parts: [{ text: req.systemInstruction }] },
        contents: [
          {
            role: "user",
            parts: [{ text: `${renderParts(req.parts)}\n\n[Paskutinė vartotojo žinutė]\n„${req.parts.lastUserText}“` }],
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
        generationConfig: { temperature: 0, maxOutputTokens: 1024 },
      };

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
            body: JSON.stringify(body),
          },
          GEMINI_AGENT_TIMEOUT_MS
        );
      } catch (e) {
        if (e instanceof AgentRouteError) {
          throw new PlannerProviderUnavailableError(e.message, e);
        }
        throw new PlannerProviderUnavailableError(
          e instanceof Error ? e.message : String(e),
          e
        );
      }

      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new PlannerProviderUnavailableError(
          `planner model returned ${res.status}${detail ? `: ${detail.slice(0, 160)}` : ""}`
        );
      }

      const data = (await res.json()) as {
        candidates?: {
          content?: {
            parts?: Array<{ functionCall?: { name?: string; args?: unknown } }>;
          };
        }[];
      };
      const parts = data.candidates?.[0]?.content?.parts ?? [];
      const call = parts.find(
        (p) => p.functionCall?.name === req.schemaName && p.functionCall.args
      );
      if (!call?.functionCall?.args) {
        throw new PlannerStructuredOutputError(
          "planner returned no planTurn function call"
        );
      }

      return {
        args: call.functionCall.args as Record<string, unknown>,
        provider,
        model,
      };
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
