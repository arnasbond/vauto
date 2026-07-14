import {
  executeAgentTool,
  type AgentSideEffect,
  type AgentToolContext,
} from "./agent-tools.js";
import {
  buildAgentMemoryContextBlock,
  type AgentMemoryPayload,
  type AgentSearchFilters,
} from "./agent-memory-context.js";
import { resolveAgentDefaultCity } from "./zero-ui-defaults.js";
import { resolveMonetizationState } from "./monetization-engine.js";
import {
  AgentRouteError,
} from "./agent-errors.js";
import { resolveGeminiApiKey } from "../load-env.js";
import {
  buildAgentSystemInstruction,
  buildVautoAgentSystemInstruction,
} from "./agent-system-instruction.js";
import {
  buildPageContextInjectionBlock,
  buildSessionExpiredInjectionBlock,
  isTooShortSecretaryQuery,
  normalizeSecretaryQuery,
  resolveSecretaryNoiseReply,
} from "./secretary-guards.js";
import {
  buildSellListingDraftFallback,
  detectServerSellIntent,
} from "./sell-intent-fallback.js";
import {
  buildListingChatPriceReply,
  isListingConversationInput,
  normalizeListingDraftForAction,
  parsePriceFromChatInput,
} from "./listing-chat-input.js";
import { buildBrowseAllReply, isBrowseAllIntent, resolveBrowseAllIntent } from "../lib/browse-all-intent.js";
import {
  buildListingDraftUpdateReply,
  ensureRichListingDraftReply,
} from "./listing-draft-preview.js";
import {
  evaluateServerPrePublishReadiness,
} from "./pre-publish-validation.js";
import {
  resolvePrePublishGatewayResponse,
  resolveStructuredListingInputRoute,
} from "./structured-input-pipeline.js";
import {
  buildUserContextInjectionBlock,
  type MyListingForAgent,
} from "./user-agent-context.js";
import {
  buildSupervisorStateInjectionBlock,
  resolveSupervisorStateFromRequest,
  type SupervisorApplicationState,
} from "./supervisor-context.js";
import {
  extractGeminiFunctionCalls,
  geminiSupervisorTurn,
  isGenericEmptySearchReply,
  resolveSupervisorFinalReply,
  runDeterministicSupervisorSearch,
  shouldForceSupervisorTools,
  shouldReplaceSideEffect,
  type GeminiContent,
  type GeminiPart,
} from "./supervisor-tool-runner.js";
import { buildUserBehaviorContextBlock } from "./user-behavior-context.js";
import {
  NO_MATCH_LEAD_HINT,
  SEARCH_REFINE_HINT,
  SMART_BARGAINING_HINT,
} from "../offer-engine.js";
import { EMPTY_SEARCH_QUICK_REPLIES } from "./structured-input-pipeline.js";
import {
  getRecentUserBehaviorEvents,
  getUserPreferences,
} from "../repository.js";

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
      allowPastomatas?: boolean;
    };
    missingFields?: string[];
    wizardPrompts?: string[];
    profilePhone?: string;
    profileEmail?: string;
    profileContactsVerified?: boolean;
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
    sellerMetrics?: {
      views: number;
      callClicks: number;
      chatStarts: number;
      saves: number;
      interestScore: number;
      buyerIntentCount?: number;
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
      kind: "no_match" | "bargaining" | "search_refine";
      query?: string;
      listingId?: string;
      listingTitle?: string;
      listingPrice?: number;
      category?: string;
      wardrobeMode?: boolean;
      resultCount?: number;
      filters?: AgentSearchFilters | null;
    };
    /** Pilna programos būsena — supervisor akys ir ausys (kiekvienam Gemini kvietimui). */
    supervisorState?: SupervisorApplicationState;
  };
  /** Set by route from JWT — used for DB writes (mark sold, etc.) */
  authUserId?: string;
  adminProjectContext?: string;
}

export interface VautoAgentResponse {
  ok: true;
  reply: string;
  quickReplies?: string[];
  prePublishCard?: import("./pre-publish-validation.js").ServerPrePublishCardPayload;
  toolCalls: { name: string; result: unknown }[];
  actions: AgentSideEffect | { type: "none" };
}

export type VautoAgentStreamEvent =
  | { type: "status"; message: string }
  | { type: "tool_call"; name: string; message: string }
  | { type: "tool_result"; name: string }
  | { type: "error"; code: string; message: string };

