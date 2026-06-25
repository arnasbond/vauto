import {
  AGENT_FUNCTION_DECLARATIONS,
  executeAgentTool,
  LT_LOCATION_AGENT_HINT,
  type AgentSideEffect,
  type AgentToolContext,
} from "./agent-tools.js";
import { buildAgentSystemInstruction } from "./agent-system-instruction.js";
import {
  resolveGeminiApiKey,
} from "../load-env.js";
import {
  AGENT_MEMORY_SYSTEM_HINT,
  buildAgentMemoryContextBlock,
  type AgentMemoryPayload,
  type AgentSearchFilters,
} from "./agent-memory-context.js";
import { resolveAgentDefaultCity } from "./zero-ui-defaults.js";
import {
  resolveMonetizationState,
  B2B_LEAD_PRICE,
  BUSINESS_MONTHLY_PRO,
  SMART_BOOST_B2B,
  SMART_BOOST_C2C,
} from "./monetization-engine.js";
import {
  AgentRouteError,
  fetchWithTimeout,
  isAbortError,
} from "./agent-errors.js";
import { tryFastAgentSearchPath } from "./fast-agent-search.js";

export interface AgentMessage {
  role: "user" | "assistant";
  text: string;
}

export interface VautoAgentRequest {
  messages: AgentMessage[];
  context: {
    userCity?: string;
    userRole?: "buyer" | "seller" | "business" | "admin";
    contact?: string;
    listings?: {
      id: string;
      title: string;
      price: number;
      category: string;
      location: string;
      description?: string;
    }[];
    lastError?: { code: string; message?: string };
    wizardMode?: "listing_review" | "search" | "idle";
    listingDraft?: {
      title?: string;
      description?: string;
      price?: number;
      location?: string;
      category?: string;
      attributes?: Record<string, string>;
    };
    missingFields?: string[];
    wizardPrompts?: string[];
    isAuthenticated?: boolean;
    searchResultCount?: number;
    lastSearchQuery?: string;
    currentView?: string;
    defaultRegion?: string;
    primaryVehicle?: {
      make: string;
      model: string;
      year: number;
    };
    activeSearchFilters?: AgentSearchFilters | null;
    searchSessionReset?: boolean;
    monetization?: {
      tier?: "free" | "business_pro";
      activeBoost?: boolean;
      billingPlan?: string;
      walletBalance?: number;
    };
  };
  /** Server-verified admin only — injected into Gemini systemInstruction */
  adminProjectContext?: string;
}

export interface VautoAgentResponse {
  ok: true;
  reply: string;
  toolCalls: { name: string; result: unknown }[];
  actions: AgentSideEffect | { type: "none" };
}

