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
  sanitizePromptUserInput,
  wrapUntrustedXml,
} from "../shared/prompt-injection.js";
import {
  buildSellListingDraftFallback,
  buildSellClarificationReply,
  detectServerSellIntent,
  isJobSeekerListingCreateIntent,
  isSparseSellRequest,
} from "./sell-intent-fallback.js";
import { extractVehicleSpecsFromChat, buildVehicleDescriptionFromAttributes } from "./vehicle-attribute-extract.js";
import {
  applyVinExtractionCandidate,
  applyVinStructuredReviewAction,
  buildVinReviewDisplayChips,
  buildVinReviewSideEffect,
  type VinReviewOutcome,
  type VinReviewStructuredAction,
} from "../vehicle/vin-review.js";
import {
  consumeVinChallenge,
  ensureVinReviewChallenge,
  rejectVinChallenge,
  type VinChallengeOutcome,
} from "../vehicle/vin-challenge.js";
import {
  buildConfirmedVinAttributesPatch,
} from "../vehicle/vin-confirmation.js";
import { normalizeVin } from "../vehicle/vin-utils.js";
import {
  applyNaturalLanguageDescriptionEdits,
  isListingConversationInput,
  normalizeListingDraftForAction,
  parsePriceFromChatInput,
} from "./listing-chat-input.js";
import {
  buildBrowseAllReply,
  isBrowseAllIntent,
  isListingConfirmationPhrase,
  resolveBrowseAllIntent,
} from "../lib/browse-all-intent.js";
import { VAUTO_IN_DOMAIN_RECOVERY } from "../shared/vauto-domain-autonomy.js";
import {
  evaluateTextSafetyGate,
  replyForTextSafetyGate,
  scrubProfanity,
} from "./safety-shield.js";
import { evaluateServerPrePublishReadiness } from "./pre-publish-validation.js";
import {
  resolveContactCaptureResponse,
  resolvePrePublishGatewayResponse,
  resolveStructuredListingInputRoute,
} from "./structured-input-pipeline.js";
import { resolveChatMediaAttachmentResponse } from "./chat-media-upload.js";
import {
  extractPendingChatDocuments,
  mergeDocumentFactsIntoAttributes,
} from "./document-text-extract.js";
import {
  AWAITING_PHOTOS_NUDGE,
  buildConversationalMissingPrompt,
  buildDraftReadyChatReply,
  buildDraftingCompletePhotosPrompt,
  buildPostVisionHeroMessage,
  stripStaleChatPromptTails,
  dispatchListingFlowTurn,
  inferListingFlowState,
  isHeroFlowLocked,
  isPublishReadyIntent,
  isVisionObjectSellChip,
  nounFromVisionObjectSellChip,
  PRE_PUBLISH_CARD_INTRO,
  TEXT_DRAFT_READY_CHIPS,
  shouldBypassPhotosNudge,
  transitionListingFlow,
} from "./listing-conversational-flow.js";
import { isVehicleSalesCopyConfirmIntent } from "../shared/vehicle-sales-copy.js";
import { ensureRichSalesCopyBeforePublish } from "../shared/ensure-rich-sales-copy.js";
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
import {
  isRevealActiveResultsIntent,
  isResultSelectionIntent,
  listingPathForId,
  resolveRecentListingSelection,
} from "../shared/search-fast-path.js";
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
      orderedImageUrls?: string[];
      listingFlowState?:
        | "DRAFTING_TEXT"
        | "AWAITING_PHOTOS"
        | "DRAFT_READY"
        | "AWAITING_CONFIRMATION";
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
    omitPriorListingDraft?: boolean;
    freshListingSession?: boolean;
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
    /** Recent pinned search hit IDs for instant selection fast-path. */
    recentSearchListingIds?: string[];
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
    pendingImageCount?: number;
    /** PDF/DOC/TXT uploads — extracted into draftListing document facts. */
    pendingDocuments?: {
      fileName?: string;
      mimeType?: string;
      text?: string;
      dataUrl?: string;
    }[];
    /** Trusted structured VIN review action from the client UI — never parsed from chat text. */
    vinReviewAction?: VinReviewStructuredAction;
    geoCityHint?: string;
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
  prePublishRequirements?: import("./pre-publish-validation.js").ServerPrePublishRequirementsPayload;
  toolCalls: { name: string; result: unknown }[];
  actions: AgentSideEffect | { type: "none" };
}

export type VautoAgentStreamEvent =
  | { type: "status"; message: string }
  | { type: "tool_call"; name: string; message: string }
  | { type: "tool_result"; name: string }
  /** Instant chat ack while Vision / PDF workers run (<500ms hot path). */
  | {
      type: "early_ack";
      reply: string;
      quickReplies?: string[];
    }
  /** Progressive PrePublish draft fill from async Vision / OCR. */
  | {
      type: "draft_update";
      listingDraft: NonNullable<VautoAgentRequest["context"]["listingDraft"]>;
      reply?: string;
    }
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

/**
 * Phase 2B — real year-conflict resolution state machine (not just detection).
 *
 * While a conflict is pending (`yearConflict === "true"` from a prior turn), the
 * one-question-per-turn policy guarantees the assistant's last question was this
 * exact clarification — so a new year mention this turn IS the user's answer to
 * it, never an arbitrary unrelated fact. Only an explicit choice of one of the two
 * disputed values (A = prior canonical, B = prior candidate) resolves the
 * conflict; a genuinely different third year is discarded (never silently
 * accepted) and the conflict stays open. An unrelated turn (no year mentioned)
 * leaves the pending conflict markers completely untouched.
 *
 * Returns only the attribute keys that must change. `yearConflict` /
 * `yearConflictCandidate` set to `""` are resolution tombstones — the caller
 * strips them to a genuinely absent key so `factsFromAttributes` reads "no
 * conflict" (an empty string would otherwise still count as a present value).
 */
export function resolveYearConflictPatch(input: {
  priorAttributes?: Record<string, string | undefined>;
  incomingYear?: string;
}): Record<string, string> {
  const priorAttrs = input.priorAttributes ?? {};
  const priorYearConflict = String(priorAttrs.yearConflict ?? "") === "true";
  const priorCanonicalYear = String(priorAttrs.year ?? "").trim();
  const priorCandidateYear = String(priorAttrs.yearConflictCandidate ?? "").trim();
  const incomingYear = String(input.incomingYear ?? "").trim();

  if (priorYearConflict) {
    if (!incomingYear) {
      // Unrelated field/message update this turn — preserve the pending conflict verbatim.
      return {};
    }
    if (incomingYear === priorCanonicalYear || incomingYear === priorCandidateYear) {
      // Explicit choice of A or B — resolve and clear both markers.
      return { year: incomingYear, yearConflict: "", yearConflictCandidate: "" };
    }
    // Ambiguous third year — remain unresolved safely; discard the stray value
    // rather than silently overwriting either disputed candidate.
    return {
      year: priorCanonicalYear,
      yearConflict: "true",
      yearConflictCandidate: priorCandidateYear,
    };
  }

  // No conflict pending — detect a fresh one instead of silently overwriting.
  const freshConflict =
    Boolean(priorCanonicalYear) &&
    Boolean(incomingYear) &&
    priorCanonicalYear !== incomingYear;
  if (freshConflict) {
    return {
      year: priorCanonicalYear,
      yearConflict: "true",
      yearConflictCandidate: incomingYear,
    };
  }

  return {};
}

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
      reply: VAUTO_IN_DOMAIN_RECOVERY,
      toolCalls: [],
      actions: { type: "none" },
    };
  }
}