export interface RunVautoAgentOptions {
  onEvent?: (event: VautoAgentStreamEvent) => void;
}

function emitAgentEvent(
  onEvent: RunVautoAgentOptions["onEvent"],
  event: VautoAgentStreamEvent
): void {
  try {
    onEvent?.(event);
  } catch {
    /* stream consumer error */
  }
}

function toolProgressMessage(name: string): string {
  const labels: Record<string, string> = {
    clearAllFilters: "Atidarau visą katalogą…",
    applyFilter: "Pritaikau filtrus…",
    openListingForm: "Ruošiu skelbimo formą…",
    navigateTo: "Perkeliu jus…",
    searchListings: "Ieškau turguje…",
    createUserRequirement: "Užfiksuoju jūsų norą…",
    create_listing_draft: "Ruošiu skelbimo juodraštį…",
    postNewListing: "Kuriu skelbimą…",
    analyzeWardrobePhoto: "Analizuoju nuotrauką…",
    importWardrobeProfile: "Importuoju spintą…",
    updateUIFilters: "Tikslinu paiešką…",
    navigateToScreen: "Atidarau ekraną…",
    proposeSmartBargaining: "Derinuosi…",
    markListingSold: "Archyvuoju skelbimą…",
    analyzeMarketPrice: "Tikrinu rinkos kainą…",
    scanListingPhotos: "Skenuoju nuotraukas…",
  };
  return labels[name] ?? "Dirbu su jūsų užklausa…";
}

function pickQuickReplies(candidates: unknown): string[] | undefined {
  if (!Array.isArray(candidates)) return undefined;
  const chips = candidates.map((c) => String(c).trim()).filter(Boolean).slice(0, 4);
  return chips.length >= 2 ? chips : undefined;
}

function resolveAgentQuickReplies(
  toolCalls: { name: string; result: unknown }[],
  actions: AgentSideEffect | { type: "none" }
): string[] | undefined {
  for (const call of [...toolCalls].reverse()) {
    const result = call.result as Record<string, unknown> | undefined;
    if (!result || typeof result !== "object") continue;
    const fromTool = pickQuickReplies(result.quickReplies ?? result.choiceChips);
    if (fromTool) return fromTool;
  }

  if (actions.type === "empty_search") {
    return [...EMPTY_SEARCH_QUICK_REPLIES];
  }

  return undefined;
}

const BUDDY_REPEAT_PROMPT =
  "Atsiprašau, ne viską aiškiai išgirdau. Ar galėtumėte pakartoti komandą?";

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

const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite"] as const;
const MAX_TOOL_ROUNDS = 5;
const GEMINI_RETRY_STATUSES = new Set([429, 503]);
const GEMINI_MAX_RETRIES = 2;
const GEMINI_RETRY_BASE_MS = 400;

function isRetriableAgentError(e: unknown): boolean {
  return (
    e instanceof AgentRouteError &&
    typeof e.geminiStatus === "number" &&
    GEMINI_RETRY_STATUSES.has(e.geminiStatus)
  );
}

const sleepMs = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export async function runVautoAgent(
  req: VautoAgentRequest,
  options?: RunVautoAgentOptions
): Promise<VautoAgentResponse> {
  try {
    return await runVautoAgentInner(req, options?.onEvent);
  } catch (e) {
    console.warn("[vauto-agent] run failed:", e);
    if (e instanceof AgentRouteError && e.code === "agent_unavailable") throw e;
    return {
      ok: true,
      reply: BUDDY_REPEAT_PROMPT,
      toolCalls: [],
      actions: { type: "none" },
    };
  }
}