const SYSTEM_INSTRUCTION = `Tu esi VAUTO – proaktyvus Lietuvos skelbimų turgaus AI vedlys (wizard).
Tavo tikslas – vesti vartotoją pokalbiu per visą procesą lietuviškai, ne palikti sausų formų laukų.

${LT_LOCATION_AGENT_HINT}

${AGENT_MEMORY_SYSTEM_HINT}

PARDAVIMO VEDLYS:
- Kai vartotojas įkelia nuotrauką ar tekstą — iškart sugeneruok profesionalų aprašymą, nustatyk tikslią kategoriją, pasiūlyk rinkos kainą (analyzeMarketPrice) ir iškviesk postNewListing.
- Jei trūksta privalomų duomenų (miestas, kaina, būklė) — užduok patariamuosius klausimus: „Matau, kad nenurodėte miesto. Ar skelbiame Kaune?", „Ar prekė nauja, ar naudota?"
- Jei kategorija vehicles / AUTOMOBILIAI — iš balso ar teksto VISADA ištrauk make (markė), model (modelis), year (metai) ir perduok postNewListing (atskirais laukais arba attributes). Pvz. „BMW 520 2018“ → make=BMW, model=520, year=2018, category=vehicles.
- Automobiliams paklausk: „Ar norėtumėte įvesti VIN kodą, kad Regitra duomenys užsipildytų automatiškai?"
- Prieš publikavimą paklausk: „Ar keliate skelbimą kaip privatus asmuo, ar kaip įmonė/verslas?"
- Jei vartotojas neprisijungęs (isAuthenticated=false) — pasiūlyk: „Sukurkime nemokamą paskyrą vienu spustelėjimu, kad galėtumėte sekti peržiūras ir žinutes."

PAIEŠKA (MARKTPLAATS UX — PRIVALOMA):
- Kai vartotojas ieško („parodyk visus skelbimus“, „ieškau Volvo“ ir pan.) — VISADA iškviesk searchListings ir showZeroUiScreen(marketplace).
- NIEKADA neišvardink skelbimų tekstu pokalbyje: jokių pavadinimų, kainų, numeruotų sąrašų ar aprašymų. Rezultatai rodomi TIK UI tinklelyje su nuotraukomis.
- Atsakyme naudok tik vieną trumpą frazę: „Atidarau skelbimus ekrane." arba „Rezultatų nerasta."
- ${LT_LOCATION_AGENT_HINT}
- Jei rezultatų 0 — iškviesk registerWanted ir trumpai pasiūlyk pageidavimų sąrašą (be sąrašo teksto).

PARDAVIMO BALSO DIALOGAS:
- Kai postNewListing grąžina voiceFollowUp — ištark jį VERBATIM kaip TTS atsakymą (pvz. „AI užpildė markę ir modelį. Kokiais metais pagamintas jūsų automobilis ir kokia būtų kaina?").
- Jei vartotojas pateikia tik dalį duomenų (pvz. „Parduodu Volvo V70“ be metų/kainos) — iškart paklausk trūkstamų laukų vienu šiltu klausimu, pirmiausia patvirtindamas ką AI jau suprato.

KITI ĮRANKIAI:
- analyzeMarketPrice — rinkos kainos patarimas.
- triggerMicroPayment — diferencijuota kainodara: C2C Smart Boost ${SMART_BOOST_C2C} €, B2B Smart Boost ${SMART_BOOST_B2B} € (apsauga nuo dirbtinės konkurencijos), B2B Lead Gen ${B2B_LEAD_PRICE} €. Kai kaina viršija medianą — postNewListing pasiūlys Smart Boost atitinkama kaina; vartotojui pasakius „Iškelti skelbimą“ — triggerMicroPayment su price=0 (sistema pritaikys). B2B nemokamam verslui gili regiono paklausa — NIEKADA triggerMicroPayment; siūlyk Business Pro ${BUSINESS_MONTHLY_PRO} €/mėn ir showZeroUiScreen(business_dashboard).
- trackUserError — proaktyvus klaidų sprendimas.
- blockListing — administratoriui.
- showZeroUiScreen — pagrindinis Zero-UI ekranas (marketplace, listing_preview, business_dashboard, admin_panel).
- navigate_view — legacy perjungimas (pageidavimui naudok showZeroUiScreen).

KETINIMO ATPAŽINIMAS (PRIVALOMA — nekeisk paieška, jei vartotojas nori kelti skelbimą):
- Pardavimas / skelbimo kėlimas („noriu kelti skelbimą“, „parduodu“, „įdėti skelbimą“) → postNewListing + showZeroUiScreen(listing_preview). NIEKADA searchListings.
- Paieška / pirkimas → searchListings + showZeroUiScreen(marketplace).
- Verslo statistika („mano skelbimų statistika“, „peržiūros“, „skambučiai“) → showZeroUiScreen(business_dashboard).
- Admin moderavimas („patvirtinti skelbimus“, „moderuoti“) → showZeroUiScreen(admin_panel) (tik admin).
- Jei vartotojas aiškiai nori kelti skelbimą — nepridėk žodžio „ieškoti“ ir nekeisk jo užklausos į paieškos režimą.

Būk glaustas, profesionalus, šiltas, be emoji. Visada atsakyk lietuviškai.`;

