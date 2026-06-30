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
  SEARCH_AGENT_BREVITY_RULES,
} from "./search-agent.js";
import {
  buildUserContextInjectionBlock,
  type MyListingForAgent,
} from "./user-agent-context.js";
import { buildUserBehaviorContextBlock } from "./user-behavior-context.js";
import {
  NO_MATCH_LEAD_HINT,
  SMART_BARGAINING_HINT,
  buildNoMatchLeadPrompt,
} from "../offer-engine.js";

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
    behaviorHistory?: {
      id?: string;
      type: string;
      at: number;
      payload?: Record<string, unknown>;
    }[];
    proactiveOffer?: {
      kind: "no_match" | "bargaining";
      query?: string;
      listingId?: string;
      listingTitle?: string;
      listingPrice?: number;
      category?: string;
      wardrobeMode?: boolean;
      filters?: AgentSearchFilters | null;
    };
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

const STATE_SEARCH_REPLY = "Radau variantus — pasižiūrėkim ekrane!";

function humanizeSearchItem(searchQuery: string): string {
  const q = searchQuery.trim().toLowerCase();
  if (/bat|aul|bas/.test(q)) return "tokių batelių";
  if (/sukn|dress/.test(q)) return "tokių suknelių";
  if (/ked|bat/.test(q)) return "tokių batų ar kedų";
  if (/džins|keln|jean/.test(q)) return "tokių džinsų";
  if (/pal|stri|megz/.test(q)) return "tokių drabužių";
  const first = q.split(/\s+/).find((w) => w.length >= 3);
  return first ? `tokių „${first}"` : "tokių prekių";
}

function buildEmptySearchReply(searchQuery?: string): string {
  const item = humanizeSearchItem(searchQuery ?? "");
  return `Šiuo metu ${item} turguje neturime, bet galiu užfiksuoti jūsų norą ir pranešti, kai kas nors juos įkels. Norite, kad užsiregistruočiau paiešką?`;
}

