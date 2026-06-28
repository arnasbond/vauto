import {
  AGENT_FUNCTION_DECLARATIONS,
  executeAgentTool,
  type AgentSideEffect,
  type AgentToolContext,
} from "./agent-tools.js";
import {
  buildAgentSystemInstruction,
  buildVautoAgentSystemInstruction,
} from "./agent-system-instruction.js";
import {
  resolveGeminiApiKey,
} from "../load-env.js";
import {
  buildAgentMemoryContextBlock,
  type AgentMemoryPayload,
  type AgentSearchFilters,
} from "./agent-memory-context.js";
import { resolveAgentDefaultCity } from "./zero-ui-defaults.js";
import { resolveMonetizationState } from "./monetization-engine.js";
import {
  AgentRouteError,
  fetchWithTimeout,
  isAbortError,
} from "./agent-errors.js";
import {
  buildPageContextInjectionBlock,
  buildSessionExpiredInjectionBlock,
  isTooShortSecretaryQuery,
  normalizeSecretaryQuery,
  resolveSecretaryNoiseReply,
} from "./secretary-guards.js";
import {
  enforceVoiceReplyBrevity,
  SEARCH_AGENT_BREVITY_RULES,
  SEARCH_AGENT_VOICE_INPUT_RULES,
} from "./search-agent.js";
import {
  buildUserContextInjectionBlock,
  type MyListingForAgent,
} from "./user-agent-context.js";

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
    userName?: string;
    accountType?: string;
    myListings?: MyListingForAgent[];
    myListingsSummary?: string;
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
    currentPageContext?: {
      page_id: string;
      active_listing_id?: string;
      active_listing_title?: string;
      zero_ui_screen?: string;
    };
    sessionExpired?: boolean;
    sessionLastActiveAt?: number;
    lastSessionTopic?: string;
    pendingImageUrls?: string[];
    monetization?: {
      tier?: "free" | "business_pro";
      activeBoost?: boolean;
      billingPlan?: string;
      walletBalance?: number;
    };
    fromVoice?: boolean;
    fromSearchBar?: boolean;
  };
  /** Set by route from JWT — used for DB writes (mark sold, etc.) */
  authUserId?: string;
  adminProjectContext?: string;
}

export interface VautoAgentResponse {
  ok: true;
  reply: string;
  toolCalls: { name: string; result: unknown }[];
  actions: AgentSideEffect | { type: "none" };
}

const BUDDY_REPEAT_PROMPT =
  "Atsiprašau, ne viską aiškiai išgirdau. Ar galėtumėte pakartoti komandą?";

const STATE_SEARCH_REPLY = "Atidarau skelbimus ekrane.";
const STATE_EMPTY_SEARCH_REPLY = "Rezultatų nerasta.";

