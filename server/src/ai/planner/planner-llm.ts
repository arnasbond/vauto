/**
 * E2.2 — LLM-FIRST planner (provider-agnostic).
 *
 * Agent Core depends ONLY on the typed structured-output adapter contract
 * (`planner-provider.ts`). No provider endpoint, API key shape, or response
 * shape lives here — the provider layer resolves the concrete model.
 *
 * On provider-unavailable failures the orchestrator falls back with
 * AI-down semantics; on structured-output failures it falls back with the
 * model still assumed available.
 */
import { sanitizePromptUserInput, wrapUntrustedXml } from "../../shared/prompt-injection.js";
import {
  applyDeterministicClamps,
  deriveRoutingForIntent,
} from "./planner-policy.js";
import { PlannerDecisionSchema } from "./planner-policy.js";
import {
  PlannerProviderUnavailableError,
  PlannerStructuredOutputError,
  type PlannerStructuredRequest,
} from "./planner-provider.js";
import type { PlannerContextInput, PlannerDecision } from "./planner-types.js";

const PLANNER_SYSTEM_INSTRUCTION = [  "Esi VAUTO klasifikuotojo planeris. Tu NEATSAKAI vartotojui — tu pateiki VIENĄ planTurn funkcijos kvietimą su griežta struktūra.",
  "Sprendžiama: ką vartotojas NORI dabar; ar tai ankstesnio tikslo tęsinys; ar tai korekcija; ar intent switch; ar reikia tool; kokio; ar geriau klausti; ar pakanka dialogu.",
  "Griežtos taisyklės:",
  "- Niekada nesirink catalog_search vien todėl, kad intencija neaiški — tada dialog arba clarify_ambiguous.",
  "- Finansinės komandos (pervedimai, wallet) NIEKADA nėra paieška.",
  "- Publikuoti gali prašyti tik prisijungęs vartotojas.",
  "- Su aktyviu juodraščiu faktų korekcijos (kaina, būklė, miestas, VIN) yra sell_update.",
  "- VIN kandidatas tik transporto juodraščiui (vin_candidate).",
  "- Klausimai apie istoriją/juodraštį yra context_question.",
  "- „paieškok/ieškau/surask + objektas“ arba struktūruoti filtrai (kategorija+miestas/kaina) yra catalog_search.",
  "- Kompaktinė atmintis yra PATARIAMOJI; kanoniniai faktai (factsBlock) yra autoritetinga būsena — jei jie konfliktuoja su neseniai pasakyta fraze, laimi kanoniniai faktai.",
  "- confidence 0–1; neaišku → žemesnė confidence, ne garantuotas tool.",
].join("\n");

const PLAN_TURN_DECLARATION = {
  name: "planTurn",
  description: "Vienas struktūrizuotas sprendimas šiam turnui.",
  parameters: {
    type: "OBJECT",
    properties: {
      intent: {
        type: "STRING",
        enum: [
          "catalog_search",
          "sell_create",
          "sell_update",
          "vin_candidate",
          "sell_cancel",
          "sell_preview",
          "context_question",
          "clarify_ambiguous",
          "publish_request",
          "financial_command",
          "consequential_command",
          "dialog",
        ],
      },
      goal: { type: "STRING", description: "Trumpas tikslas (ne vartotojui rodomas)" },
      continuationOf: { type: "STRING", enum: ["sell_draft", "search_session", "none"] },
      action: { type: "STRING", description: "Kanoninis veiksmo pavadinimas" },
      tool: {
        type: "STRING",
        enum: [
          "searchListings",
          "updateListingDraft",
          "create_listing_draft",
          "scanListingPhotos",
          "markListingSold",
          "blockListing",
        ],
        nullable: true,
      },
      toolArgs: {
        type: "OBJECT",
        description: "Griežtai pagal pasirinktą tool; nežinomi laukai atmetami",
      },
      needsClarification: { type: "BOOLEAN" },
      clarificationQuestion: { type: "STRING", nullable: true },
      confidence: { type: "NUMBER", description: "0..1" },
      reasons: { type: "ARRAY", items: { type: "STRING" } },
    },
    required: ["intent", "goal", "continuationOf", "action", "needsClarification", "confidence"],
  },
};

