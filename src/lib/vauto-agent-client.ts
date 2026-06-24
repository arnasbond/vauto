import type { AiExtractedListing, Listing, ListingCategory } from "@/lib/types";
import type { AppView } from "@/lib/app-views";

export interface AgentChatMessage {
  role: "user" | "assistant";
  text: string;
  toolCalls?: { name: string; result: unknown }[];
}

export interface AgentSearchFilters {
  query?: string;
  category?: string;
  city?: string;
  maxPrice?: number;
  minPrice?: number;
  refinements?: string[];
}

export interface VautoAgentContext {
  userCity?: string;
  defaultRegion?: string;
  primaryVehicle?: {
    make: string;
    model: string;
    year: number;
  };
  activeSearchFilters?: AgentSearchFilters | null;
  searchSessionReset?: boolean;
  userRole?: "buyer" | "seller" | "business" | "admin";
  contact?: string;
  listings?: AgentListingSnapshot[];
  lastError?: { code: string; message?: string };
  wizardMode?: "listing_review" | "search" | "idle";
  listingDraft?: {
    title?: string;
    description?: string;
    price?: number;
    location?: string;
    category?: string;
    attributes?: Record<string, string | string[]>;
  };
  missingFields?: string[];
  wizardPrompts?: string[];
  isAuthenticated?: boolean;
  searchResultCount?: number;
  lastSearchQuery?: string;
  currentView?: AppView | import("@/lib/zero-ui-screens").ZeroUiScreen;
  monetization?: {
    tier?: "free" | "business_pro";
    activeBoost?: boolean;
    billingPlan?: string;
    walletBalance?: number;
  };
}

export interface AgentListingSnapshot {
  id: string;
  title: string;
  price: number;
  category: string;
  location: string;
  description?: string;
}

export type VautoAgentAction =
  | { type: "none" }
  | {
      type: "search";
      searchQuery: string;
      listingIds: string[];
      filters?: AgentSearchFilters;
      filtersReset?: boolean;
      proactiveMessage?: string;
    }
  | {
      type: "listing_draft";
      listingDraft: {
        title: string;
        description?: string;
        price: number;
        location: string;
        contact: string;
        category: string;
        confidence: number;
        attributes?: Record<string, string | string[]>;
      };
      imageUrl?: string;
    }
  | {
      type: "block_listing";
      listingId: string;
      reason: string;
      listingTitle?: string;
    }
  | {
      type: "empty_search";
      searchQuery: string;
    }
  | {
      type: "register_wanted";
      query: string;
    }
  | {
      type: "navigate";
      view: AppView;
      params?: Record<string, string>;
    }
  | {
      type: "zero_ui_screen";
      screen: import("@/lib/zero-ui-screens").ZeroUiScreen;
    }
  | {
      type: "micro_payment";
      reason: string;
      price: number;
      product: "smart_boost" | "region_stats" | "generic";
      voiceConfirmPhrase?: string;
    };

export interface VautoAgentResponse {
  ok: true;
  reply: string;
  toolCalls: { name: string; result: unknown }[];
  actions: VautoAgentAction;
}

export interface VautoAgentErrorResponse {
  ok: false;
  error: string;
  code?: string;
}

export type VautoAgentApiResult = VautoAgentResponse | VautoAgentErrorResponse;

const VALID: ListingCategory[] = [
  "electronics",
  "vehicles",
  "services",
  "jobs",
  "home",
  "clothing",
  "real_estate",
  "other",
];

export function compactListingsForAgent(listings: Listing[]): AgentListingSnapshot[] {
  return listings
    .filter((l) => l.status !== "sold" && !l.banned)
    .slice(0, 48)
    .map((l) => ({
      id: l.id,
      title: l.title,
      price: l.price,
      category: l.category,
      location: l.location,
      description: l.description?.slice(0, 160),
    }));
}

export function mapAgentDraftToListing(draft: {
  title: string;
  description?: string;
  price: number;
  location: string;
  contact: string;
  category: string;
  confidence: number;
  attributes?: Record<string, string | string[]>;
}): AiExtractedListing {
  const category = VALID.includes(draft.category as ListingCategory)
    ? (draft.category as ListingCategory)
    : "other";

  return {
    title: draft.title,
    price: draft.price,
    location: draft.location,
    contact: draft.contact,
    category,
    description: draft.description,
    confidence: draft.confidence,
    attributes: draft.attributes,
  };
}

export function resolveAgentUserRole(user: {
  role?: string;
}): VautoAgentContext["userRole"] {
  if (user.role === "admin") return "admin";
  if (user.role === "pro") return "business";
  return "buyer";
}

/** Optional bridge so seller/upload flows can notify the agent proactively */
let agentErrorReporter: ((code: string, message?: string) => void) | null = null;

export function registerAgentErrorReporter(
  fn: ((code: string, message?: string) => void) | null
): void {
  agentErrorReporter = fn;
}

export function notifyAgentError(code: string, message?: string): void {
  agentErrorReporter?.(code, message);
}