const BUDDY_REPEAT_PROMPT =
  "Atsiprašau, ne viską aiškiai išgirdau. Ar galėtumėte pakartoti komandą?";

const STATE_SEARCH_REPLY = "Atidarau skelbimus ekrane.";
const STATE_EMPTY_SEARCH_REPLY = "Rezultatų nerasta.";

const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash"] as const;
const MAX_TOOL_ROUNDS = 5;
const GEMINI_AGENT_TIMEOUT_MS = 28_000;

type GeminiPart =
  | { text: string }
  | { functionCall: { name: string; args: Record<string, unknown> } }
  | { functionResponse: { name: string; response: unknown } };

interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

async function geminiAgentTurn(
  contents: GeminiContent[],
  model: string,
  systemInstruction: string
): Promise<{ parts: GeminiPart[]; text: string }> {
  const key = resolveGeminiApiKey();
  if (!key) {
    throw new AgentRouteError(
      "agent_unavailable",
      "GEMINI_API_KEY not configured on server",
      503
    );
  }

  try {
    const res = await fetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemInstruction }] },
          contents,
          tools: [{ functionDeclarations: AGENT_FUNCTION_DECLARATIONS }],
          toolConfig: { functionCallingConfig: { mode: "AUTO" } },
          generationConfig: { temperature: 0.35 },
        }),
      },
      GEMINI_AGENT_TIMEOUT_MS
    );

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new AgentRouteError(
        "gemini_error",
        `Gemini ${model} returned ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`,
        res.status >= 500 ? 502 : 503
      );
    }

    const data = (await res.json()) as {
      candidates?: { content?: { parts?: GeminiPart[] } }[];
    };
    const parts = data.candidates?.[0]?.content?.parts ?? [];
    const text = parts
      .filter((p): p is { text: string } => "text" in p && Boolean(p.text))
      .map((p) => p.text)
      .join("\n")
      .trim();

    return { parts, text };
  } catch (e) {
    if (e instanceof AgentRouteError) throw e;
    if (isAbortError(e)) {
      throw new AgentRouteError(
        "timeout",
        "Gemini API užklausa užtruko. Sumažinkite admin kontekstą arba bandykite vėliau.",
        504
      );
    }
    throw new AgentRouteError(
      "gemini_error",
      e instanceof Error ? e.message : "Gemini API klaida",
      502
    );
  }
}

export async function runVautoAgent(req: VautoAgentRequest): Promise<VautoAgentResponse> {
  try {
    return await runVautoAgentInner(req);
  } catch (e) {
    if (e instanceof AgentRouteError) throw e;
    throw new AgentRouteError(
      "agent_unavailable",
      e instanceof Error ? e.message : "AI agentas laikinai nepasiekiamas",
      503
    );
  }
}