const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite"] as const;
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
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": key,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemInstruction }] },
          contents,
          tools: [{ functionDeclarations: AGENT_FUNCTION_DECLARATIONS }],
          toolConfig: { functionCallingConfig: { mode: "AUTO" } },
          generationConfig: { temperature: 0.55 },
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
  const lastUserText = normalizeSecretaryQuery(
    [...(req.messages ?? [])].reverse().find((m) => m.role === "user")?.text
  );

  if (isTooShortSecretaryQuery(lastUserText)) {
    return {
      ok: true,
      reply: resolveSecretaryNoiseReply(lastUserText),
      toolCalls: [],
      actions: { type: "none" },
    };
  }

  const sessionMessages =
    req.context.sessionExpired && req.messages.length > 1
      ? req.messages.filter((m) => m.role === "user").slice(-1)
      : req.messages;

  const systemInstruction = buildAgentSystemInstruction(
    `${buildVautoAgentSystemInstruction()}\n\n${SEARCH_AGENT_BREVITY_RULES}${
      req.context.fromVoice ? `\n\n${SEARCH_AGENT_VOICE_INPUT_RULES}` : ""
    }`,
    req.adminProjectContext
  );

  const userProfileBlock = buildUserContextInjectionBlock({
    userName: req.context.userName ?? "Svečias",
    accountType: req.context.accountType ?? "Svečias",
    userCity: resolveAgentDefaultCity(req.context.userCity),
    contact: req.context.contact?.trim() || "+370 612 34567",
    userRole: req.context.userRole ?? "buyer",
    isAuthenticated: Boolean(req.context.isAuthenticated),
    myListings: req.context.myListings ?? [],
    myListingsSummary:
      req.context.myListingsSummary ??
      "Vartotojo skelbimai nežinomi — paklausk ar nori kelti naują.",
  });

  const ctx: AgentToolContext = {
    userCity: resolveAgentDefaultCity(req.context.userCity),
    userRole: req.context.userRole ?? "buyer",
    contact: req.context.contact?.trim() || "+370 612 34567",
    userName: req.context.userName,
    authUserId: req.authUserId,
    activeListingId: req.context.currentPageContext?.active_listing_id,
    activeListingTitle: req.context.currentPageContext?.active_listing_title,
    myListings: req.context.myListings,
    listingDraft: req.context.listingDraft
      ? {
          title: req.context.listingDraft.title,
          description: req.context.listingDraft.description,
          price: req.context.listingDraft.price,
          location: req.context.listingDraft.location,
          category: req.context.listingDraft.category,
          attributes: req.context.listingDraft.attributes as
            | Record<string, string>
            | undefined,
        }
      : undefined,
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

  // Gemini function calling owns all intent routing — no programmed fast-search bypass.

  const contents: GeminiContent[] = sessionMessages.map((m) => ({
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
  if (req.context.fromSearchBar) {
    wizardBits.push("fromSearchBar=true");
  }
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
  if (req.context.pendingImageUrls?.length) {
    wizardBits.push(
      `pendingImageUrls=${JSON.stringify(req.context.pendingImageUrls.slice(0, 6))}`
    );
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

  const pageContextBlock = buildPageContextInjectionBlock(req.context.currentPageContext);
  if (pageContextBlock) {
    contents.unshift({
      role: "user",
      parts: [{ text: pageContextBlock }],
    });
  }

  if (req.context.pendingImageUrls?.length) {
    contents.unshift({
      role: "user",
      parts: [
        {
          text: `[Nuotraukos įkeltos — PRIVALOMA scanListingPhotos]\nimageUrls: ${JSON.stringify(req.context.pendingImageUrls.slice(0, 6))}`,
        },
      ],
    });
  }

  if (req.context.sessionExpired) {
    const firstName =
      (req.context.userName ?? "drauge").split(/\s+/)[0] || req.context.userName || "drauge";
    contents.unshift({
      role: "user",
      parts: [
        {
          text: buildSessionExpiredInjectionBlock(
            firstName,
            req.context.lastSessionTopic ?? "skelbimus ar paiešką"
          ),
        },
      ],
    });
  }

  contents.unshift({
    role: "user",
    parts: [{ text: userProfileBlock }],
  });

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
          else if (
            fx.type === "mark_listing_sold" ||
            fx.type === "listing_draft" ||
            !sideEffect
          ) {
            sideEffect = fx;
          }
        }
        responseParts.push({ functionResponse: { name, response: result } });
      }

      contents.push({ role: "user", parts: responseParts });

      if (text) finalText = text;
    }
  }

  if (!finalText) {
    const listingCall = [...toolCalls]
      .reverse()
      .find((t) => t.name === "create_listing_draft" || t.name === "postNewListing");
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

  const soldCall = toolCalls.find((t) => t.name === "markListingSold");
  const soldResult = soldCall?.result as { message?: string; ok?: boolean } | undefined;
  if (soldResult?.ok && soldResult.message) {
    finalText = soldResult.message;
  }

  const scanCall = toolCalls.find((t) => t.name === "scanListingPhotos");
  const scanResult = scanCall?.result as {
    ok?: boolean;
    voiceAnnouncement?: string;
    message?: string;
  } | undefined;
  if (scanResult?.ok && (scanResult.voiceAnnouncement || scanResult.message)) {
    finalText = scanResult.voiceAnnouncement ?? scanResult.message ?? finalText;
  }

  const priceCall = toolCalls.find((t) => t.name === "analyzeMarketPrice");
  const priceResult = priceCall?.result as {
    smartPriceAdvice?: string;
    proposedPrice?: number;
  } | undefined;
  if (priceResult?.smartPriceAdvice && priceResult.proposedPrice) {
    finalText = priceResult.smartPriceAdvice;
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

  const hasListingDraftAction =
    sideEffect?.type === "listing_draft" ||
    toolCalls.some(
      (t) => t.name === "create_listing_draft" || t.name === "postNewListing"
    );

  if (
    !hasListingDraftAction &&
    (searchToolCall || searchSideEffect || emptySearchSideEffect)
  ) {
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

  const listingCall = toolCalls.find(
    (t) => t.name === "create_listing_draft" || t.name === "postNewListing"
  );
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

  if (req.context.fromVoice) {
    finalText = enforceVoiceReplyBrevity(finalText);
  }

  return {
    ok: true,
    reply: finalText,
    toolCalls,
    actions: sideEffect ?? microPaymentEffect ?? navigateEffect ?? { type: "none" },
  };
}
