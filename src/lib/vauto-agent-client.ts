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
  radiusKm?: number;
  maxPrice?: number;
  minPrice?: number;
  condition?: "used" | "new";
  refinements?: string[];
  categoryAttributes?: Record<string, string>;
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
  userName?: string;
  accountType?: string;
  myListings?: MyListingForAgent[];
  myListingsSummary?: string;
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
  currentPageContext?: CurrentPageContext;
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
}

export interface AgentListingSnapshot {
  id: string;
  title: string;
  price: number;
  category: string;
  location: string;
  description?: string;
}

export interface MyListingForAgent {
  id: string;
  title: string;
  price: number;
  category: string;
  location: string;
  status: string;
}

/** UI deixis context — „šitas/anas" resolves to active_listing_id. */
export interface CurrentPageContext {
  page_id: string;
  active_listing_id?: string;
  active_listing_title?: string;
  zero_ui_screen?: string;
}

/** Matches server SECRETARY_SESSION_TTL_MS (15 min). */
export const AGENT_SESSION_TTL_MS = 15 * 60 * 1000;

export const AGENT_MIN_QUERY_CHARS = 5;

export const AGENT_NOISE_REPLIES = [
  "Atsiprašau, neišgirdau — pakartokite prašau?",
  "Aplink per daug triukšmo — galite parašyti?",
] as const;

const AGENT_SESSION_ACTIVITY_KEY = "vauto_agent_last_activity_v1";

export function isTooShortAgentQuery(text: string | null | undefined): boolean {
  const t = String(text ?? "").trim();
  if (!t) return true;
  return t.length < AGENT_MIN_QUERY_CHARS;
}

export function resolveAgentNoiseReply(seed?: string): string {
  if (!AGENT_NOISE_REPLIES.length) return AGENT_NOISE_REPLIES[0]!;
  if (!seed?.trim()) return AGENT_NOISE_REPLIES[0]!;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash + seed.charCodeAt(i) * (i + 1)) % AGENT_NOISE_REPLIES.length;
  }
  return AGENT_NOISE_REPLIES[hash]!;
}

export function readAgentSessionLastActiveAt(): number | null {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(AGENT_SESSION_ACTIVITY_KEY);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function touchAgentSessionActivity(at = Date.now()): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(AGENT_SESSION_ACTIVITY_KEY, String(at));
}

export function isAgentSessionExpired(
  lastActiveAt: number | null,
  now = Date.now()
): boolean {
  if (!lastActiveAt || !Number.isFinite(lastActiveAt)) return false;
  return now - lastActiveAt > AGENT_SESSION_TTL_MS;
}

export function extractLastSessionTopic(messages: AgentChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg?.role !== "user") continue;
    const text = msg.text.trim();
    if (text.length >= AGENT_MIN_QUERY_CHARS) {
      return text.length > 80 ? `${text.slice(0, 77)}…` : text;
    }
  }
  return "skelbimus ar paiešką";
}