function isGenericEmptySearchReply(text: string): boolean {
  const t = text.trim().toLowerCase();
  return (
    !t ||
    t === "rezultatų nerasta." ||
    t === "rezultatų nerasta" ||
    t === "nerasta atitinkančių skelbimų." ||
    t.startsWith("nerasta ")
  );
}

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
    `${buildVautoAgentSystemInstruction()}\n\n${SEARCH_AGENT_BREVITY_RULES}`,
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

  const behaviorBlock = buildUserBehaviorContextBlock(
    req.context.behaviorHistory?.map((e) => ({
      type: e.type,
      at: e.at,
      payload: e.payload,
    }))
  );

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

  if (behaviorBlock) {
    contents.unshift({
      role: "user",
      parts: [{ text: behaviorBlock }],
    });
  }

  if (req.context.proactiveOffer?.kind === "bargaining") {
    const po = req.context.proactiveOffer;
    contents.unshift({
      role: "user",
      parts: [
        {
          text: `[Proaktyvus derybų signalas — PRIVALOMA proposeSmartBargaining]\n${SMART_BARGAINING_HINT}\nlistingId=${po.listingId ?? ""}\ntitle=${po.listingTitle ?? ""}\nprice=${po.listingPrice ?? ""}\ncategory=${po.category ?? ""}\nwardrobeMode=${Boolean(po.wardrobeMode)}`,
        },
      ],
    });
  }

  if (
    req.context.proactiveOffer?.kind === "no_match" ||
    req.context.searchResultCount === 0
  ) {
    const q =
      req.context.proactiveOffer?.query ??
      req.context.lastSearchQuery ??
      "";
    contents.unshift({
      role: "user",
      parts: [
        {
          text: `[No-Match Lead — 0 rezultatų]\n${NO_MATCH_LEAD_HINT}\nquery=${q}\nfilters=${JSON.stringify(req.context.activeSearchFilters ?? req.context.proactiveOffer?.filters ?? null)}`,
        },
      ],
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
  let uiFilterEffect: AgentSideEffect | undefined;
  let navigateScreenEffect: AgentSideEffect | undefined;
  let offerEffect: AgentSideEffect | undefined;
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
          else if (fx.type === "apply_ui_filters") uiFilterEffect = fx;
          else if (fx.type === "navigate_to_screen") navigateScreenEffect = fx;
          else if (
            fx.type === "create_user_requirement" ||
            fx.type === "propose_bargaining"
          ) {
            offerEffect = fx;
          }
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

  const uiFilterCall = toolCalls.find((t) => t.name === "updateUIFilters");
  const uiFilterResult = uiFilterCall?.result as { ok?: boolean; label?: string } | undefined;
  if (uiFilterResult?.ok && uiFilterResult.label) {
    finalText = uiFilterResult.label;
  }

  const navigateScreenCall = toolCalls.find((t) => t.name === "navigateToScreen");
  const navigateScreenResult = navigateScreenCall?.result as {
    ok?: boolean;
    label?: string;
    message?: string;
  } | undefined;
  if (navigateScreenResult?.ok && (navigateScreenResult.label || navigateScreenResult.message)) {
    finalText = navigateScreenResult.label ?? navigateScreenResult.message ?? finalText;
  }

  const requirementCall = toolCalls.find((t) => t.name === "createUserRequirement");
  const requirementResult = requirementCall?.result as {
    ok?: boolean;
    message?: string;
  } | undefined;
  if (requirementResult?.ok && requirementResult.message) {
    finalText = requirementResult.message;
  } else if (
    requirementResult &&
    !requirementResult.ok &&
    requirementResult.message &&
    (sideEffect?.type === "empty_search" || req.context.searchResultCount === 0)
  ) {
    finalText = requirementResult.message;
  }

  const bargainCall = toolCalls.find((t) => t.name === "proposeSmartBargaining");
  const bargainResult = bargainCall?.result as { ok?: boolean; message?: string; openerMessage?: string } | undefined;
  if (bargainResult?.ok && (bargainResult.message || bargainResult.openerMessage)) {
    finalText = bargainResult.message ?? bargainResult.openerMessage ?? finalText;
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

  const hasUiDrivingTool = Boolean(uiFilterCall || navigateScreenCall);
  const hasOfferTool = Boolean(requirementCall || bargainCall);

  if (
    !hasListingDraftAction &&
    !hasUiDrivingTool &&
    !hasOfferTool &&
    (searchToolCall || searchSideEffect || emptySearchSideEffect)
  ) {
    const emptyQuery =
      emptySearchSideEffect?.searchQuery ??
      (searchToolCall?.result &&
      typeof searchToolCall.result === "object" &&
      "filters" in searchToolCall.result
        ? String(
            (searchToolCall.result as { filters?: { query?: string } }).filters
              ?.query ?? ""
          )
        : "");

    if (searchToolCount > 0 || searchSideEffect) {
      finalText =
        finalText.trim() && !isGenericEmptySearchReply(finalText)
          ? finalText
          : STATE_SEARCH_REPLY;
    } else {
      finalText =
        finalText.trim() && !isGenericEmptySearchReply(finalText)
          ? finalText
          : buildNoMatchLeadPrompt(emptyQuery);
    }
  }

  const resolvedAction =
    offerEffect ??
    uiFilterEffect ??
    navigateScreenEffect ??
    sideEffect ??
    microPaymentEffect ??
    navigateEffect ??
    ({ type: "none" } as const);

  if (!finalText) {
    if (lastGeminiError) {
      return {
        ok: true,
        reply: BUDDY_REPEAT_PROMPT,
        toolCalls,
        actions: resolvedAction,
      };
    }
    return {
      ok: true,
      reply: BUDDY_REPEAT_PROMPT,
      toolCalls,
      actions: resolvedAction,
    };
  }

  if (!finalText.trim()) {
    return {
      ok: true,
      reply: BUDDY_REPEAT_PROMPT,
      toolCalls,
      actions: resolvedAction,
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

  return {
    ok: true,
    reply: finalText,
    toolCalls,
    actions: resolvedAction,
  };
}