async function runVautoAgentInner(
  req: VautoAgentRequest,
  onEvent?: RunVautoAgentOptions["onEvent"]
): Promise<VautoAgentResponse> {
  emitAgentEvent(onEvent, { type: "status", message: "Galvoju…" });

  if (req.authUserId) {
    const [prefs, dbBehavior] = await Promise.all([
      getUserPreferences(req.authUserId),
      getRecentUserBehaviorEvents(req.authUserId, 15),
    ]);
    if (prefs) {
      if (!req.context.defaultRegion && prefs.defaultRegion) {
        req.context.defaultRegion = prefs.defaultRegion;
      }
      if (!req.context.primaryVehicle && prefs.primaryVehicle) {
        req.context.primaryVehicle = prefs.primaryVehicle as {
          make: string;
          model: string;
          year: number;
        };
      }
      if (prefs.preferredSizes?.length) {
        const existing = req.context.activeSearchFilters ?? {};
        const hasSize = existing.refinements?.some((r) => r.startsWith("size:"));
        if (!hasSize) {
          req.context.activeSearchFilters = {
            ...existing,
            refinements: [
              ...(existing.refinements ?? []),
              `size:${prefs.preferredSizes[0]}`,
            ],
          };
        }
      }
    }
    if (dbBehavior.length && (!req.context.behaviorHistory?.length)) {
      req.context.behaviorHistory = dbBehavior.map((e) => ({
        type: e.type,
        at: e.at,
        payload: e.payload,
      }));
    }
  }

  const lastUserText = normalizeSecretaryQuery(
    [...(req.messages ?? [])].reverse().find((m) => m.role === "user")?.text
  );

  const listingDraft = req.context.listingDraft;

  const inputRoute = resolveStructuredListingInputRoute(lastUserText, {
    hasListingDraft: Boolean(listingDraft),
  });

  if (inputRoute.kind === "publish_gateway" && listingDraft && lastUserText) {
    const gateway = resolvePrePublishGatewayResponse({
      isAuthenticated: req.context.isAuthenticated,
      profilePhone: req.context.profilePhone,
      profileEmail: req.context.profileEmail,
      userCity: req.context.userCity,
      contact: req.context.contact,
      listingDraft,
      pendingImageUrls: req.context.pendingImageUrls,
    });
    return {
      ok: true,
      reply: gateway.reply,
      ...(gateway.quickReplies ? { quickReplies: gateway.quickReplies } : {}),
      ...(gateway.prePublishCard ? { prePublishCard: gateway.prePublishCard } : {}),
      toolCalls: [],
      actions: { type: "none" },
    };
  }

  const inListingChat =
    Boolean(listingDraft) &&
    Boolean(lastUserText) &&
    inputRoute.kind === "listing_field_update" &&
    isListingConversationInput(lastUserText, listingDraft);

  if (inListingChat && listingDraft) {
    const price = parsePriceFromChatInput(lastUserText);
    if (price != null) {
      return {
        ok: true,
        reply: buildListingChatPriceReply(price, listingDraft),
        toolCalls: [],
        actions: {
          type: "listing_draft",
          listingDraft: normalizeListingDraftForAction(listingDraft, {
            price,
            contact: req.context.contact,
            userCity: req.context.userCity,
          }),
        },
      };
    }
  }

  if (
    isTooShortSecretaryQuery(lastUserText) &&
    !detectServerSellIntent(lastUserText)
  ) {
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
    buildVautoAgentSystemInstruction(),
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
    lastUserQuery: lastUserText || undefined,
    searchSessionReset: Boolean(req.context.searchSessionReset),
    monetization: resolveMonetizationState({
      userRole: req.context.userRole,
      billingPlan: req.context.monetization?.billingPlan,
      activeBoost: req.context.monetization?.activeBoost,
      walletBalance: req.context.monetization?.walletBalance,
    }),
    sellerMetrics: req.context.sellerMetrics,
  };

  const memoryBlock = buildAgentMemoryContextBlock(
    {
      defaultRegion: req.context.defaultRegion ?? ctx.userCity,
      primaryVehicle: req.context.primaryVehicle,
      activeSearchFilters: req.context.activeSearchFilters ?? null,
    } satisfies AgentMemoryPayload,
    lastUserText
  );

  const behaviorBlock = buildUserBehaviorContextBlock(
    req.context.behaviorHistory?.map((e) => ({
      type: e.type,
      at: e.at,
      payload: e.payload,
    }))
  );

  // Deterministic browse-all — skip Gemini for generic “show everything” queries.
  if (lastUserText && resolveBrowseAllIntent(lastUserText)) {
    emitAgentEvent(onEvent, { type: "tool_call", name: "searchListings", message: "Ruošiu visus skelbimus…" });
    const { result, sideEffect } = await executeAgentTool(
      "searchListings",
      { query: lastUserText },
      ctx
    );
    emitAgentEvent(onEvent, { type: "tool_result", name: "searchListings" });
    if (sideEffect?.type === "browse_all") {
      return {
        ok: true,
        reply: sideEffect.replyMessage || buildBrowseAllReply(sideEffect.listingCount),
        toolCalls: [{ name: "searchListings", result }],
        actions: sideEffect,
      };
    }
  }

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
  if (req.context.sellerMetrics) {
    wizardBits.push(`sellerMetrics=${JSON.stringify(req.context.sellerMetrics)}`);
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

  if (req.context.proactiveOffer?.kind === "search_refine") {
    const po = req.context.proactiveOffer;
    contents.unshift({
      role: "user",
      parts: [
        {
          text: `[Search Refinement — per daug rezultatų]\n${SEARCH_REFINE_HINT}\nquery=${po.query ?? req.context.lastSearchQuery ?? ""}\nresultCount=${po.resultCount ?? req.context.searchResultCount ?? ""}\nfilters=${JSON.stringify(req.context.activeSearchFilters ?? po.filters ?? null)}`,
        },
      ],
    });
  }

  if (
    !resolveBrowseAllIntent(lastUserText) &&
    !resolveBrowseAllIntent(req.context.lastSearchQuery ?? "") &&
    (req.context.proactiveOffer?.kind === "no_match" ||
      req.context.searchResultCount === 0)
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

  const supervisorState = resolveSupervisorStateFromRequest(
    {
      ...req.context,
      userName: req.context.userName,
      isAuthenticated: req.context.isAuthenticated,
      accountType: req.context.accountType,
      userRole: req.context.userRole,
      userCity: req.context.userCity,
    },
    req.authUserId
  );
  contents.unshift({
    role: "user",
    parts: [{ text: buildSupervisorStateInjectionBlock(supervisorState) }],
  });

  const toolCalls: { name: string; result: unknown }[] = [];
  let sideEffect: AgentSideEffect | undefined;
  let navigateEffect: AgentSideEffect | undefined;
  let microPaymentEffect: AgentSideEffect | undefined;
  let uiFilterEffect: AgentSideEffect | undefined;
  let navigateScreenEffect: AgentSideEffect | undefined;
  let offerEffect: AgentSideEffect | undefined;
  let draftText = "";
  const forceSupervisorTools = shouldForceSupervisorTools(lastUserText);

  const hasGemini = Boolean(resolveGeminiApiKey());
  let lastGeminiError: AgentRouteError | null = null;
  let activeModel: (typeof GEMINI_MODELS)[number] = GEMINI_MODELS[0];

  if (!hasGemini) {
    throw new AgentRouteError(
      "agent_unavailable",
      "GEMINI_API_KEY nenustatytas serveryje",
      503
    );
  }

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    let parts: GeminiPart[] = [];
    let text = "";
    const toolMode = round === 0 && forceSupervisorTools ? "ANY" : "AUTO";

    emitAgentEvent(onEvent, {
      type: "status",
      message: round === 0 ? "Analizuoju užklausą…" : "Tęsiu darbą…",
    });

    let succeeded = false;
    for (const model of GEMINI_MODELS) {
      for (let attempt = 0; attempt <= GEMINI_MAX_RETRIES; attempt++) {
        try {
          const turn = await geminiSupervisorTurn(
            contents,
            model,
            systemInstruction,
            toolMode
          );
          parts = turn.parts;
          text = turn.text;
          activeModel = model;
          lastGeminiError = null;
          succeeded = true;
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
          const canRetry =
            attempt < GEMINI_MAX_RETRIES && isRetriableAgentError(lastGeminiError);
          console.warn(
            `[vauto-agent] ${model} attempt ${attempt + 1}${canRetry ? " (will retry)" : ""}:`,
            lastGeminiError.message
          );
          if (!canRetry) break;
          await sleepMs(GEMINI_RETRY_BASE_MS * 2 ** attempt);
        }
      }
      if (succeeded) break;
    }

    if (!succeeded) break;

    const functionCalls = extractGeminiFunctionCalls(parts);

    if (!functionCalls.length) {
      if (round === 0 && forceSupervisorTools) {
        emitAgentEvent(onEvent, {
          type: "tool_call",
          name: "searchListings",
          message: "Atfiltruoju katalogą…",
        });
        const deterministic = await runDeterministicSupervisorSearch(
          lastUserText,
          ctx
        );
        toolCalls.push({
          name: deterministic.toolName,
          result: deterministic.result,
        });
        if (deterministic.sideEffect) {
          if (deterministic.sideEffect.type === "apply_ui_filters") {
            uiFilterEffect = deterministic.sideEffect;
          } else if (shouldReplaceSideEffect(sideEffect, deterministic.sideEffect)) {
            sideEffect = deterministic.sideEffect;
          }
        }
        emitAgentEvent(onEvent, {
          type: "tool_result",
          name: deterministic.toolName,
        });
      }
      draftText = text || draftText;
      break;
    }

    contents.push({ role: "model", parts: functionCalls });

    const responseParts: GeminiPart[] = [];
    for (const fc of functionCalls) {
      const { name, args } = fc.functionCall;
      emitAgentEvent(onEvent, {
        type: "tool_call",
        name,
        message: toolProgressMessage(name),
      });
      if (name === "postNewListing") {
        const toolArgs = (args ?? {}) as Record<string, unknown>;
        const imageUrls = Array.isArray(toolArgs.imageUrls)
          ? toolArgs.imageUrls.map(String)
          : [];
        const prePublish = evaluateServerPrePublishReadiness({
          isAuthenticated: req.context.isAuthenticated,
          profilePhone: req.context.profilePhone,
          profileEmail: req.context.profileEmail,
          userCity: req.context.userCity,
          contact: ctx.contact,
          listingDraft: ctx.listingDraft,
          pendingImageUrls: req.context.pendingImageUrls,
          imageUrl: imageUrls[0] ?? "",
        });
        if (!prePublish.ok) {
          draftText = prePublish.blockMessage;
          responseParts.push({
            functionResponse: {
              name,
              response: {
                ok: false,
                blocked: true,
                message: prePublish.blockMessage,
              },
            },
          });
          continue;
        }
      }
      const { result, sideEffect: fx } = await executeAgentTool(
        name,
        args ?? {},
        ctx
      );
      emitAgentEvent(onEvent, { type: "tool_result", name });
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
        } else if (shouldReplaceSideEffect(sideEffect, fx)) {
          sideEffect = fx;
        }
      }
      responseParts.push({ functionResponse: { name, response: result } });
    }

    contents.push({ role: "user", parts: responseParts });
    if (text) draftText = text;
  }

  const ranSupervisorSearch =
    forceSupervisorTools ||
    toolCalls.some((t) =>
      ["searchListings", "applyFilter", "clearAllFilters", "updateUIFilters"].includes(
        t.name
      )
    );
  if (
    ranSupervisorSearch &&
    (!draftText.trim() || isGenericEmptySearchReply(draftText))
  ) {
    try {
      const polish = await geminiSupervisorTurn(
        contents,
        activeModel,
        systemInstruction,
        "NONE"
      );
      if (polish.text.trim() && !isGenericEmptySearchReply(polish.text)) {
        draftText = polish.text;
      }
    } catch {
      // keep tool-driven labels
    }
  }

  let finalText = draftText;

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

  const businessToolCall = toolCalls.find(
    (t) => t.name === "getBusinessInsights" || t.name === "listServiceLeads"
  );
  const businessToolResult = businessToolCall?.result as { message?: string } | undefined;
  if (businessToolResult?.message) {
    finalText = businessToolResult.message;
  }

  const wardrobeToolCall = toolCalls.find(
    (t) => t.name === "analyzeWardrobePhoto" || t.name === "importWardrobeProfile"
  );
  const wardrobeToolResult = wardrobeToolCall?.result as { message?: string } | undefined;
  if (wardrobeToolResult?.message) {
    finalText = wardrobeToolResult.message;
  }

  const trustToolCall = toolCalls.find((t) => t.name === "getSellerTrustScore");
  const trustToolResult = trustToolCall?.result as { message?: string; ok?: boolean } | undefined;
  if (trustToolResult?.ok && trustToolResult.message) {
    finalText = trustToolResult.message;
  }

  const negotiationToolCall = toolCalls.find((t) => t.name === "analyzeNegotiationTwin");
  const negotiationToolResult = negotiationToolCall?.result as { message?: string; ok?: boolean } | undefined;
  if (negotiationToolResult?.ok && negotiationToolResult.message) {
    finalText = negotiationToolResult.message;
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
  const browseAllSideEffect =
    sideEffect?.type === "browse_all" ? sideEffect : undefined;
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
    sideEffect?.type === "wardrobe_bulk" ||
    toolCalls.some(
      (t) =>
        t.name === "create_listing_draft" ||
        t.name === "postNewListing" ||
        t.name === "analyzeWardrobePhoto" ||
        t.name === "importWardrobeProfile"
    );

  const applyFilterCall = toolCalls.find(
    (t) => t.name === "applyFilter" || t.name === "clearAllFilters"
  );
  const hasUiDrivingTool = Boolean(
    uiFilterCall || navigateScreenCall || applyFilterCall || searchToolCall
  );
  const hasOfferTool = Boolean(requirementCall || bargainCall);

  if (
    !hasListingDraftAction &&
    !hasOfferTool &&
    (searchToolCall ||
      searchSideEffect ||
      emptySearchSideEffect ||
      browseAllSideEffect ||
      uiFilterEffect ||
      applyFilterCall)
  ) {
    finalText = resolveSupervisorFinalReply({
      draftText: finalText,
      toolCalls,
      sideEffect,
      uiFilterEffect,
      browseAllSideEffect,
      searchToolCount,
      lastUserQuery: lastUserText,
    });
  }

  const resolvedAction =
    offerEffect ??
    uiFilterEffect ??
    navigateScreenEffect ??
    sideEffect ??
    microPaymentEffect ??
    navigateEffect ??
    ({ type: "none" } as const);

  const quickReplies = resolveAgentQuickReplies(toolCalls, resolvedAction);

  if (!finalText && sideEffect?.type === "listing_draft") {
    const ld = sideEffect.listingDraft;
    finalText = buildListingDraftUpdateReply({
      category: ld.category ?? "other",
      title: ld.title?.trim() || "Naujas skelbimas",
      description: ld.description,
      price: ld.price,
      location: ld.location,
      attributes: (ld.attributes as Record<string, string> | undefined) ?? {},
    });
  }

  if (!finalText && sideEffect?.type === "wardrobe_bulk") {
    finalText =
      sideEffect.voiceAnnouncement ??
      "Paruošiau drabužių juodraščius — peržiūrėkite ir patvirtinkite formą.";
  }

  if (
    !finalText &&
    resolvedAction.type === "listing_draft" &&
    "listingDraft" in resolvedAction
  ) {
    const ld = resolvedAction.listingDraft;
    finalText = buildListingDraftUpdateReply({
      category: ld.category ?? "other",
      title: ld.title?.trim() || "Naujas skelbimas",
      description: ld.description,
      price: ld.price,
      location: ld.location,
      attributes: (ld.attributes as Record<string, string> | undefined) ?? {},
    });
  }

  const listingDraftForReply =
    sideEffect?.type === "listing_draft"
      ? sideEffect.listingDraft
      : resolvedAction.type === "listing_draft" && "listingDraft" in resolvedAction
        ? resolvedAction.listingDraft
        : null;
  if (finalText && listingDraftForReply) {
    finalText = ensureRichListingDraftReply(finalText, {
      category: listingDraftForReply.category ?? "other",
      title: listingDraftForReply.title?.trim() || "Naujas skelbimas",
      description: listingDraftForReply.description,
      price: listingDraftForReply.price,
      location: listingDraftForReply.location,
      attributes:
        (listingDraftForReply.attributes as Record<string, string> | undefined) ??
        {},
    });
  }

  if (
    !finalText &&
    detectServerSellIntent(lastUserText)
  ) {
    const fallback = buildSellListingDraftFallback(lastUserText, {
      userCity: req.context.userCity,
      contact: req.context.contact,
    });
    return {
      ok: true,
      reply: fallback.reply,
      quickReplies: fallback.quickReplies,
      toolCalls,
      actions: fallback.action,
    };
  }

  if (!finalText) {
    if (lastGeminiError) {
      return {
        ok: true,
        reply: BUDDY_REPEAT_PROMPT,
        quickReplies,
        toolCalls,
        actions: resolvedAction,
      };
    }
    return {
      ok: true,
      reply: BUDDY_REPEAT_PROMPT,
      quickReplies,
      toolCalls,
      actions: resolvedAction,
    };
  }

  if (!finalText.trim()) {
    return {
      ok: true,
      reply: BUDDY_REPEAT_PROMPT,
      quickReplies,
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
    quickReplies,
    toolCalls,
    actions: resolvedAction,
  };
}