export function resolveListingFromPathname(
  pathname: string,
  listings: Listing[]
): Listing | undefined {
  const p = pathname.replace(/\/$/, "") || "/";
  const segmentMatch = p.match(/^\/listing\/([^/?#]+)/);
  if (segmentMatch?.[1]) {
    const slug = decodeURIComponent(segmentMatch[1]);
    return listings.find((l) => l.slug === slug || l.id === slug);
  }
  if (p.startsWith("/listing") && typeof window !== "undefined") {
    try {
      const slug = new URL(pathname, window.location.origin).searchParams.get("slug");
      if (slug) {
        return listings.find((l) => l.slug === slug || l.id === slug);
      }
    } catch {
      /* ignore */
    }
  }
  return undefined;
}

export function buildCurrentPageContext(params: {
  pathname: string;
  zeroUiScreen?: string;
  listings: Listing[];
  sellerId?: string;
}): CurrentPageContext {
  const pathnameListing = resolveListingFromPathname(params.pathname, params.listings);
  const ownActive = params.sellerId
    ? params.listings.filter(
        (l) => l.sellerId === params.sellerId && l.status !== "sold" && !l.banned
      )
    : [];

  let activeListing = pathnameListing;
  if (!activeListing && params.zeroUiScreen === "listing_preview" && ownActive.length === 1) {
    activeListing = ownActive[0];
  }
  if (!activeListing && params.zeroUiScreen === "business_dashboard" && ownActive.length === 1) {
    activeListing = ownActive[0];
  }

  return {
    page_id: (params.zeroUiScreen ?? params.pathname.replace(/\/$/, "")) || "/",
    active_listing_id: activeListing?.id,
    active_listing_title: activeListing?.title,
    zero_ui_screen: params.zeroUiScreen,
  };
}

export function buildWelcomeBackAgentGreeting(
  userName: string,
  _myListings: MyListingForAgent[],
  lastTopic: string
): string {
  const firstName = userName.split(/\s+/)[0] || userName;
  const topic = lastTopic.trim() || "skelbimus ar paiešką";
  return `Sveiki sugrįžę, ${firstName}! Matau praeitą kartą kalbėjome apie ${topic} — tęsiame ar pradedame naują skelbimą?`;
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
      filters?: AgentSearchFilters;
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
      product: "smart_boost" | "region_stats" | "b2b_lead" | "generic";
      voiceConfirmPhrase?: string;
    }
  | {
      type: "mark_listing_sold";
      listingId: string;
      title?: string;
    }
  | {
      type: "toggle_favorite";
      listingId: string;
      added: boolean;
    }
  | {
      type: "dismiss_listing";
      mode: "next" | "close";
    }
  | {
      type: "apply_ui_filters";
      filters?: AgentSearchFilters;
      categoryAttributes?: Record<string, string>;
      label?: string;
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
    .map((l) => ({
      id: l.id,
      title: l.title,
      price: l.price,
      category: l.category,
      location: l.location,
      description: l.description?.slice(0, 160),
    }));
}

export function compactMyListingsForAgent(
  listings: Listing[],
  sellerId?: string
): MyListingForAgent[] {
  return listings
    .filter((l) => (!sellerId || l.sellerId === sellerId) && !l.banned)
    .map((l) => ({
      id: l.id,
      title: l.title,
      price: l.price,
      category: l.category,
      location: l.location,
      status: l.status ?? "active",
    }));
}

export function resolveAccountTypeLabel(user: {
  role?: string;
  businessType?: string;
}): string {
  if (user.role === "super_admin" || user.role === "admin") return "Administratorius";
  if (user.role === "pro") {
    if (user.businessType === "dealer") return "Verslas · Auto salonas";
    if (user.businessType === "services") return "Verslas · Paslaugos";
    return "Verslas · Pro";
  }
  return "Privatus pardavėjas";
}

function summarizeMyListingsForGreeting(
  myListings: MyListingForAgent[],
  firstName: string
): string {
  const active = myListings.filter((l) => l.status !== "sold");
  if (!myListings.length) {
    return "Nori naujo skelbimo, ar padėti rasti prekę?";
  }
  if (active.length === 1) {
    const l = active[0]!;
    return `Matau tavo skelbimą „${l.title}" ${l.location} — nori įkelti nuotraukas, pakoreguoti kainą, ar pažiūrim statistiką?`;
  }
  if (active.length > 1) {
    return `Turi ${active.length} aktyvius skelbimus — nori tvarkyti esamus, ar kelti naują?`;
  }
  return `${firstName}, aktyvių skelbimų nebeliko — padėsiu su nauju skelbimu ar paieška?`;
}

export function buildPersonalizedAgentGreeting(
  userName: string,
  myListings: MyListingForAgent[]
): string {
  const firstName = userName.split(/\s+/)[0] || userName;
  if (userName === "Svečias" || !userName.trim()) {
    return "Labas! Aš tavo VAUTO sekretorius — galiu padėti rasti prekę ar paruošti skelbimą. Nuo ko pradedam?";
  }
  const tail = summarizeMyListingsForGreeting(myListings, firstName);
  return `Labas, ${firstName}! ${tail}`;
}

export function summarizeMyListingsSummary(
  myListings: MyListingForAgent[],
  userName: string
): string {
  const firstName = userName.split(/\s+/)[0] || userName;
  const active = myListings.filter((l) => l.status !== "sold");
  const sold = myListings.filter((l) => l.status === "sold");

  if (!myListings.length) {
    return `${firstName} neturi skelbimų — gali pasiūlyti naują skelbimą ar paiešką.`;
  }
  if (active.length === 1) {
    const l = active[0]!;
    return `Turi 1 aktyvų skelbimą: „${l.title}" (${l.location}, ${l.price}€).`;
  }
  if (active.length > 1) {
    const sample = active
      .slice(0, 3)
      .map((l) => `„${l.title}" (${l.location})`)
      .join("; ");
    return `Turi ${active.length} aktyvius skelbimus: ${sample}.`;
  }
  if (sold.length) {
    return `Aktyvių skelbimų nėra; ${sold.length} archyvuota (-i).`;
  }
  return `${firstName} skelbimų sąrašas tuščias.`;
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
  if (user.role === "admin" || user.role === "super_admin") return "admin";
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
