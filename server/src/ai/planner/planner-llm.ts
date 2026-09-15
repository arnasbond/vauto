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

const PLANNER_SYSTEM_INSTRUCTION = [
  "Esi VAUTO klasifikuotojo planeris. Tu NEATSAKAI vartotojui — tu pateiki VIENĄ planTurn funkcijos kvietimą su griežta struktūra.",
  "Sprendžiama: ką vartotojas NORI dabar; ar tai ankstesnio tikslo tęsinys; ar tai korekcija; ar intent switch; ar reikia tool; kokio; ar geriau klausti; ar pakanka dialogu.",
  "Griežtos taisyklės:",
  "- Niekada nesirink catalog_search vien todėl, kad intencija neaiški — tada dialog arba clarify_ambiguous.",
  "- Finansinės komandos (pervedimai, wallet) NIEKADA nėra paieška.",
  "- Publikuoti (publish_request) reiškia prašymą paskelbti / talpinti paruoštą skelbimą (pvz. „publikuok“, „įkelk skelbimą“). NIEKADA nenaudoti paieškai ar skelbimų rodymui („parodyk...“, „surask...“). Publikuoti gali prašyti tik prisijungęs vartotojas.",
  "- Su aktyviu juodraščiu (hasDraft=true) papildomos informacijos pateikimas, savybės ar faktų korekcijos (pvz. „su 4 kėdėmis, ąžuolas“, medžiaga, komplektacija, kaina, būklė, miestas, VIN) yra esamo juodraščio tęsinys: continuationOf: 'sell_draft', intent: 'sell_update', tool: 'updateListingDraft'. Niekada nekurk naujo juodraščio (sell_create), kai juodraštis jau egzistuoja. Perduok atnaujinamus faktus per toolArgs.attributes (pvz. { material: 'ąžuolas', details: 'su 4 kėdėmis' }) arba toolArgs.categoryAttributes, arba toolArgs.description.",
  "- VIN kandidatas tik transporto juodraščiui (vin_candidate).",
  "- Klausimai apie istoriją/juodraštį yra context_question.",
  "- Prekių, automobilių, nekilnojamojo turto, paslaugų, meistrų ar darbo paieška („ieškau...“, „surask...“, „parodyk automobilius...“, „reikia meistro...“, „reikia remonto...“, struktūruoti filtrai kaina/miestas) yra catalog_search su tool: searchListings.",
  "- searchListings toolArgs pateik švarų `query` (ieškomas objektas/paslaugos be pagalbinių žodžių), `category` (vehicles, real_estate, clothing, electronics, jobs, home, services, other), `city` ir kainų rėžius (`minPrice`, `maxPrice`) jei jie nurodyti.",
  "- KOREKCIJA: kai vartotojas taiso ankstesnį paieškos objektą („ne, ne Audi, o BMW“, „geriau BMW“, „ne šito, o kito“), nurodyk naują paieškos objektą (query: 'BMW'), operation: 'replace', o subject atnaujink į naują objektą. Niekada nejunk seno ir naujo objekto kartu.",
  "- PATARIMAI / REKOMENDACIJOS: kai vartotojas prašo bendro patarimo ar rekomendacijos („patarkit kokį automobilį pirkti...“, „nežinau kokį telefoną mamai...“) be reikalavimo rodyti konkrečius skelbimus, tai yra patarimas (dialog arba context_question) su tool: null.",
  "- SOFT PREFERENCE ≠ HARD FILTRAS: „geriau/norėčiau/būtų geriausia/jei galima“ → preferences, NE city/maxPrice/category hard. „gali būti ir X“ → preferences.alternatives. „iki/nuo“ (be „geriau“) → hard maxPrice/minPrice.",
  "- DAUGIAU NEI VIENAS TIKSLAS: pagrindinis → intent+tool; susijęs antrinis (kaina, alternatyva) → secondary. Niekada nenumetyk antrinio tikslo.",
  "- SUBJEKTAS: kai klausimas susijęs su ankstesniu objektu („kiek TOKS kainuoja“), nurodyk subject pagal kontekstą (NE pažodinę žinutę). Atnaujink subject, kai objektas aiškiai pasikeičia.",
  "- Kompaktinė atmintis yra PATARIAMOJI; kanoniniai faktai (factsBlock) yra autoritetinga būsena — jei jie konfliktuoja su neseniai pasakyta fraze, laimi kanoniniai faktai.",
  "- Paieškos tęstinumas ir panašūs variantai: kai vartotojas tikslina ar tęsia esamą paiešką (prideda savybę, filtrą, biudžetą) arba prašo panašių variantų („šitas visai patinka, ar yra dar panašių?“, „parodyk daugiau“, „ieškok panašių“), nurodyk continuationOf: 'search_session', intent: 'catalog_search', tool: 'searchListings', o searchListings toolArgs pateik operation: 'refine' (tai NĖRA clarify_ambiguous). Kai vartotojas pradeda naują paiešką ar pakeičia objektą („ieškokime kitko“, „ne X, o Y“), pateik operation: 'replace'. Resetui naudok operation: 'reset'. Specifiniai vertikalių atributai (kambariai, plotas, dydis, atmintis ir kt.) perduodami per toolArgs.categoryAttributes.",
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
        description: "Argumentai įrankiui (searchListings, updateListingDraft ir kt.).",
        properties: {
          query: {
            type: "STRING",
            description: "Paieškos tekstas / objektas (švarus, be komandinių žodžių, pvz. 'BMW', 'žieminė striukė vyrui XL juoda', 'vandens šildytuvo meistras'). Korekcijos metu („ne X, o Y“) — TIK naujas objektas Y.",
          },
          operation: {
            type: "STRING",
            enum: ["refine", "replace", "reset"],
            description: "refine = esamos paieškos patikslinimas; replace = nauja paieška arba objekto pakeitimas/korekcija; reset = atstatymas.",
          },
          category: {
            type: "STRING",
            enum: [
              "vehicles",
              "real_estate",
              "clothing",
              "electronics",
              "home",
              "services",
              "jobs",
              "other",
            ],
            description: "Katalogo kategorija.",
          },
          city: {
            type: "STRING",
            description: "Miestas (pvz. Vilnius, Kaunas, Klaipėda).",
          },
          minPrice: {
            type: "NUMBER",
            description: "Minimali kaina skaičiumi.",
          },
          maxPrice: {
            type: "NUMBER",
            description: "Maksimali kaina skaičiumi.",
          },
          vin: {
            type: "STRING",
            description: "VIN numeris (transportui).",
          },
          listingId: {
            type: "STRING",
            description: "Skelbimo ID (veiksmams su konkrečiu skelbimu).",
          },
          preferences: {
            type: "OBJECT",
            description: "Minkšti pageidavimai (soft preferences, pvz. {bodyType, fuelType, preferredLocation, alternatives, exclusions, maxPriceHint}).",
            properties: {
              bodyType: { type: "STRING" },
              fuelType: { type: "STRING" },
              preferredLocation: { type: "STRING" },
              alternatives: { type: "ARRAY", items: { type: "STRING" } },
              exclusions: { type: "ARRAY", items: { type: "STRING" } },
              maxPriceHint: { type: "NUMBER" },
            },
          },
          categoryAttributes: {
            type: "OBJECT",
            description: "Specifiniai kategorijos atributai (plotas, kambariai, talpa, dydis, rida, medžiaga, savybės).",
            properties: {
              rooms: { type: "NUMBER" },
              area: { type: "NUMBER" },
              size: { type: "STRING" },
              mileage: { type: "NUMBER" },
              storage: { type: "STRING" },
              material: { type: "STRING" },
              details: { type: "STRING" },
              ram: { type: "STRING" },
              color: { type: "STRING" },
            },
          },
          attributes: {
            type: "OBJECT",
            description: "Struktūrizuoti skelbimo atributai atnaujinimui (material, details, size, storage, color, condition, quantity, features ir kt.).",
            properties: {
              material: { type: "STRING" },
              details: { type: "STRING" },
              condition: { type: "STRING" },
              color: { type: "STRING" },
              size: { type: "STRING" },
              storage: { type: "STRING" },
              ram: { type: "STRING" },
              rooms: { type: "NUMBER" },
              area: { type: "NUMBER" },
              yearBuilt: { type: "NUMBER" },
              workType: { type: "STRING" },
            },
          },
          description: {
            type: "STRING",
            description: "Atnaujintas arba papildytas skelbimo aprašymas.",
          },
        },
      },
      secondary: {
        type: "OBJECT",
        description: "Susijęs antrinis tikslas, jei vartotojas vienoje žinutėje išreiškė daugiau nei vieną norą (pvz. parduoti + paklausti kainos). PRIVALOMA nenuleisti tyliai.",
        properties: {
          kind: {
            type: "STRING",
            enum: ["market_intelligence", "related_search", "alternative_suggestion"],
          },
          note: { type: "STRING", description: "Trumpas antrinio tikslo aprašymas (≤200)" },
        },
        required: ["kind", "note"],
      },
      subject: {
        type: "STRING",
        description:
          "Dabartinis pokalbio subjektas/referentas (kategorijos neutralus: „BMW“, „iPhone 15“, „butas Žirmūnuose“, „darbas Vilniuje“). Kai vartotojas klausia „kiek TOKS kainuoja“, „TOKS“ sprendžiamas pagal kontekstą — tai NE pažodinė žinutė. Atnaujinama, kai vartotojas aiškiai keičia objektą.",
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
  /** R4.3A observability — provider attempts before success. */
  attempts?: number;
  /** R4.3A observability — models tried in order. */
  modelsTried?: string[];
  /** R4.3A observability — failure mode (distinguishes infra vs semantic). */
  failure?: "provider_unavailable" | "structured_output" | "schema_validation";
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
  let response: import("./planner-provider.js").PlannerStructuredResponse;
  try {
    response = await adapter.planStructured(buildPlannerStructuredRequest(input));
  } catch (e) {
    // R4.3A — record the failure mode so the eval can distinguish
    // infrastructure (provider overload) from semantic (structured-output).
    if (e instanceof PlannerStructuredOutputError) {
      plannerTraceSink?.({ rawArgs: null, schemaValid: false, clampList: [], final: null, failure: "structured_output" });
    } else if (e instanceof PlannerProviderUnavailableError) {
      plannerTraceSink?.({
        rawArgs: null,
        schemaValid: false,
        clampList: [],
        final: null,
        failure: "provider_unavailable",
        attempts: e.attempts,
        modelsTried: e.modelsTried,
      });
    }
    throw e;
  }

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
      attempts: response.attempts,
      modelsTried: response.modelsTried,
      failure: "schema_validation",
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
    ...(parsed.secondary ? { secondary: parsed.secondary } : {}),
    ...(parsed.subject ? { subject: parsed.subject } : {}),
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
    attempts: response.attempts,
    modelsTried: response.modelsTried,
  });
  return clamped;
}

export { PlannerProviderUnavailableError, PlannerStructuredOutputError };