/**
 * Phase 2C — user-facing replies are driven by the reducer's TYPED outcome,
 * never by the action type alone: a stale/no-op action must never claim success.
 */
function vinReviewOutcomeReply(
  outcome: VinReviewOutcome,
  action: VinReviewStructuredAction
): string {
  switch (outcome) {
    case "applied":
      return action.type === "confirm"
        ? "VIN kodas patvirtintas."
        : action.type === "reject"
          ? "Gerai — VIN kodo nefiksuoju šiuo metu."
          : "VIN kandidatas atnaujintas — patvirtinkite, kai būsite pasiruošę.";
    case "rejected":
      return "Gerai — VIN kodo nefiksuoju šiuo metu.";
    case "stale_review":
      return "Šis VIN veiksmas nebegalioja — peržiūrėkite naujausią siūlomą variantą.";
    case "invalid_value":
      return "Įvestas VIN neatpažintas — patikrinkite simbolius (17 ženklų, be I/O/Q).";
    case "not_found":
      return "Šiuo metu nėra laukiančio VIN kandidato.";
    case "already_applied":
      return "VIN kodas jau buvo patvirtintas.";
    default:
      return "VIN peržiūra atnaujinta.";
  }
}

/**
 * Phase 2C Round 4 — server challenge verification failures are never reported
 * as success.
 */
function vinChallengeOutcomeReply(outcome: VinChallengeOutcome): string {
  switch (outcome) {
    case "challenge_not_found":
      return "VIN peržiūros užklausa nerasta — patvirtinkite iš naujo.";
    case "challenge_expired":
      return "VIN peržiūros užklausa nebegalioja — patvirtinkite iš naujo.";
    case "wrong_user":
      return "VIN peržiūros užklausa priklauso kitam vartotojui.";
    case "wrong_listing":
      return "VIN peržiūros užklausa neatitinka šio skelbimo.";
    case "wrong_vin":
      return "Patvirtinamas VIN neatitinka serverio užregistruoto kandidato.";
    case "choice_not_allowed":
      return "Pasirinktas VIN neįtrauktas į serverio leidžiamų pasirinkimų sąrašą.";
    case "stale_generation":
      return "VIN kandidatas pasikeitė — patvirtinkite naujausią variantą.";
    case "already_confirmed":
      return "VIN kodas jau buvo patvirtintas.";
    case "confirmed":
      return "VIN kodas patvirtintas.";
    case "rejected":
      return "VIN kodas atmestas.";
    default:
      return "VIN peržiūra atnaujinta.";
  }
}