async function runVautoAgentInner(req: VautoAgentRequest): Promise<VautoAgentResponse> {
  const systemInstruction = buildAgentSystemInstruction(
    SYSTEM_INSTRUCTION,
    req.adminProjectContext
  );

  const ctx: AgentToolContext = {
    userCity: resolveAgentDefaultCity(req.context.userCity),
    userRole: req.context.userRole ?? "buyer",
    contact: req.context.contact?.trim() || "+370 612 34567",
    listingsSnapshot: req.context.listings,
    searchSessionReset: Boolean(req.context.searchSessionReset),
    monetization: resolveMonetizationState({
      userRole: req.context.userRole,
      billingPlan: req.context.monetization?.billingPlan,
      activeBoost: req.context.monetization?.activeBoost,
      walletBalance: req.context.monetization?.walletBalance,
    }),
  };

  const memoryBlock = buildAgentMemoryContextBlock({
    defaultRegion: req.context.defaultRegion ?? ctx.userCity,
    primaryVehicle: req.context.primaryVehicle,
    activeSearchFilters: req.context.activeSearchFilters ?? null,
  } satisfies AgentMemoryPayload);

  const fastPath = await tryFastAgentSearchPath(req, ctx);
  if (fastPath) return fastPath;

  const contents: GeminiContent[] = req.messages.map((m) => ({
    role: m.role === "user" ? "user" : "model",
    parts: [{ text: m.text }],
  }));

  if (req.context.lastError?.code) {
    contents.unshift({
      role: "user",
      parts: [
        {
          text: `[Sistemos klaida: ${req.context.lastError.code}] ${req.context.lastError.message ?? ""}`,
        },
      ],
    });
  }

  const wizardBits: string[] = [];
  if (req.context.wizardMode) wizardBits.push(`wizardMode=${req.context.wizardMode}`);
  if (req.context.isAuthenticated === false) wizardBits.push("isAuthenticated=false");
  if (req.context.missingFields?.length) {
    wizardBits.push(`missingFields=${req.context.missingFields.join(",")}`);
  }
  if (req.context.listingDraft) {
    wizardBits.push(`listingDraft=${JSON.stringify(req.context.listingDraft)}`);
  }
  if (req.context.searchResultCount === 0 && req.context.lastSearchQuery) {
    wizardBits.push(`emptySearchQuery=${req.context.lastSearchQuery}`);
  }
  if (req.context.currentView) {
    wizardBits.push(`currentView=${req.context.currentView}`);
  }
  if (wizardBits.length) {
    contents.unshift({
      role: "user",
      parts: [{ text: `[Vedlio kontekstas: ${wizardBits.join("; ")}]` }],
    });
  }

  if (memoryBlock) {
    contents.unshift({
      role: "user",
      parts: [{ text: memoryBlock }],
    });
  }

  const toolCalls: { name: string; result: unknown }[] = [];
  let sideEffect: AgentSideEffect | undefined;
  let navigateEffect: AgentSideEffect | undefined;
  let microPaymentEffect: AgentSideEffect | undefined;
  let finalText = "";

  const hasGemini = Boolean(resolveGeminiApiKey());
  let lastGeminiError: AgentRouteError | null = null;

  if (!hasGemini) {
    throw new AgentRouteError(
      "agent_unavailable",
      "GEMINI_API_KEY nenustatytas serveryje",
      503
    );
  }

  if (hasGemini) {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      let parts: GeminiPart[] = [];
      let text = "";

      for (const model of GEMINI_MODELS) {
        try {
          const turn = await geminiAgentTurn(contents, model, systemInstruction);
          parts = turn.parts;
          text = turn.text;
          lastGeminiError = null;
          break;
        } catch (e) {
          lastGeminiError =
            e instanceof AgentRouteError
              ? e
              : new AgentRouteError(
                  "gemini_error",
                  e instanceof Error ? e.message : "Gemini API klaida",
                  502
                );
          console.warn(`[vauto-agent] ${model}:`, lastGeminiError.message);
        }
      }

      if (!parts.length) break;

      const functionCalls = parts.filter(
        (p): p is { functionCall: { name: string; args: Record<string, unknown> } } =>
          "functionCall" in p
      );

      if (!functionCalls.length) {
        finalText = text || "Supratau. Kuo dar galiu padėti?";
        break;
      }

      contents.push({ role: "model", parts: functionCalls });

      const responseParts: GeminiPart[] = [];
      for (const fc of functionCalls) {
        const { name, args } = fc.functionCall;
        const { result, sideEffect: fx } = await executeAgentTool(name, args ?? {}, ctx);
        toolCalls.push({ name, result });
        if (fx) {
          if (fx.type === "micro_payment") microPaymentEffect = fx;
          else if (fx.type === "navigate") navigateEffect = fx;
          else if (!sideEffect) sideEffect = fx;
        }
        responseParts.push({ functionResponse: { name, response: result } });
      }

      contents.push({ role: "user", parts: responseParts });

      if (text) finalText = text;
    }
  }

  if (!finalText) {
    const listingCall = [...toolCalls].reverse().find((t) => t.name === "postNewListing");
    const listingResult = listingCall?.result as {
      voiceFollowUp?: string;
      proactivePricingMessage?: string | null;
      marketAnalysisDeferred?: boolean;
    } | undefined;
    if (listingResult?.marketAnalysisDeferred && listingResult.voiceFollowUp) {
      finalText = listingResult.voiceFollowUp;
    } else if (listingResult?.proactivePricingMessage) {
      finalText = listingResult.proactivePricingMessage;
    } else if (listingResult?.voiceFollowUp) {
      finalText = listingResult.voiceFollowUp;
    }
  }

  const paymentCall = toolCalls.find((t) => t.name === "triggerMicroPayment");
  const paymentResult = paymentCall?.result as {
    message?: string;
    ok?: boolean;
  } | undefined;
  if (paymentResult?.message && (paymentResult.ok || paymentResult.message.includes("Business Pro"))) {
    finalText = paymentResult.message;
  }

  const searchSideEffect =
    sideEffect?.type === "search" ? sideEffect : undefined;
  const emptySearchSideEffect =
    sideEffect?.type === "empty_search" ? sideEffect : undefined;
  const searchToolCall = toolCalls.find((t) => t.name === "searchListings");
  const searchToolCount =
    searchToolCall?.result &&
    typeof searchToolCall.result === "object" &&
    "count" in searchToolCall.result
      ? Number((searchToolCall.result as { count?: number }).count)
      : searchSideEffect?.listingIds?.length ?? 0;

  if (searchToolCall || searchSideEffect || emptySearchSideEffect) {
    finalText =
      searchToolCount > 0 || searchSideEffect
        ? STATE_SEARCH_REPLY
        : STATE_EMPTY_SEARCH_REPLY;
  }

  if (!finalText) {
    if (lastGeminiError) {
      return {
        ok: true,
        reply: BUDDY_REPEAT_PROMPT,
        toolCalls,
        actions: sideEffect ?? microPaymentEffect ?? navigateEffect ?? { type: "none" },
      };
    }
    return {
      ok: true,
      reply: BUDDY_REPEAT_PROMPT,
      toolCalls,
      actions: sideEffect ?? microPaymentEffect ?? navigateEffect ?? { type: "none" },
    };
  }

  if (!finalText.trim()) {
    return {
      ok: true,
      reply: BUDDY_REPEAT_PROMPT,
      toolCalls,
      actions: sideEffect ?? microPaymentEffect ?? navigateEffect ?? { type: "none" },
    };
  }

  const listingCall = toolCalls.find((t) => t.name === "postNewListing");
  const listingResult = listingCall?.result as {
    voiceFollowUp?: string;
    missingFields?: string[];
    proactivePricingMessage?: string | null;
    marketAnalysisDeferred?: boolean;
  } | undefined;
  if (listingResult?.marketAnalysisDeferred && listingResult.voiceFollowUp) {
    finalText = listingResult.voiceFollowUp;
  } else if (
    listingResult?.proactivePricingMessage &&
    !finalText.includes(listingResult.proactivePricingMessage.slice(0, 24))
  ) {
    finalText = listingResult.proactivePricingMessage;
  } else if (
    listingResult?.voiceFollowUp &&
    listingResult.missingFields?.length &&
    !finalText.includes(listingResult.voiceFollowUp.slice(0, 24))
  ) {
    finalText = listingResult.voiceFollowUp;
  }

  return {
    ok: true,
    reply: finalText,
    toolCalls,
    actions: sideEffect ?? microPaymentEffect ?? navigateEffect ?? { type: "none" },
  };
}