export function buildPlannerStructuredRequest(
  input: PlannerContextInput
): PlannerStructuredRequest {
  const history = input.messages
    .map((m) => `${m.role === "user" ? "vartotojas" : "asistentas"}: ${m.text.slice(0, 240)}`)
    .join("\n");

  const factsLines = Object.entries(input.significantFacts ?? {})
    .map(([k, v]) => `${k}=${String(v).slice(0, 120)}`)
    .join("\n");

  const listingLines = (input.myListings ?? [])
    .map((l) => `${l.id}|${String(l.title).slice(0, 60)}|${l.status}`)
    .join("\n");

  return {
    systemInstruction: PLANNER_SYSTEM_INSTRUCTION,
    parts: {
      stateBlock: [
        `hasDraft=${input.hasDraft}`,
        input.hasDraft ? `draftTitle=${input.draftTitle ?? ""}` : "",
        input.hasDraft ? `draftCategory=${input.draftCategory ?? ""}` : "",
        input.hasDraft ? `draftPrice=${input.draftPrice ?? ""}` : "",
        input.hasDraft ? `draftLocation=${input.draftLocation ?? ""}` : "",
        `flowState=${input.flowState ?? "idle"}`,
        `isAuthenticated=${input.isAuthenticated}`,
        `hasSearchSession=${input.hasSearchSession}`,
        input.activeListingId ? `activeListingId=${input.activeListingId}` : "",
        listingLines
          ? `myListings(id|title|status)=\n${listingLines}`
          : "",
      ]
        .filter(Boolean)
        .join("\n"),
      memoryBlock: wrapUntrustedXml(
        "untrusted_compact_memory",
        `PATARIAMOJI — NE autoritetingas faktų šaltinis\n${sanitizePromptUserInput(input.compactMemory ?? "").text}`,
        3000
      ),
      salientMemoryBlock: wrapUntrustedXml(
        "untrusted_salient_memory",
        `PATARIAMOJI — NE autoritetingas faktų šaltinis\n${sanitizePromptUserInput(input.salientMemory ?? "").text}`,
        2400
      ),
      factsBlock: factsLines,
      goalBlock: sanitizePromptUserInput(input.currentGoal ?? "").text.slice(0, 300),
      pendingBlock: sanitizePromptUserInput(input.pendingAction ?? "").text.slice(0, 300),
      historyBlock: wrapUntrustedXml(
        "untrusted_thread_history",
        sanitizePromptUserInput(history).text,
        4000
      ),
      lastUserText: sanitizePromptUserInput(input.lastUserText).text.slice(0, 500),
    },
    schemaName: PLAN_TURN_DECLARATION.name,
    schemaJson: PLAN_TURN_DECLARATION.parameters as unknown as Record<string, unknown>,
  };
}

export interface PlannerLlmTrace {
  rawArgs: Record<string, unknown> | null;
  schemaValid: boolean;
  clampList: string[];
  final: PlannerDecision | null;
  provider?: string;
  model?: string;
}

let plannerTraceSink: ((t: PlannerLlmTrace) => void) | null = null;

export type PlannerLlmTraceObserver = (t: PlannerLlmTrace) => void;

/** Measurement-layer seam — the LIVE gate records the FULL production-path
 *  trace per turn (raw Gemini decision → zod → clamps → final). */
export function setPlannerLlmTraceSink(
  sink: PlannerLlmTraceObserver | null
): void {
  plannerTraceSink = sink;
}

/**
 * E2.2 — LLM-first planning through the provider adapter.
 * Throws PlannerProviderUnavailableError / PlannerStructuredOutputError so
 * the orchestrator can classify the fallback semantics.
 */
export async function llmPlannerDecision(
  input: PlannerContextInput,
  adapter: import("./planner-provider.js").PlannerLlmAdapter
): Promise<PlannerDecision> {
  const response = await adapter.planStructured(
    buildPlannerStructuredRequest(input)
  );

  const rawArgs = (response.args ?? {}) as Record<string, unknown>;

  // E2.2 — mandatory schema validation of the provider output.
  let parsed;
  try {
    parsed = PlannerDecisionSchema.parse(rawArgs);
  } catch (e) {
    plannerTraceSink?.({
      rawArgs,
      schemaValid: false,
      clampList: [],
      final: null,
      provider: response.provider,
      model: response.model,
    });
    throw new PlannerStructuredOutputError(
      `planner output failed schema validation: ${e instanceof Error ? e.message.slice(0, 200) : String(e)}`
    );
  }

  const decision: PlannerDecision = {
    intent: parsed.intent,
    goal: parsed.goal,
    continuationOf: parsed.continuationOf,
    action: parsed.action || parsed.intent,
    tool: parsed.tool,
    toolArgs: (parsed.toolArgs ?? {}) as PlannerDecision["toolArgs"],
    needsClarification: parsed.needsClarification,
    clarificationQuestion: parsed.clarificationQuestion,
    confidence: parsed.confidence,
    reasons: parsed.reasons,
    // Routing is NEVER model-controlled — the policy layer derives it.
    routing: deriveRoutingForIntent(parsed.intent, parsed.tool),
  };

  // Deterministic POLICY boundary — the model decision is clamped, never
  // executed verbatim.
  const { decision: clamped, clamped: clampList } = applyDeterministicClamps(
    decision,
    input
  );
  plannerTraceSink?.({
    rawArgs,
    schemaValid: true,
    clampList,
    final: clamped,
    provider: response.provider,
    model: response.model,
  });
  return clamped;
}

export { PlannerProviderUnavailableError, PlannerStructuredOutputError };