async function runVautoAgentInner(
  req: VautoAgentRequest,
  onEvent?: RunVautoAgentOptions["onEvent"]
): Promise<VautoAgentResponse> {
  emitAgentEvent(onEvent, { type: "status", message: "Galvoju…" });

  // P0-3 — New listing / seller chat: absolute search isolation (no sticky filters,
  // preferredSizes, category pins, or legacy query bleed into sell mode).
  const isolateSellerFromSearch =
    Boolean(req.context.freshListingSession) ||
    Boolean(req.context.searchSessionReset) ||
    Boolean(req.context.omitPriorListingDraft);
  if (isolateSellerFromSearch) {
    req.context.activeSearchFilters = null;
    req.context.lastSearchQuery = undefined;
    req.context.searchResultCount = undefined;
    req.context.recentSearchListingIds = undefined;
  }

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
      // Never re-seed preferredSizes / size pins during a fresh seller listing session.
      if (prefs.preferredSizes?.length && !isolateSellerFromSearch) {
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

  const lastUserTextRaw = normalizeSecretaryQuery(
    [...(req.messages ?? [])].reverse().find((m) => m.role === "user")?.text
  );

  /**
   * SYNC Safety Shield — run BEFORE any early_ack / draft_update / Vision.
   * Scan recent user messages so photo-only placeholders cannot bypass a prior
   * "replika" / toxic claim in the same session.
   */
  const isMediaPlaceholder = (t: string) =>
    !t ||
    /^\[?(nuotraukos?\s+įkeltos?|dokumentas\s+įkeltas)[^\]]*\]?$/i.test(t.trim());

  const recentUserTexts = (req.messages ?? [])
    .filter((m) => m.role === "user")
    .map((m) => normalizeSecretaryQuery(m.text))
    .filter((t) => t && !isMediaPlaceholder(t))
    .slice(-8);

  const draftHayForSafety = [
    req.context.listingDraft?.title,
    req.context.listingDraft?.description,
  ]
    .map((s) => String(s ?? "").trim())
    .filter(Boolean)
    .join(" ");

  const safetyCandidates = [
    ...recentUserTexts,
    ...(draftHayForSafety ? [draftHayForSafety] : []),
    ...(lastUserTextRaw && !isMediaPlaceholder(lastUserTextRaw)
      ? [lastUserTextRaw]
      : []),
  ];

  for (const candidate of safetyCandidates) {
    const textSafety = evaluateTextSafetyGate(candidate);
    if (textSafety) {
      return {
        ok: true,
        reply: replyForTextSafetyGate(textSafety),
        quickReplies: [],
        toolCalls: [
          {
            name: "safetyShield",
            result: { ok: false, gate: textSafety.kind, sync: true },
          },
        ],
        actions: { type: "none" },
      };
    }
  }

  const lastUserText = scrubProfanity(lastUserTextRaw);

  let listingDraft = req.context.listingDraft;
  const pendingChatImages = req.context.pendingImageUrls?.filter(Boolean).slice(0, 10);
  const pendingDocs = req.context.pendingDocuments?.filter(Boolean) ?? [];
  if (pendingDocs.length) {
    const { DOCUMENT_OPTIMISTIC_ACK } = await import("../shared/intents/index.js");
    emitAgentEvent(onEvent, {
      type: "early_ack",
      reply: DOCUMENT_OPTIMISTIC_ACK,
    });
    emitAgentEvent(onEvent, {
      type: "status",
      message: "Skaitau dokumentą…",
    });
  }
  const extractedDocuments = await extractPendingChatDocuments(pendingDocs);
  if (extractedDocuments.length) {
    const mergedAttrs = mergeDocumentFactsIntoAttributes(
      (listingDraft?.attributes as Record<string, string> | undefined) ?? undefined,
      extractedDocuments
    );
    const names = extractedDocuments.map((d) => d.fileName).join(", ");
    const nextFlow =
      listingDraft?.listingFlowState ??
      (pendingChatImages?.length ? "AWAITING_PHOTOS" : "DRAFTING_TEXT");
    const documentDraft = normalizeListingDraftForAction(
      {
        ...(listingDraft ?? {
          title: "Naujas skelbimas",
          description: "",
          price: 0,
          location: req.context.userCity || "",
          category: "other",
        }),
        attributes: mergedAttrs,
        listingFlowState: nextFlow,
      },
      {
        contact: req.context.contact,
        userCity: req.context.userCity,
        listingFlowState: nextFlow,
      }
    );
    listingDraft = documentDraft;
    req.context.listingDraft = documentDraft;

    // Document-only turn: sync facts into draft and confirm in chat (no vision scan).
    if (!pendingChatImages?.length) {
      const badge = extractedDocuments
        .map((d) => `📄 Dokumentas įkeltas: ${d.fileName}`)
        .join("\n");
      return {
        ok: true,
        reply: `${badge}\n\nPerskaičiau turinį ir įrašiau į juodraštį. Parašyk kainą, miestą ar ką skelbi — papildysiu.`,
        quickReplies: TEXT_DRAFT_READY_CHIPS.slice(0, 4),
        toolCalls: [
          {
            name: "ingestChatDocuments",
            result: {
              ok: true,
              fileNames: extractedDocuments.map((d) => d.fileName),
              textChars: extractedDocuments.reduce(
                (n, d) => n + d.text.length,
                0
              ),
            },
          },
        ],
        actions: {
          type: "listing_draft",
          listingDraft: documentDraft,
        },
      };
    }
    console.log("[document-extract] merged into draft before vision", {
      names,
      textChars: extractedDocuments.reduce((n, d) => n + d.text.length, 0),
    });
  }
  const draftPhotoCount = Array.isArray(
    (listingDraft as { orderedImageUrls?: unknown } | null | undefined)
      ?.orderedImageUrls
  )
    ? ((listingDraft as { orderedImageUrls: unknown[] }).orderedImageUrls.length)
    : 0;
  // Prefer explicit SM state. If state was dropped by a stale client patch but
  // draft already has photos, recover as DRAFT_READY — never re-open photos nudge.
  // Do not count this-turn pending uploads (Vision has not run yet).
  const flowState = inferListingFlowState({
    listingFlowState: listingDraft?.listingFlowState,
    hasDraft: Boolean(listingDraft?.title?.trim() || listingDraft),
    photoCount: draftPhotoCount,
  });

  // Constitution L4: pastomatas logistics — only outside active listing drafting/photos.
  {
    const folded = lastUserText.toLowerCase();
    const wantsPastomatas =
      /\bpa[sš]tomat/.test(folded) || /\bomniva\b/.test(folded);
    const sessionKey =
      req.context.contact?.trim() ||
      req.context.profilePhone?.trim() ||
      req.context.userName ||
      "anon";
    const { getPastomatasSession, setPastomatasSession, clearPastomatasSession } =
      await import("../shared/pastomatas-session.js");
    const existing = getPastomatasSession(sessionKey);
    const listingBusy =
      flowState === "DRAFTING_TEXT" ||
      flowState === "AWAITING_PHOTOS" ||
      flowState === "DRAFT_READY";
    if ((wantsPastomatas || existing) && !listingBusy) {
      const { startPastomatasGuide, advancePastomatasGuide } = await import(
        "../shared/pastomatas-agent.js"
      );
      if (!existing || (wantsPastomatas && existing.step === "label_ready")) {
        const pastomatasCity = (
          req.context.userCity ||
          req.context.geoCityHint ||
          ""
        ).trim();
        if (!pastomatasCity) {
          return {
            ok: true,
            reply: "Kuriame mieste ieškoti Omniva paštomato?",
            toolCalls: [{ name: "pastomatasGuide", result: { step: "ask_city" } }],
            actions: { type: "none" },
          };
        }
        const started = await startPastomatasGuide(pastomatasCity);
        setPastomatasSession(sessionKey, started.state);
        return {
          ok: true,
          reply: started.reply,
          toolCalls: [{ name: "pastomatasGuide", result: { step: started.state.step } }],
          actions: { type: "none" },
        };
      }
      const advanced = await advancePastomatasGuide(existing, lastUserText);
      if (advanced.done) clearPastomatasSession(sessionKey);
      else setPastomatasSession(sessionKey, advanced.state);
      return {
        ok: true,
        reply: advanced.reply,
        toolCalls: [{ name: "pastomatasGuide", result: { step: advanced.state.step } }],
        actions: { type: "none" },
      };
    }
  }

  const flowTurn = dispatchListingFlowTurn({
    state: flowState,
    userText: lastUserText,
    hasIncomingPhotos: Boolean(pendingChatImages?.length),
    photoCount: draftPhotoCount,
    hasDraft: Boolean(listingDraft?.title?.trim() || listingDraft),
  });

  /** Phase A: active listing SM owns the turn — no secretary/sell-intent hijack. */
  const listingSmActive =
    flowState === "DRAFTING_TEXT" ||
    flowState === "AWAITING_PHOTOS" ||
    flowState === "DRAFT_READY" ||
    flowState === "AWAITING_CONFIRMATION" ||
    flowTurn.kind === "process_photos";

  // Step 3 — „Paruošti skelbimą“ → synthesize rich copy + OPEN PrePublish review.
  // NEVER call postNewListing / DB publish here — user confirms in the modal.
  if (
    listingDraft &&
    lastUserText &&
    isVehicleSalesCopyConfirmIntent(lastUserText) &&
    !pendingChatImages?.length &&
    String(listingDraft.attributes?.salesCopyGenerated ?? "") !== "true"
  ) {
    const rich = ensureRichSalesCopyBeforePublish(listingDraft);
    const gateway = resolvePrePublishGatewayResponse({
      isAuthenticated: req.context.isAuthenticated,
      profilePhone: req.context.profilePhone,
      profileEmail: req.context.profileEmail,
      userCity: req.context.userCity,
      contact: req.context.contact,
      listingDraft: rich,
      pendingImageUrls: req.context.pendingImageUrls,
      geoCityHint: req.context.geoCityHint,
    });
    const nextFlowState = gateway.prePublishCard
      ? "AWAITING_CONFIRMATION"
      : "DRAFT_READY";
    const nextDraft = normalizeListingDraftForAction(rich, {
      contact: req.context.contact,
      userCity: req.context.userCity,
      listingFlowState: nextFlowState,
    });
    const warmAck = buildDraftReadyChatReply(nextDraft);
    const reply = gateway.prePublishCard
      ? warmAck
      : [warmAck, gateway.reply].filter(Boolean).join(" ");
    return {
      ok: true,
      reply,
      ...(gateway.prePublishCard
        ? { prePublishCard: gateway.prePublishCard }
        : { quickReplies: [...TEXT_DRAFT_READY_CHIPS] }),
      toolCalls: [],
      actions: {
        type: "listing_draft",
        listingDraft: nextDraft,
      },
    };
  }

  if (flowTurn.kind === "ignore_backward") {
    return {
      ok: true,
      reply: flowTurn.reply,
      toolCalls: [],
      actions: { type: "none" },
    };
  }

  if (flowTurn.kind === "nudge_photos") {
    // Text-first generate/sell — never hard-block; continue to Gemini tools below.
    if (
      shouldBypassPhotosNudge(lastUserText) ||
      pendingChatImages?.length ||
      draftPhotoCount > 0 ||
      isHeroFlowLocked(listingDraft?.listingFlowState)
    ) {
      // fall through to Vision / Gemini — never re-ask „prisegti nuotraukas“
    } else {
      return {
        ok: true,
        reply: flowTurn.reply || AWAITING_PHOTOS_NUDGE,
        toolCalls: [],
        actions: { type: "none" },
      };
    }
  }

  if (flowTurn.kind === "object_selected" && listingDraft) {
    const noun = isVisionObjectSellChip(lastUserText)
      ? nounFromVisionObjectSellChip(lastUserText)
      : "";
    const nextState =
      transitionListingFlow(
        (listingDraft.listingFlowState as
          | "DRAFTING_TEXT"
          | "AWAITING_PHOTOS"
          | "DRAFT_READY"
          | "AWAITING_CONFIRMATION"
          | null
          | undefined) ?? flowState,
        "OBJECT_SELECTED"
      ) ?? "AWAITING_CONFIRMATION";
    const patched = normalizeListingDraftForAction(
      {
        ...listingDraft,
        ...(noun
          ? { title: noun.charAt(0).toUpperCase() + noun.slice(1) }
          : {}),
        listingFlowState: nextState,
      },
      {
        contact: req.context.contact,
        userCity: req.context.userCity,
        listingFlowState: nextState,
      }
    );
    const gateway = resolvePrePublishGatewayResponse({
      isAuthenticated: req.context.isAuthenticated,
      profilePhone: req.context.profilePhone,
      profileEmail: req.context.profileEmail,
      userCity: req.context.userCity,
      contact: req.context.contact,
      listingDraft: patched,
      pendingImageUrls: req.context.pendingImageUrls,
      geoCityHint: req.context.geoCityHint,
    });
    return {
      ok: true,
      reply: gateway.reply || PRE_PUBLISH_CARD_INTRO,
      ...(gateway.prePublishCard ? { prePublishCard: gateway.prePublishCard } : {}),
      toolCalls: [],
      actions: {
        type: "listing_draft",
        listingDraft: patched,
      },
    };
  }

  if (flowTurn.kind === "show_confirmation" && listingDraft) {
    const priceFromMsg = parsePriceFromChatInput(lastUserText);
    const pricedDraft =
      priceFromMsg != null && !(Number(listingDraft.price) > 0)
        ? { ...listingDraft, price: priceFromMsg }
        : priceFromMsg != null
          ? { ...listingDraft, price: priceFromMsg }
          : listingDraft;
    // P0-2 — Attach Pass-2 / deferred / vehicle rich copy BEFORE PrePublish finalize.
    const draftForGate = ensureRichSalesCopyBeforePublish(pricedDraft);
    const gateway = resolvePrePublishGatewayResponse({
      isAuthenticated: req.context.isAuthenticated,
      profilePhone: req.context.profilePhone,
      profileEmail: req.context.profileEmail,
      userCity: req.context.userCity,
      contact: req.context.contact,
      listingDraft: draftForGate,
      pendingImageUrls: req.context.pendingImageUrls,
      geoCityHint: req.context.geoCityHint,
    });
    const nextFlowState = gateway.prePublishCard
      ? "AWAITING_CONFIRMATION"
      : "DRAFT_READY";
    const confirmedDraft = normalizeListingDraftForAction(draftForGate, {
      price: priceFromMsg ?? draftForGate.price,
      contact: req.context.contact,
      userCity: req.context.userCity,
      listingFlowState: nextFlowState,
    });
    return {
      ok: true,
      // Step 4 — open PrePublish silently (no chat chatter when card is ready).
      reply: gateway.prePublishCard
        ? ""
        : gateway.reply || PRE_PUBLISH_CARD_INTRO,
      ...(gateway.prePublishCard ? { prePublishCard: gateway.prePublishCard } : {}),
      ...(gateway.prePublishCard
        ? {}
        : { quickReplies: undefined }),
      toolCalls: [],
      actions: {
        type: "listing_draft",
        listingDraft: confirmedDraft,
      },
    };
  }

  if (pendingChatImages?.length && flowTurn.kind === "process_photos") {
    console.log("[vision] vauto-agent process_photos", {
      pendingCount: pendingChatImages.length,
      flowState,
      lastUserTextHead: lastUserText.slice(0, 120),
      imageKinds: pendingChatImages.map((u) =>
        u.startsWith("data:") ? `data(${u.length})` : u.startsWith("http") ? "http" : "other"
      ),
    });
    // P0 async Vision — ack chat immediately; Pass-1/Pass-2 continue on this stream.
    const { VISION_OPTIMISTIC_ACK } = await import("../shared/intents/index.js");
    const optimisticDraft = normalizeListingDraftForAction(
      {
        ...(listingDraft ?? {
          title: "Naujas skelbimas",
          description: "",
          price: 0,
          location: req.context.userCity || "",
          category: "other",
        }),
        orderedImageUrls: pendingChatImages.slice(0, 6),
        attributes: {
          ...((listingDraft?.attributes as Record<string, string> | undefined) ??
            {}),
          visionScanPending: "true",
          salesCopyGenerated: "false",
        },
        listingFlowState: "AWAITING_PHOTOS",
      },
      {
        contact: req.context.contact,
        userCity: req.context.userCity,
        listingFlowState: "AWAITING_PHOTOS",
      }
    );
    emitAgentEvent(onEvent, {
      type: "early_ack",
      reply: VISION_OPTIMISTIC_ACK,
    });
    emitAgentEvent(onEvent, {
      type: "draft_update",
      listingDraft: optimisticDraft,
      reply: VISION_OPTIMISTIC_ACK,
    });
    emitAgentEvent(onEvent, {
      type: "tool_call",
      name: "scanListingPhotos",
      message: toolProgressMessage("scanListingPhotos"),
    });
    try {
      const mediaResponse = await resolveChatMediaAttachmentResponse({
        imageUrls: pendingChatImages,
        listingDraft: optimisticDraft,
        userCity: req.context.userCity,
        contact: req.context.contact,
        userText: lastUserText,
        authUserId: req.authUserId,
      });
      emitAgentEvent(onEvent, {
        type: "tool_result",
        name: "scanListingPhotos",
      });
      if (mediaResponse) {
        if (
          mediaResponse.actions &&
          mediaResponse.actions.type === "listing_draft" &&
          "listingDraft" in mediaResponse.actions &&
          mediaResponse.actions.listingDraft
        ) {
          emitAgentEvent(onEvent, {
            type: "draft_update",
            listingDraft: mediaResponse.actions.listingDraft,
            reply: mediaResponse.reply,
          });
        }
        console.log("[vision] vauto-agent process_photos ok", {
          replyHead: mediaResponse.reply?.slice(0, 160),
          actionType: mediaResponse.actions?.type,
          toolNames: mediaResponse.toolCalls?.map((t) => t.name),
        });
        return mediaResponse;
      }
      console.warn("[vision] vauto-agent process_photos: null mediaResponse");
    } catch (err) {
      emitAgentEvent(onEvent, {
        type: "tool_result",
        name: "scanListingPhotos",
      });
      const errMessage = err instanceof Error ? err.message : String(err);
      console.error(
        `[vision] vauto-agent process_photos EXCEPTION ${JSON.stringify({
          errMessage,
          stack: err instanceof Error ? err.stack?.slice(0, 900) : undefined,
        })}`
      );
      // Fall through to Gemini / buddy fallback — error is now visible in Render logs.
    }
  }

  const prePublishSnapshot = listingDraft
    ? evaluateServerPrePublishReadiness({
        isAuthenticated: req.context.isAuthenticated,
        profilePhone: req.context.profilePhone,
        profileEmail: req.context.profileEmail,
        userCity: req.context.userCity,
        contact: req.context.contact,
        listingDraft,
        pendingImageUrls: req.context.pendingImageUrls,
        geoCityHint: req.context.geoCityHint,
      })
    : null;

  const inputRoute = resolveStructuredListingInputRoute(lastUserText, {
    hasListingDraft: Boolean(listingDraft),
    prePublishBlocked: Boolean(prePublishSnapshot && !prePublishSnapshot.ok),
  });

  // Contact capture only while drafting — never after photos/confirmation.
  if (
    flowTurn.kind === "allow_drafting" &&
    inputRoute.kind === "contact_capture" &&
    listingDraft &&
    lastUserText
  ) {
    const captured = resolveContactCaptureResponse({
      text: lastUserText,
      listingDraft,
    });
    if (captured) {
      return {
        ok: true,
        reply: captured.reply,
        ...(captured.quickReplies ? { quickReplies: captured.quickReplies } : {}),
        toolCalls: [],
        actions: {
          type: "listing_draft",
          listingDraft: normalizeListingDraftForAction(captured.listingDraft, {
            contact: req.context.contact,
            userCity: req.context.userCity,
            listingFlowState: listingDraft.listingFlowState ?? "DRAFTING_TEXT",
          }),
        },
      };
    }
  }

  // Field updates (price / vehicle specs) while sell draft is active — keep sell_intent memory.
  if (
    listingDraft &&
    lastUserText &&
    (flowTurn.kind === "allow_drafting" ||
      flowState === "DRAFTING_TEXT" ||
      flowState === "AWAITING_PHOTOS" ||
      flowState === "DRAFT_READY" ||
      flowState === "AWAITING_CONFIRMATION")
  ) {
    // Phase 2C — structured VIN review action from trusted client UI only.
    if (req.context.vinReviewAction && listingDraft) {
      const action = req.context.vinReviewAction;
      const priorAttrs = (listingDraft.attributes ?? {}) as Record<string, string>;
      let reduction = applyVinStructuredReviewAction(priorAttrs, action);
      let nextAttrs = reduction.attrs;
      let challengeOutcome: import("../vehicle/vin-challenge.js").VinChallengeOutcome | null =
        null;

      if (reduction.outcome === "applied" && req.authUserId) {
        if (action.type === "confirm") {
          // Round 4: confirmation requires a SERVER-REGISTERED challenge. Ensure
          // the current draft candidate/conflict has a pending challenge (register
          // one if missing), then consume it — only a verified challenge mints the
          // confirmation receipt.
          const ensured = ensureVinReviewChallenge(priorAttrs, {
            userId: req.authUserId,
          });
          const consumed = consumeVinChallenge(
            {
              challengeId: String(ensured.vinChallenge ?? "").trim(),
              userId: req.authUserId,
              vin: normalizeVin(String(action.value ?? "")),
              draftScope: String(ensured.vinDraftScope ?? "").trim() || undefined,
            },
            ({ userId, vin, reviewId, draftScope, challengeId }) =>
              buildConfirmedVinAttributesPatch({
                userId,
                vin,
                reviewId,
                draftScope,
                challengeId,
              })
          );
          if (consumed.ok && consumed.attrs) {
            reduction = applyVinStructuredReviewAction(ensured, {
              type: "confirm",
              value: action.value,
              reviewId: String(ensured.vinReviewId ?? ""),
            });
            nextAttrs = { ...reduction.attrs, ...consumed.attrs };
          } else {
            // Fail closed: no state change, no receipt, typed failure reply.
            nextAttrs = priorAttrs;
            challengeOutcome = consumed.outcome;
          }
        } else if (action.type === "reject") {
          const challengeId = String(priorAttrs.vinChallenge ?? "").trim();
          if (challengeId) rejectVinChallenge(challengeId, req.authUserId);
        } else if (action.type === "correct") {
          // A correction replaces the candidate — register a FRESH challenge for
          // the corrected value (superseding the previous generation).
          nextAttrs = ensureVinReviewChallenge(reduction.attrs, {
            userId: req.authUserId,
          });
        }
      }

      const nextDraft = normalizeListingDraftForAction(
        { ...listingDraft, attributes: nextAttrs },
        {
          price: listingDraft.price,
          contact: req.context.contact,
          userCity: req.context.userCity,
          listingFlowState: listingDraft.listingFlowState ?? "DRAFTING_TEXT",
        }
      );
      const vinReview = buildVinReviewSideEffect(nextAttrs);
      const vinReply = challengeOutcome
        ? vinChallengeOutcomeReply(challengeOutcome)
        : vinReviewOutcomeReply(reduction.outcome, action);
      return {
        ok: true,
        reply: `${vinReply} ${buildDraftReadyChatReply(nextDraft)}`,
        quickReplies: buildVinReviewDisplayChips(nextAttrs) ?? [...TEXT_DRAFT_READY_CHIPS],
        toolCalls: [],
        actions: {
          type: "listing_draft",
          listingDraft: nextDraft,
          ...(vinReview ? { vinReview } : {}),
        },
      };
    }

    const { isNegotiablePriceChatInput, negotiablePricePatch } = await import(
      "../shared/negotiable-price.js"
    );
    const negotiable = isNegotiablePriceChatInput(lastUserText);
    const price = negotiable ? 0 : parsePriceFromChatInput(lastUserText);
    const specPatch = extractVehicleSpecsFromChat(lastUserText);
    // Phase 2C: a VIN matched by this bare chat-text regex is never trusted as a
    // canonical fact — it is reconciled via the VIN review state machine below,
    // never spread directly into the live draft's attributes.
    const { vin: chatVinRaw, ...specPatchWithoutVin } = specPatch;
    const hasSpecs = Object.keys(specPatch).length > 0;
    const priceToApply = negotiable
      ? 0
      : price != null && !(specPatch.year && String(price) === String(specPatch.year))
        ? price
        : null;
    const descEdit = applyNaturalLanguageDescriptionEdits(
      String(listingDraft.description ?? ""),
      lastUserText
    );
    const hasDescEdit = descEdit.removed.length > 0;

    if (priceToApply != null || negotiable || hasSpecs || hasDescEdit) {
      const negoPatch = negotiable ? negotiablePricePatch() : null;
      const yearResolution = resolveYearConflictPatch({
        priorAttributes: listingDraft.attributes,
        incomingYear: specPatch.year,
      });
      // Phase 2C: reconcile any fresh chat-text VIN signal against the PRIOR draft's
      // confirmed/candidate VIN state first — this never writes `vin` directly, only
      // ever `vinCandidate`/`vinConflictValue`/etc. (or a no-op when it already
      // matches the confirmed canonical value).
      const vinAwareAttrs = chatVinRaw
        ? applyVinExtractionCandidate(listingDraft.attributes ?? {}, {
            value: chatVinRaw,
            source: "unknown",
            confidence: 0.5,
          })
        : (listingDraft.attributes ?? {});
      const mergedAttrs: Record<string, string> = {
        ...vinAwareAttrs,
        ...specPatchWithoutVin,
        ...(negoPatch?.attributes ?? {}),
        ...yearResolution,
      };
      if (mergedAttrs.yearConflict === "") delete mergedAttrs.yearConflict;
      if (mergedAttrs.yearConflictCandidate === "") delete mergedAttrs.yearConflictCandidate;
      delete mergedAttrs.awaitingSpecs;
      // Round 4: register a server challenge when this turn created a candidate.
      Object.assign(
        mergedAttrs,
        ensureVinReviewChallenge(mergedAttrs, {
          userId: req.authUserId,
          provenance: "unknown",
        })
      );
      let nextDescription = hasSpecs
        ? buildVehicleDescriptionFromAttributes(mergedAttrs, {
            location: listingDraft.location,
          })
        : listingDraft.description;
      if (hasDescEdit && !hasSpecs) {
        nextDescription = descEdit.description;
      } else if (hasDescEdit && hasSpecs && nextDescription) {
        nextDescription = applyNaturalLanguageDescriptionEdits(
          nextDescription,
          lastUserText
        ).description;
      }
      const nextTitle =
        mergedAttrs.make && mergedAttrs.model
          ? `${mergedAttrs.make} ${mergedAttrs.model}${mergedAttrs.year ? ` ${mergedAttrs.year}` : ""}`.trim()
          : listingDraft.title;
      const nextDraft = normalizeListingDraftForAction(
        {
          ...listingDraft,
          title: nextTitle || listingDraft.title,
          description: nextDescription,
          attributes: mergedAttrs,
          ...(negoPatch
            ? { priceLabel: negoPatch.priceLabel }
            : {}),
        },
        {
          price: priceToApply ?? listingDraft.price,
          contact: req.context.contact,
          userCity: req.context.userCity,
          listingFlowState:
            transitionListingFlow(
              listingDraft.listingFlowState ?? "DRAFTING_TEXT",
              "DRAFT_SAVED"
            ) ?? "DRAFT_READY",
        }
      );
      const bits = [
        specPatch.year ? `${specPatch.year} m.` : "",
        specPatch.engine ? specPatch.engine : "",
        specPatch.powerKw ? `${specPatch.powerKw} kW` : "",
        specPatch.fuelType ? specPatch.fuelType.toLowerCase() : "",
        specPatch.model ? specPatch.model : "",
        ...descEdit.removed.map((r) => `−${r}`),
      ].filter(Boolean);
      const intro =
        negotiable
          ? "Supratau — kaina sutartinė."
          : hasSpecs || hasDescEdit
            ? `Supratau — atnaujinau juodraštį${bits.length ? ` (${bits.join(", ")})` : ""}.`
            : "Puiku — atnaujinau kainą!";
      const vinReviewChips = buildVinReviewDisplayChips(mergedAttrs);
      const vinReviewPayload = buildVinReviewSideEffect(mergedAttrs);
      return {
        ok: true,
        reply: `${intro} ${buildDraftReadyChatReply(nextDraft)}`,
        quickReplies: vinReviewChips ?? [...TEXT_DRAFT_READY_CHIPS],
        toolCalls: [],
        actions: {
          type: "listing_draft",
          listingDraft: nextDraft,
          ...(vinReviewPayload ? { vinReview: vinReviewPayload } : {}),
        },
      };
    }
  }

  // Ignore legacy workflow edit chips that would roll the machine backward.
  if (inputRoute.kind === "workflow_command" && listingDraft && lastUserText) {
    if (flowState === "AWAITING_CONFIRMATION") {
      const gateway = resolvePrePublishGatewayResponse({
        isAuthenticated: req.context.isAuthenticated,
        profilePhone: req.context.profilePhone,
        profileEmail: req.context.profileEmail,
        userCity: req.context.userCity,
        contact: req.context.contact,
        listingDraft,
        pendingImageUrls: req.context.pendingImageUrls,
        geoCityHint: req.context.geoCityHint,
      });
      return {
        ok: true,
        reply: gateway.reply || PRE_PUBLISH_CARD_INTRO,
        ...(gateway.prePublishCard ? { prePublishCard: gateway.prePublishCard } : {}),
        toolCalls: [],
        actions: { type: "none" },
      };
    }
    if (
      flowState === "AWAITING_PHOTOS" &&
      draftPhotoCount === 0 &&
      !shouldBypassPhotosNudge(lastUserText) &&
      !isPublishReadyIntent(lastUserText)
    ) {
      return {
        ok: true,
        reply: AWAITING_PHOTOS_NUDGE,
        toolCalls: [],
        actions: { type: "none" },
      };
    }
    if (
      flowState === "DRAFT_READY" ||
      (flowState === "AWAITING_PHOTOS" && draftPhotoCount > 0)
    ) {
      // Photos already on draft/session — never re-ask to attach; let Gemini enrich.
      // fall through
    }
  }

  if (
    !listingSmActive &&
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

  // Job-seeker create (“Ieškau darbo…”) with active draft / sell intent —
  // always soft jobs draft, NEVER catalog searchListings.
  const jobSeekerCreate =
    Boolean(lastUserText) &&
    isJobSeekerListingCreateIntent(lastUserText) &&
    (Boolean(listingDraft) || detectServerSellIntent(lastUserText));

  // Sparse sell without photos → clarify BEFORE Gemini (never invent placeholder draft).
  if (
    !listingSmActive &&
    (isSparseSellRequest(lastUserText) || jobSeekerCreate) &&
    !pendingChatImages?.length &&
    !(listingDraft?.orderedImageUrls?.filter(Boolean).length) &&
    !(req.context.pendingImageUrls?.filter(Boolean).length)
  ) {
    console.warn("[vision] vauto-agent early sparse sell → soft skeleton draft", {
      lastUserTextHead: lastUserText.slice(0, 120),
      jobSeekerCreate,
    });
    const clarify = buildSellClarificationReply(lastUserText, {
      userCity: req.context.userCity,
      contact: req.context.contact,
    });
    // Keep existing draft identity when user is refining a job-seeker listing.
    const action =
      listingDraft && jobSeekerCreate
        ? {
            type: "listing_draft" as const,
            listingDraft: normalizeListingDraftForAction(
              {
                ...listingDraft,
                ...clarify.action.listingDraft,
                category: "jobs",
                listingFlowState:
                  listingDraft.listingFlowState ?? "DRAFTING_TEXT",
              },
              {
                contact: req.context.contact,
                userCity: req.context.userCity,
                listingFlowState:
                  listingDraft.listingFlowState ?? "DRAFTING_TEXT",
              }
            ),
          }
        : clarify.action;
    return {
      ok: true,
      reply: clarify.reply,
      quickReplies: clarify.quickReplies,
      toolCalls: [],
      actions: action,
    };
  }

  // Intent isolation: topic reset / session expiry → latest user message only.
  const sessionMessages =
    req.context.searchSessionReset ||
    (req.context.sessionExpired && req.messages.length > 1)
      ? req.messages.filter((m) => m.role === "user").slice(-1)
      : req.messages;

  // Lightweight context: compact rules on intermediate turns (active draft, no new media).
  const instructionMode =
    Boolean(listingDraft?.title?.trim() || listingDraft) &&
    !pendingChatImages?.length &&
    !extractedDocuments.length &&
    sessionMessages.length > 2
      ? ("intermediate" as const)
      : ("full" as const);
  const systemInstruction = buildAgentSystemInstruction(
    buildVautoAgentSystemInstruction(instructionMode),
    req.adminProjectContext
  );

  const userProfileBlock = buildUserContextInjectionBlock({
    userName: req.context.userName ?? "Svečias",
    accountType: req.context.accountType ?? "Svečias",
    userCity: resolveAgentDefaultCity(req.context.userCity),
    contact: req.context.contact?.trim() || "",
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
    contact: req.context.contact?.trim() || "",
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
    recentSearchListingIds: req.context.recentSearchListingIds,
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

  // UI meta-feedback — re-emit pinned results; never keyword-search "Nematau".
  if (lastUserText && isRevealActiveResultsIntent(lastUserText)) {
    const recentIds = req.context.recentSearchListingIds?.filter(Boolean) ?? [];
    if (recentIds.length) {
      emitAgentEvent(onEvent, {
        type: "status",
        message: "Rodau rezultatus ekrane…",
      });
      return {
        ok: true,
        reply: `Štai ${recentIds.length} rezultatai ekrane — slinkite žemyn prie skelbimų.`,
        toolCalls: [],
        actions: {
          type: "search",
          searchQuery: req.context.activeSearchFilters?.query ?? "",
          listingIds: recentIds,
          filters: req.context.activeSearchFilters ?? undefined,
        },
      };
    }
    return {
      ok: true,
      reply:
        "Kol kas aktyvių paieškos rezultatų nėra. Parašykite, ko ieškote — pvz. „Volvo“ ar „gitara“.",
      toolCalls: [],
      actions: { type: "none" },
    };
  }

  // Instant selection fast-path — open a recent search hit without Gemini.
  if (lastUserText && isResultSelectionIntent(lastUserText)) {
    const recentIds = req.context.recentSearchListingIds?.filter(Boolean) ?? [];
    const snapshot = ctx.listingsSnapshot ?? [];
    const byId = new Map(snapshot.map((l) => [l.id, l]));
    const recent = (
      recentIds.length
        ? recentIds.map((id) => byId.get(id)).filter(Boolean)
        : snapshot.slice(0, 12)
    ) as NonNullable<(typeof snapshot)[number]>[];
    const pick = resolveRecentListingSelection(lastUserText, recent);
    if (pick) {
      const path = listingPathForId(pick.id);
      const reply = `Atidarau: ${pick.title}`;
      emitAgentEvent(onEvent, {
        type: "status",
        message: "Atidarau skelbimą…",
      });
      return {
        ok: true,
        reply,
        toolCalls: [],
        actions: {
          type: "navigate_to_screen",
          screen: "listing",
          path,
          label: pick.title,
          query: pick.title,
        },
      };
    }
  }

  // Deterministic browse-all — skip Gemini for generic “show everything” queries.
  // Never steal create intents or PrePublish confirmations (“Viskas tinka”, “Publikuok”).
  if (
    lastUserText &&
    resolveBrowseAllIntent(lastUserText) &&
    !detectServerSellIntent(lastUserText) &&
    !isListingConfirmationPhrase(lastUserText) &&
    !isJobSeekerListingCreateIntent(lastUserText)
  ) {
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

  // Single-pass indexed search — skip multi-turn Gemini tool ping-pong.
  // Search-bar submits are always catalog queries (never lead-capture fallback).
  // On failure, fall through to Gemini so the SSE stream always gets a final event.
  const forceCatalogSearch =
    Boolean(lastUserText) &&
    !pendingChatImages?.length &&
    (shouldForceSupervisorTools(lastUserText) ||
      (Boolean(req.context.fromSearchBar) &&
        !detectServerSellIntent(lastUserText)));

  if (forceCatalogSearch && lastUserText) {
    try {
      emitAgentEvent(onEvent, {
        type: "tool_call",
        name: "searchListings",
        message: "Ieškau kataloge…",
      });
      const deterministic = await runDeterministicSupervisorSearch(
        lastUserText,
        ctx
      );
      emitAgentEvent(onEvent, {
        type: "tool_result",
        name: deterministic.toolName,
      });
      const reply = resolveSupervisorFinalReply({
        draftText: "",
        toolCalls: [
          { name: deterministic.toolName, result: deterministic.result },
        ],
        sideEffect: deterministic.sideEffect,
        searchToolCount:
          deterministic.sideEffect?.type === "search"
            ? deterministic.sideEffect.listingIds.length
            : deterministic.result &&
                typeof deterministic.result === "object" &&
                "count" in (deterministic.result as object)
              ? Number((deterministic.result as { count?: number }).count)
              : 0,
        lastUserQuery: lastUserText,
      });
      return {
        ok: true,
        reply,
        toolCalls: [
          { name: deterministic.toolName, result: deterministic.result },
        ],
        actions: deterministic.sideEffect ?? { type: "none" },
      };
    } catch (err) {
      console.warn(
        "[vauto-agent] single-pass search failed — falling back to Gemini",
        err instanceof Error ? err.message : err
      );
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
    const { slimListingDraftForLlm } = await import(
      "../shared/llm-context-slice.js"
    );
    const slim = slimListingDraftForLlm(req.context.listingDraft);
    if (slim) {
      wizardBits.push(`listingDraft=${JSON.stringify(slim)}`);
    }
  }
  if (req.context.searchResultCount === 0 && req.context.lastSearchQuery) {
    wizardBits.push(`emptySearchQuery=${req.context.lastSearchQuery}`);
  }
  if (req.context.currentView) {
    wizardBits.push(`currentView=${req.context.currentView}`);
  }
  if (req.context.pendingImageUrls?.length) {
    const { slimImageHandleList } = await import(
      "../shared/llm-context-slice.js"
    );
    wizardBits.push(`pendingImageCount=${req.context.pendingImageUrls.length}`);
    wizardBits.push(
      `pendingImageHandles=${JSON.stringify(
        slimImageHandleList(req.context.pendingImageUrls, 6)
      )}`
    );
  } else if (req.context.pendingImageCount) {
    wizardBits.push(`pendingImageCount=${req.context.pendingImageCount}`);
  }
  if (extractedDocuments.length) {
    const { slimDocumentFactsForLlm } = await import(
      "../shared/llm-context-slice.js"
    );
    const docFacts = String(
      listingDraft?.attributes?.attachedDocumentText ??
        listingDraft?.attributes?.documentFacts ??
        ""
    ).trim();
    wizardBits.push(
      `attachedDocuments=${extractedDocuments.map((d) => d.fileName).join("|")}`
    );
    if (docFacts) {
      const slim = slimDocumentFactsForLlm(docFacts, 1200);
      wizardBits.push(
        `documentFacts=${wrapUntrustedXml("untrusted_document_context", slim, 1200)}`
      );
    }
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
    const offerPayload = [
      `listingId=${sanitizePromptUserInput(po.listingId ?? "").text}`,
      `title=${sanitizePromptUserInput(po.listingTitle ?? "").text}`,
      `price=${po.listingPrice ?? ""}`,
      `category=${sanitizePromptUserInput(po.category ?? "").text}`,
      `wardrobeMode=${Boolean(po.wardrobeMode)}`,
    ].join("\n");
    contents.unshift({
      role: "user",
      parts: [
        {
          text: `[Proaktyvus derybų signalas — PRIVALOMA proposeSmartBargaining]\n${SMART_BARGAINING_HINT}\n${wrapUntrustedXml("untrusted_proactive_offer", offerPayload, 2_000)}`,
        },
      ],
    });
  }

  if (req.context.proactiveOffer?.kind === "search_refine") {
    const po = req.context.proactiveOffer;
    const offerPayload = [
      `query=${sanitizePromptUserInput(po.query ?? req.context.lastSearchQuery ?? "").text}`,
      `resultCount=${po.resultCount ?? req.context.searchResultCount ?? ""}`,
      `filters=${JSON.stringify(req.context.activeSearchFilters ?? po.filters ?? null)}`,
    ].join("\n");
    contents.unshift({
      role: "user",
      parts: [
        {
          text: `[Search Refinement — per daug rezultatų]\n${SEARCH_REFINE_HINT}\n${wrapUntrustedXml("untrusted_proactive_offer", offerPayload, 2_000)}`,
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
    const offerPayload = [
      `query=${sanitizePromptUserInput(q).text}`,
      `filters=${JSON.stringify(req.context.activeSearchFilters ?? req.context.proactiveOffer?.filters ?? null)}`,
    ].join("\n");
    contents.unshift({
      role: "user",
      parts: [
        {
          text: `[No-Match Lead — 0 rezultatų]\n${NO_MATCH_LEAD_HINT}\n${wrapUntrustedXml("untrusted_proactive_offer", offerPayload, 2_000)}`,
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
          text: `[Nuotraukos įkeltos — PRIVALOMA scanListingPhotos]\nimageUrls: ${JSON.stringify(req.context.pendingImageUrls.slice(0, 10))}`,
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
  const forceSupervisorTools =
    shouldForceSupervisorTools(lastUserText) ||
    (Boolean(req.context.fromSearchBar) &&
      Boolean(lastUserText) &&
      !detectServerSellIntent(lastUserText));

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
          geoCityHint: req.context.geoCityHint,
        });
        if (!prePublish.ok) {
          const conversational = buildConversationalMissingPrompt({
            missingAuth: prePublish.missingAuth,
            missingPhoto: prePublish.missingPhoto,
            missingCity: prePublish.missingCity,
            missingPrice: prePublish.missingPrice,
            missingPhone: prePublish.missingPhone,
          });
          draftText = conversational;
          responseParts.push({
            functionResponse: {
              name,
              response: {
                ok: false,
                blocked: true,
                message: conversational,
              },
            },
          });
          continue;
        }
      }
      // Force full pending media into vision scan — model often omits the
      // tech-passport data URL when cars are already http URLs.
      let toolArgs: Record<string, unknown> = { ...(args ?? {}) };
      if (name === "scanListingPhotos" && pendingChatImages?.length) {
        const fromModel = Array.isArray(toolArgs.imageUrls)
          ? toolArgs.imageUrls.map(String).filter(Boolean)
          : [];
        const merged = [
          ...pendingChatImages,
          ...fromModel.filter((u) => !pendingChatImages.includes(u)),
        ].slice(0, 6);
        toolArgs = { ...toolArgs, imageUrls: merged };
        console.log("[vision] scanListingPhotos forced pending media", {
          pendingCount: pendingChatImages.length,
          modelCount: fromModel.length,
          mergedCount: merged.length,
          kinds: merged.map((u) =>
            u.startsWith("data:")
              ? `data(${u.length})`
              : u.startsWith("http")
                ? "http"
                : "other"
          ),
        });
      }
      const { result, sideEffect: fx } = await executeAgentTool(
        name,
        toolArgs,
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

  const wardrobeToolCall = toolCalls.find((t) => t.name === "analyzeWardrobePhoto");
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
        t.name === "analyzeWardrobePhoto"
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
    finalText = buildDraftReadyChatReply(sideEffect.listingDraft);
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
    finalText = buildDraftReadyChatReply(resolvedAction.listingDraft);
  }

  const listingDraftForReply =
    sideEffect?.type === "listing_draft"
      ? sideEffect.listingDraft
      : resolvedAction.type === "listing_draft" && "listingDraft" in resolvedAction
        ? resolvedAction.listingDraft
        : null;
  // Preserve warm OCR / guidance replies after photo scan.
  // Only replace with draft-ready when Pass-2 sales copy was explicitly materialized.
  if (listingDraftForReply) {
    const salesReady =
      String(listingDraftForReply.attributes?.salesCopyGenerated ?? "").toLowerCase() ===
      "true";
    if (salesReady) {
      // Keep an existing warm draft-ready / PrePublish ack; otherwise synthesize one.
      if (!finalText?.trim() || !/Paruošiau pilną|PrePublish/i.test(finalText)) {
        finalText = buildDraftReadyChatReply(listingDraftForReply);
      } else {
        finalText = stripStaleChatPromptTails(finalText);
      }
    } else if (finalText) {
      // Vision Step-2: keep Matau + fact ack + guidance intact.
      finalText = stripStaleChatPromptTails(finalText);
    } else {
      // Fallback when model returned empty but vision draft exists without sales copy.
      finalText = buildPostVisionHeroMessage(listingDraftForReply);
    }
  } else if (finalText) {
    finalText = stripStaleChatPromptTails(finalText);
  }

  // Photos present + empty model reply → Vision scan (never echo raw sell text).
  if (!finalText && pendingChatImages?.length) {
    console.log("[vision] vauto-agent mediaRetry (empty finalText)", {
      pendingCount: pendingChatImages.length,
      lastGeminiError: lastGeminiError ?? null,
      resolvedActionType: resolvedAction.type,
    });
    try {
      const mediaRetry = await resolveChatMediaAttachmentResponse({
        imageUrls: pendingChatImages,
        listingDraft,
        userCity: req.context.userCity,
        contact: req.context.contact,
        userText: lastUserText,
        authUserId: req.authUserId,
      });
      if (mediaRetry) {
        console.log("[vision] vauto-agent mediaRetry ok", {
          replyHead: mediaRetry.reply?.slice(0, 160),
          actionType: mediaRetry.actions?.type,
        });
        return mediaRetry;
      }
      console.warn("[vision] vauto-agent mediaRetry returned null");
    } catch (err) {
      const errMessage = err instanceof Error ? err.message : String(err);
      console.error(
        `[vision] vauto-agent mediaRetry EXCEPTION ${JSON.stringify({
          errMessage,
          stack: err instanceof Error ? err.stack?.slice(0, 900) : undefined,
        })}`
      );
    }
  }

  if (
    !listingSmActive &&
    !finalText &&
    detectServerSellIntent(lastUserText) &&
    !pendingChatImages?.length
  ) {
    if (isSparseSellRequest(lastUserText)) {
      console.warn("[vision] vauto-agent sparse sell → soft skeleton draft", {
        lastUserTextHead: lastUserText.slice(0, 120),
      });
      const clarify = buildSellClarificationReply(lastUserText, {
        userCity: req.context.userCity,
        contact: req.context.contact,
      });
      return {
        ok: true,
        reply: clarify.reply,
        quickReplies: clarify.quickReplies,
        toolCalls,
        actions: clarify.action,
      };
    }
    console.warn("[vision] vauto-agent sell-intent text fallback (no images)", {
      lastUserTextHead: lastUserText.slice(0, 120),
    });
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

  if (!finalText?.trim()) {
    // Prefer in-domain continuity when a draft already exists — never rigid “ne visai”.
    if (listingDraft?.title?.trim()) {
      const recovery = buildDraftingCompletePhotosPrompt({
        title: listingDraft.title,
        description: listingDraft.description,
        price: listingDraft.price,
        location: listingDraft.location,
      });
      console.warn("[vision] vauto-agent empty finalText → draft continuity", {
        reason: lastGeminiError ? "lastGeminiError" : "empty_finalText",
        lastGeminiError: lastGeminiError ?? null,
        pendingCount: pendingChatImages?.length ?? 0,
      });
      return {
        ok: true,
        reply: `Tęsiame jūsų juodraštį. ${recovery}`,
        quickReplies,
        toolCalls,
        actions: {
          type: "listing_draft",
          listingDraft: normalizeListingDraftForAction(listingDraft, {
            contact: req.context.contact,
            userCity: req.context.userCity,
            listingFlowState: listingDraft.listingFlowState,
          }),
        },
      };
    }
    console.warn("[vision] vauto-agent empty finalText → in-domain recovery", {
      reason: lastGeminiError ? "lastGeminiError" : "empty_finalText",
      lastGeminiError: lastGeminiError ?? null,
      pendingCount: pendingChatImages?.length ?? 0,
      toolNames: toolCalls.map((t) => t.name),
      lastUserTextHead: lastUserText.slice(0, 120),
    });
    return {
      ok: true,
      reply: VAUTO_IN_DOMAIN_RECOVERY,
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
  // Never overwrite a draft-ready one-liner with longer tool follow-ups / stale CTAs.
  const draftReadyChat =
    typeof finalText === "string" && /Paruošiau pilną/i.test(finalText);
  if (!draftReadyChat) {
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
  }

  return {
    ok: true,
    reply: finalText ? stripStaleChatPromptTails(finalText) : finalText,
    quickReplies,
    toolCalls,
    actions: resolvedAction,
  };
}
