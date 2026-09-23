/**
 * VAUTO Agent DTO contracts — shared types across routes, thread service, and Core v2 adapter.
 */
import type { AgentSearchFilters, PersistedSearchContext } from "../ai/agent-memory-context.js";
import type { MyListingForAgent } from "../ai/user-agent-context.js";
import type { SupervisorApplicationState } from "../ai/supervisor-context.js";
import type { ServerPrePublishCardPayload, ServerPrePublishRequirementsPayload } from "../ai/pre-publish-validation.js";
import type { VinReviewStructuredAction } from "../vehicle/vin-review.js";

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
    wizardMode?: "listing_review" | "listing_edit" | "search" | "idle";
    listingDraft?: {
      id?: string;
      title?: string;
      description?: string;
      price?: number;
      priceLabel?: string;
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
    /** Server thread service reconstructed this context from durable state. */
    threadAuthoritative?: boolean;
    /** R4.2 — server-restored conversational search context (thread-owned). */
    threadSearchContext?: PersistedSearchContext | null;
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
    /** Supervisor application state */
    supervisorState?: SupervisorApplicationState;
  };
  /** Set by route from JWT — used for DB writes (mark sold, etc.) */
  authUserId?: string;
  adminProjectContext?: string;
}

export interface AgentQuickReplyOptionWire {
  id: string;
  label: string;
  action: string;
}

export type QuickReplyWire = string | AgentQuickReplyOptionWire;

export interface VautoAgentResponse {
  ok: true;
  reply: string;
  quickReplies?: QuickReplyWire[];
  prePublishCard?: ServerPrePublishCardPayload;
  prePublishRequirements?: ServerPrePublishRequirementsPayload;
  toolCalls: { name: string; result: unknown }[];
  actions: Record<string, unknown>;
  /** R4.2 — current conversational subject (model-resolved) for server persistence. */
  subject?: string;
  /** E1 — Core v2 state for provenance continuity (when Core v2 is enabled). */
  coreV2State?: Record<string, unknown>;
  /** E1 — Core v2 grounded result context for reference continuity (listing IDs). */
  coreV2ResultContext?: Record<string, unknown>;
}

export type VautoAgentStreamEvent =
  | { type: "status"; message: string }
  | { type: "tool_call"; name: string; message: string }
  | { type: "tool_result"; name: string }
  /** Instant chat ack while Vision / PDF workers run (<500ms hot path). */
  | {
      type: "early_ack";
      reply: string;
      quickReplies?: QuickReplyWire[];
    }
  /** Progressive PrePublish draft fill from async Vision / OCR. */
  | {
      type: "draft_update";
      listingDraft: NonNullable<VautoAgentRequest["context"]["listingDraft"]>;
      reply?: string;
    }
  | { type: "error"; code: string; message: string };

export interface AgentListingSummary {
  id: string;
  title: string;
  price: number;
  category: string;
  location: string;
  description?: string;
}
