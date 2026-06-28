import type { ChatThread, Listing, SupportReport, UserProfile } from "@/lib/types";
import type { ListingEditPatch } from "@/lib/listing-edit";
import { resolveListingCity } from "@/lib/city-resolve";
import {
  listingPatchToApiPayload,
  listingToApiPayload,
} from "@/lib/listing-api-payload";
import { normalizeListing } from "@/lib/listing-normalize";
import type { LegacyListingInput } from "@/lib/types";
import {
  AI_FETCH_TIMEOUT_MS,
  AI_VISION_FETCH_TIMEOUT_MS,
} from "@/lib/ai-safeguards";
import { getAiBaseUrl, getDataApiBaseUrl } from "./config";
import { getAuthHeaders } from "@/lib/auth/session";
import { trimAgentRequestBody } from "@/lib/agent-request-trim";
import { sanitizeAvatarForApi } from "@/lib/avatar-url";

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status?: number };

async function dataFetch<T>(
  path: string,
  opts?: RequestInit & { userId?: string }
): Promise<ApiResult<T>> {
  const base = getDataApiBaseUrl();
  if (!base) return { ok: false, error: "API not configured" };

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
      ...(opts?.userId ? { "X-User-Id": opts.userId } : {}),
    };
    const res = await fetch(`${base}${path}`, {
      ...opts,
      headers: { ...headers, ...(opts?.headers as Record<string, string>) },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        ok: false,
        error: text || res.statusText || `HTTP ${res.status}`,
        status: res.status,
      };
    }
    if (res.status === 204) return { ok: true, data: null as T };
    return { ok: true, data: (await res.json()) as T };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

function getAiBaseUrls(): string[] {
  const urls: string[] = [];
  const dataApi = getDataApiBaseUrl();
  if (dataApi) urls.push(dataApi);
  if (typeof window !== "undefined") {
    const origin = window.location.origin;
    if (!urls.includes(origin)) urls.push(origin);
  }
  const legacy = getAiBaseUrl();
  if (legacy && !urls.includes(legacy)) urls.push(legacy);
  return urls;
}

type RawAiHealth = {
  ok?: boolean;
  gemini?: boolean;
  openai?: boolean;
  provider?: string | null;
  mode?: string;
};

/** Normalize legacy Render health (`openai` + `provider: gemini`) to `gemini: true`. */
export function normalizeAiHealth(raw: RawAiHealth | null): {
  ok: boolean;
  gemini: boolean;
  provider?: string | null;
  mode: string;
} | null {
  if (!raw?.ok) return null;
  const geminiLive =
    raw.gemini === true ||
    raw.provider === "gemini" ||
    (raw.mode === "gemini" && raw.openai === true);
  if (!geminiLive) {
    return {
      ok: true,
      gemini: false,
      provider: raw.provider ?? null,
      mode: raw.mode ?? "demo",
    };
  }
  return {
    ok: true,
    gemini: true,
    provider: raw.provider ?? "gemini",
    mode: raw.mode ?? "gemini",
  };
}

async function aiFetchOnce<T>(
  base: string,
  path: string,
  opts: RequestInit | undefined,
  timeoutMs: number
): Promise<{ data: T | null; error?: string; code?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${base}${path}`, {
      ...opts,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(opts?.headers as Record<string, string>),
      },
    });
    const text = await res.text().catch(() => "");
    let payload: unknown = null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = null;
      }
    }
    if (!res.ok) {
      const errBody = payload as { error?: string; code?: string } | null;
      const code =
        res.status === 413
          ? "payload_too_large"
          : errBody?.code;
      const error =
        res.status === 413
          ? "Užklausa per didelė. Sutrumpinkite žinutę arba pokalbio istoriją."
          : errBody?.error || text || res.statusText || `HTTP ${res.status}`;
      return {
        data: null,
        error,
        code,
      };
    }
    return { data: payload as T };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const code =
      e instanceof Error && e.name === "AbortError" ? "timeout" : "network_error";
    return { data: null, error: message, code };
  } finally {
    clearTimeout(timer);
  }
}

async function aiFetch<T>(
  path: string,
  opts?: RequestInit,
  timeoutMs = AI_FETCH_TIMEOUT_MS
): Promise<T | null> {
  const mergedOpts: RequestInit = {
    ...opts,
    headers: {
      ...getAuthHeaders(),
      ...(opts?.headers as Record<string, string> | undefined),
    },
  };
  for (const base of getAiBaseUrls()) {
    const { data } = await aiFetchOnce<T>(base, path, mergedOpts, timeoutMs);
    if (data !== null) return data;
  }
  return null;
}

export interface ApiHealthDetails {
  ok: boolean;
  service: string;
  db?: string;
  features?: {
    sms: boolean;
    googleOAuth: boolean;
    webPush: boolean;
    fcm: boolean;
    jwt: boolean;
    gemini?: boolean;
    reportEmail?: boolean;
    stripe?: boolean;
    stripeWebhook?: boolean;
    regitraPlateApi?: boolean;
    regitraDemo?: boolean;
    vehicleLookup?: boolean;
    serviceLeads?: boolean;
  };
  readiness?: {
    score: number;
    regitraMode: "live" | "demo";
    embeddingsSynced: boolean;
  };
  embeddings?: {
    activeListings: number;
    textIndexed: number;
    imageIndexed: number;
  };
}

export async function apiHealthCheck(): Promise<boolean> {
  const r = await apiFetchHealthDetails();
  return r.ok && r.data.ok === true;
}

export async function apiFetchHealthDetails(): Promise<ApiResult<ApiHealthDetails>> {
  return dataFetch<ApiHealthDetails>("/api/health");
}

export async function apiVautoServer(
  body: import("@/lib/vauto-unified-client").VautoServerRequest
): Promise<
  | import("@/lib/vauto-unified-client").VautoServerParseResponse
  | import("@/lib/vauto-unified-client").VautoServerUploadResponse
  | null
> {
  const timeoutMs =
    body.action === "upload_media"
      ? AI_FETCH_TIMEOUT_MS
      : body.action === "parse_text"
        ? AI_FETCH_TIMEOUT_MS
        : AI_VISION_FETCH_TIMEOUT_MS;

  return aiFetch("/api/vauto-server", {
    method: "POST",
    body: JSON.stringify(body),
  }, timeoutMs);
}

export async function apiUploadMedia(imageDataUrl: string): Promise<string | null> {
  const res = await apiVautoServer({
    action: "upload_media",
    imageDataUrl,
  });
  if (res && "url" in res) return res.url;
  return null;
}

export async function apiVautoAgent(body: {
  messages: { role: "user" | "assistant"; text: string }[];
  context?: import("@/lib/vauto-agent-client").VautoAgentContext;
  /** Server loads admin Gemini context from DB — avoids huge POST bodies */
  includeAdminContext?: boolean;
}): Promise<import("@/lib/vauto-agent-client").VautoAgentApiResult> {
  const trimmed = trimAgentRequestBody(body);
  const timeoutMs = trimmed.includeAdminContext ? 45_000 : AI_VISION_FETCH_TIMEOUT_MS;
  const renderBase = getDataApiBaseUrl();

  const fetchOpts = {
    method: "POST" as const,
    headers: getAuthHeaders(),
    body: JSON.stringify(trimmed),
  };

  /** Prefer same-origin /api/vauto-agent (Vercel proxy) — Render direct can 503 on stale deploys. */
  const bases: string[] = [];
  if (typeof window !== "undefined") {
    bases.push(window.location.origin);
  }
  if (renderBase && !bases.includes(renderBase)) {
    bases.push(renderBase);
  }

  let lastError: { error?: string; code?: string } = {};
  const urls = bases.length ? bases : getAiBaseUrls();
  for (const base of urls) {
    const result = await aiFetchOnce<
      import("@/lib/vauto-agent-client").VautoAgentApiResult
    >(base, "/api/vauto-agent", fetchOpts, timeoutMs);
    if (result.data && "ok" in result.data && result.data.ok === true) {
      return result.data;
    }
    if (result.data && "reply" in result.data && result.data.reply) {
      return result.data;
    }
    if (result.data && "ok" in result.data && result.data.ok === false) {
      lastError = { error: result.data.error, code: result.data.code };
      if (result.data.code !== "agent_unavailable") return result.data;
      continue;
    }
    lastError = { error: result.error, code: result.code };
  }

  const { error, code } = lastError;

  return {
    ok: false,
    error: error || "AI agentas laikinai nepasiekiamas",
    code: code || "agent_unavailable",
  };
}

export async function apiFetchAdminProjectContext(): Promise<
  ApiResult<{ context: string }>
> {
  return dataFetch<{ context: string }>("/api/admin/agent-project-context");
}

export async function apiSaveAdminProjectContext(
  context: string
): Promise<ApiResult<{ ok: true; context: string }>> {
  return dataFetch<{ ok: true; context: string }>(
    "/api/admin/agent-project-context",
    {
      method: "PUT",
      body: JSON.stringify({ context }),
    }
  );
}

export async function apiAiHealthCheck(): Promise<{
  ok: boolean;
  gemini: boolean;
  provider?: string | null;
  mode: string;
} | null> {
  for (const base of getAiBaseUrls()) {
    const { data: health } = await aiFetchOnce<RawAiHealth>(
      base,
      "/api/ai/health",
      undefined,
      8_000
    );
    const normalized = normalizeAiHealth(health);
    if (normalized?.gemini) return normalized;
  }
  const fallback = await aiFetch<RawAiHealth>("/api/ai/health", undefined, 8_000);
  return normalizeAiHealth(fallback);
}

export async function apiFetchListings(): Promise<ApiResult<Listing[]>> {
  return dataFetch<Listing[]>("/api/listings");
}

export async function apiCreateListing(
  listing: Listing,
  userId: string
): Promise<ApiResult<Listing>> {
  const payload = listingToApiPayload(listing);
  const res = await dataFetch<LegacyListingInput>("/api/listings", {
    method: "POST",
    body: JSON.stringify(payload),
    userId,
  });
  if (!res.ok) return res;
  return { ok: true, data: normalizeListing(res.data) };
}

export async function apiDeleteListing(
  id: string,
  userId: string
): Promise<ApiResult<null>> {
  return dataFetch<null>(`/api/listings/${id}`, { method: "DELETE", userId });
}

export async function apiRenewListing(
  id: string,
  userId: string
): Promise<ApiResult<Listing>> {
  return dataFetch<Listing>(`/api/listings/${id}/renew`, {
    method: "POST",
    userId,
  });
}

export async function apiUpdateListing(
  id: string,
  userId: string,
  patch: ListingEditPatch & Partial<Pick<Listing, "banned">>
): Promise<ApiResult<Listing>> {
  const payload = listingPatchToApiPayload(patch);
  const res = await dataFetch<LegacyListingInput>(`/api/listings/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
    userId,
  });
  if (!res.ok) return res;
  return { ok: true, data: normalizeListing(res.data) };
}

export async function apiFetchReports(): Promise<ApiResult<SupportReport[]>> {
  return dataFetch<SupportReport[]>("/api/reports");
}

export async function apiFetchMyReports(
  userId: string
): Promise<ApiResult<SupportReport[]>> {
  return dataFetch<SupportReport[]>("/api/reports/mine", { userId });
}

export async function apiSubmitReport(
  report: SupportReport
): Promise<ApiResult<null>> {
  return dataFetch<null>("/api/reports", {
    method: "POST",
    body: JSON.stringify(report),
    userId: report.reporterId,
  });
}

export async function apiUpdateReportStatus(
  id: string,
  status: SupportReport["status"]
): Promise<ApiResult<null>> {
  return dataFetch<null>(`/api/reports/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export async function apiPatchMyReport(
  report: SupportReport,
  userId: string
): Promise<ApiResult<SupportReport>> {
  return dataFetch<SupportReport>(`/api/reports/${report.id}`, {
    method: "PATCH",
    body: JSON.stringify(report),
    userId,
  });
}

export async function apiUpsertReport(
  report: SupportReport
): Promise<ApiResult<SupportReport>> {
  return dataFetch<SupportReport>(`/api/reports/${report.id}`, {
    method: "PATCH",
    body: JSON.stringify(report),
  });
}

export async function apiFetchBannedUsers(): Promise<ApiResult<string[]>> {
  return dataFetch<string[]>("/api/banned-users");
}

export async function apiSetBannedUsers(
  ids: string[]
): Promise<ApiResult<null>> {
  return dataFetch<null>("/api/banned-users", {
    method: "PUT",
    body: JSON.stringify({ ids }),
  });
}

export async function apiAdminModerateListing(
  id: string,
  patch: { banned?: boolean; status?: Listing["status"] }
): Promise<ApiResult<Listing>> {
  return dataFetch<Listing>(`/api/admin/listings/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function apiWarnUser(userId: string): Promise<ApiResult<null>> {
  return dataFetch<null>(`/api/users/${userId}/warn`, {
    method: "POST",
    userId,
  });
}

export async function apiFetchUser(
  id: string
): Promise<ApiResult<UserProfile>> {
  return dataFetch<UserProfile>(`/api/users/${id}`);
}

export async function apiUpdateUserAvatar(
  userId: string,
  avatar: string
): Promise<ApiResult<UserProfile>> {
  const safeAvatar = sanitizeAvatarForApi(avatar);
  return dataFetch<UserProfile>(`/api/users/${userId}/avatar`, {
    method: "PATCH",
    body: JSON.stringify({ avatar: safeAvatar }),
    userId,
  });
}

export async function apiUpdateUser(
  user: UserProfile
): Promise<ApiResult<null>> {
  const payload = {
    ...user,
    city: resolveListingCity(user.city, "Vilnius"),
    avatar: sanitizeAvatarForApi(user.avatar),
  };
  return dataFetch<null>(`/api/users/${user.id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
    userId: user.id,
  });
}

export async function apiFetchSaved(
  userId: string
): Promise<ApiResult<string[]>> {
  return dataFetch<string[]>(`/api/saved/${userId}`);
}

export async function apiUpdateSaved(
  userId: string,
  ids: string[]
): Promise<ApiResult<null>> {
  return dataFetch<null>(`/api/saved/${userId}`, {
    method: "PUT",
    body: JSON.stringify({ ids }),
    userId,
  });
}

export async function apiFetchChats(
  userId: string
): Promise<ApiResult<ChatThread[]>> {
  return dataFetch<ChatThread[]>(`/api/chats/${userId}`);
}

export async function apiUpsertChat(
  thread: ChatThread,
  userId: string
): Promise<ApiResult<null>> {
  return dataFetch<null>("/api/chats", {
    method: "PUT",
    body: JSON.stringify(thread),
    userId,
  });
}

export async function apiUpsertEscrow(
  escrow: import("@/lib/types").EscrowTransaction
): Promise<ApiResult<null>> {
  return dataFetch<null>("/api/escrow", {
    method: "PUT",
    body: JSON.stringify(escrow),
    userId: escrow.buyerId,
  });
}

export async function apiAnalyzeReport(body: {
  comment: string;
  category: string;
  listingTitle?: string;
  chatPreview?: string;
}): Promise<import("@/lib/admin-report-ai").ReportAiAnalysis | null> {
  return aiFetch("/api/ai/analyze-report", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function apiExtractImage(body: {
  imageDataUrl: string;
  imageDataUrls?: string[];
  extraContext?: string;
  userCity: string;
  contact: string;
}): Promise<import("@/lib/types").AiExtractedListing | null> {
  return aiFetch(
    "/api/ai/extract-image",
    {
      method: "POST",
      body: JSON.stringify(body),
    },
    AI_VISION_FETCH_TIMEOUT_MS
  );
}

export async function apiExtractText(body: {
  text: string;
  userCity: string;
  contact: string;
  extraContext?: string;
}): Promise<import("@/lib/types").AiExtractedListing | null> {
  return aiFetch("/api/ai/extract-text", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function apiExtractCombined(body: {
  imageDataUrl: string;
  imageDataUrls?: string[];
  text: string;
  extraContext?: string;
  userCity: string;
  contact: string;
}): Promise<import("@/lib/types").AiExtractedListing | null> {
  return aiFetch(
    "/api/ai/extract-combined",
    {
      method: "POST",
      body: JSON.stringify(body),
    },
    AI_VISION_FETCH_TIMEOUT_MS
  );
}

export async function apiVisualRank(body: {
  profile: import("@/lib/visual-search").VisualSearchProfile;
  candidates: {
    id: string;
    title: string;
    category: string;
    price: number;
    location: string;
  }[];
}): Promise<{ scores: Record<string, number> } | null> {
  return aiFetch("/api/ai/visual-rank", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function apiSemanticSearch(body: {
  profile: import("@/lib/visual-search").VisualSearchProfile;
  candidates?: {
    id: string;
    title: string;
    category: string;
    location: string;
    description?: string;
  }[];
  limit?: number;
}): Promise<{ scores: Record<string, number> } | null> {
  return aiFetch("/api/ai/semantic-search", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function apiImageSearch(body: {
  imageDataUrl: string;
  candidates?: { id: string; image: string }[];
  limit?: number;
}): Promise<{ scores: Record<string, number> } | null> {
  return aiFetch("/api/ai/image-search", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function apiSubscribeB2BPlan(planId: string): Promise<
  ApiResult<{
    ok: boolean;
    mode: string;
    message?: string;
    checkoutUrl?: string;
    sessionId?: string;
    user?: UserProfile;
  }>
> {
  return dataFetch("/api/billing/subscribe", {
    method: "POST",
    body: JSON.stringify({ planId }),
  });
}

export async function apiConfirmBillingSession(sessionId: string): Promise<
  ApiResult<{
    ok: boolean;
    mode: string;
    message: string;
    planId: string;
    user: UserProfile;
  }>
> {
  return dataFetch("/api/billing/confirm", {
    method: "POST",
    body: JSON.stringify({ sessionId }),
  });
}

export async function apiBillingPortal(): Promise<
  ApiResult<{ ok: boolean; portalUrl: string }>
> {
  return dataFetch("/api/billing/portal", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function apiAnalyzeSearchIntent(body: {
  query: string;
  userCity?: string;
  wardrobeOnly?: boolean;
}): Promise<import("@/lib/gemini-search-intent").GeminiSearchIntent | null> {
  return aiFetch("/api/ai/analyze-search", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function apiAnalyzeVisualSearchIntent(body: {
  imageDataUrl?: string;
  imageBase64?: string;
  userCity?: string;
  userName?: string;
  extraContext?: string;
  wardrobeOnly?: boolean;
}): Promise<import("@/lib/gemini-search-intent").GeminiVisualSearchIntent | null> {
  return aiFetch("/api/ai/analyze-search-visual", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function apiGenerateDescriptionPersonas(body: {
  title: string;
  category: string;
  price?: number;
  location?: string;
  attributes?: Record<string, string>;
  baseDescription?: string;
}): Promise<import("@/lib/description-personas").BuyerPersonaVariants | null> {
  return aiFetch("/api/ai/generate-description-personas", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function apiAnalyzeWardrobePhoto(body: {
  imageDataUrl: string;
  userName?: string;
}): Promise<import("@/lib/wardrobe-vision").WardrobeVisionAnalysis | null> {
  return aiFetch("/api/ai/analyze-wardrobe-photo", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function apiExpressEscrowLocker(body: {
  escrow: import("@/lib/types").EscrowTransaction;
  courierProvider?: string;
  sellerName?: string;
  listingTitle?: string;
}): Promise<{
  escrow: import("@/lib/types").EscrowTransaction;
  sellerNotification: string;
} | null> {
  return aiFetch("/api/ai/express-escrow-locker", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function apiProcessExpressEscrow(body: {
  escrow: import("@/lib/types").EscrowTransaction;
}): Promise<{
  autoConfirmed: boolean;
  escrow: import("@/lib/types").EscrowTransaction;
} | null> {
  return aiFetch("/api/ai/process-express-escrow", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function apiImportWardrobeProfile(body: {
  profileUrl: string;
  userName?: string;
  defaultLocation?: string;
}): Promise<import("@/lib/wardrobe-profile-importer").WardrobeProfileImport | null> {
  return aiFetch("/api/ai/import-wardrobe-profile", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function apiMagicMirrorFit(body: {
  buyerName: string;
  listingTitle: string;
  buyerMeasurements: import("@/lib/types").BodyMeasurements;
  garmentMeasurements: Record<string, unknown>;
  listingDescription?: string;
}): Promise<import("@/lib/magic-mirror").MagicMirrorFit | null> {
  return aiFetch("/api/ai/magic-mirror-fit", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function apiPriceAppraisal(body: {
  category: string;
  imageMetadata: Record<string, unknown>;
}): Promise<import("@/lib/price-appraisal").PriceAppraisalResult | null> {
  return aiFetch("/api/ai/price-appraisal", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function apiNegotiationTwin(body: {
  buyerMessage: string;
  listingPrice: number;
  minPrice: number;
  listingTitle: string;
  sellerName: string;
  sellerApproved?: boolean;
  autoNegotiationEnabled?: boolean;
}): Promise<import("@/lib/chat-agent-client").NegotiationTwinReply | null> {
  return aiFetch("/api/ai/negotiation-twin", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function apiChatShield(body: {
  message: string;
  listingPrice: number;
  listingTitle: string;
  sellerName?: string;
}): Promise<import("@/lib/chat-shield-client").ChatShieldClientResult | null> {
  return aiFetch("/api/ai/chat-shield", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function apiAnalyzeVoice(body: {
  transcript: string;
  mode: "search" | "listing";
  history: { role: "user" | "assistant"; text: string }[];
  userCity: string;
  userName?: string;
  accountType?: string;
  myListingsSummary?: string;
  isAuthenticated?: boolean;
}): Promise<import("@/lib/voice-intent").VoiceIntentAnalysis | null> {
  return aiFetch("/api/ai/analyze-voice", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function apiReferenceImages(body: {
  query: string;
  category?: string;
  limit?: number;
}): Promise<string[] | null> {
  const data = await aiFetch<{ images: string[] }>("/api/ai/reference-images", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return data?.images ?? null;
}

export async function apiImportListingFromUrl(body: {
  url: string;
  userCity: string;
  contact: string;
}): Promise<
  | { ok: true; data: import("@/lib/types").AiExtractedListing }
  | { ok: false; error: string; code?: string }
> {
  for (const base of getAiBaseUrls()) {
    const result = await aiFetchOnce<import("@/lib/types").AiExtractedListing>(
      base,
      "/api/ai/import-url",
      { method: "POST", body: JSON.stringify(body) },
      AI_FETCH_TIMEOUT_MS
    );
    if (result.data) return { ok: true, data: result.data };
    if (result.error) {
      return { ok: false, error: result.error, code: result.code };
    }
  }
  return { ok: false, error: "AI serveris nepasiekiamas.", code: "unavailable" };
}

export interface ApiServiceLead {
  id: string;
  title: string;
  city: string;
  category: string;
  summary: string;
  urgency: "today" | "this_week" | "flexible";
  budgetHint: string;
  leadPrice: number;
  createdAt: string;
  hiddenContact: string;
  contactPhone?: string;
  requiredSpecialties: string[];
  source?: "demo" | "buyer";
  sourceUserId?: string;
  query?: string;
  opened?: boolean;
}

export function mapApiServiceLead(lead: ApiServiceLead): import("@/lib/service-leads").ServiceLead {
  return {
    id: lead.id,
    title: lead.title,
    city: lead.city,
    category: lead.category,
    summary: lead.summary,
    urgency: lead.urgency,
    budgetHint: lead.budgetHint,
    leadPrice: lead.leadPrice,
    createdAt: lead.createdAt,
    hiddenContact: lead.hiddenContact,
    contactPhone: lead.contactPhone,
    requiredSpecialties: lead.requiredSpecialties,
    source: lead.source ?? "buyer",
    sourceUserId: lead.sourceUserId,
    query: lead.query,
    opened: lead.opened,
  };
}

export async function apiFetchServiceLeads(): Promise<
  ApiResult<import("@/lib/service-leads").ServiceLead[]>
> {
  const r = await dataFetch<ApiServiceLead[]>("/api/service-leads");
  if (!r.ok) return r;
  return { ok: true, data: r.data.map(mapApiServiceLead) };
}

export async function apiCreateServiceLead(
  lead: import("@/lib/service-leads").ServiceLead
): Promise<ApiResult<import("@/lib/service-leads").ServiceLead>> {
  const r = await dataFetch<ApiServiceLead>("/api/service-leads", {
    method: "POST",
    body: JSON.stringify({
      title: lead.title,
      city: lead.city,
      category: lead.category,
      summary: lead.summary,
      urgency: lead.urgency,
      budgetHint: lead.budgetHint,
      leadPrice: lead.leadPrice,
      hiddenContact: lead.hiddenContact,
      contactPhone: lead.contactPhone ?? lead.hiddenContact,
      requiredSpecialties: lead.requiredSpecialties,
      query: lead.query,
    }),
  });
  if (!r.ok) return r;
  return { ok: true, data: mapApiServiceLead(r.data) };
}

export async function apiOpenServiceLead(
  leadId: string,
  cost: number
): Promise<
  ApiResult<{ walletBalance: number; lead: import("@/lib/service-leads").ServiceLead }>
> {
  const r = await dataFetch<{ walletBalance: number; lead: ApiServiceLead }>(
    `/api/service-leads/${encodeURIComponent(leadId)}/open`,
    {
      method: "POST",
      body: JSON.stringify({ cost }),
    }
  );
  if (!r.ok) return r;
  return {
    ok: true,
    data: {
      walletBalance: r.data.walletBalance,
      lead: mapApiServiceLead(r.data.lead),
    },
  };
}

export async function apiLookupVehicle(
  identifier: string
): Promise<import("@/lib/vehicle-intelligence/vehicle-lookup").VehicleLookupResult | null> {
  const r = await dataFetch<
    import("@/lib/vehicle-intelligence/vehicle-lookup").VehicleLookupResult & {
      identifier?: string;
    }
  >("/api/vehicle/lookup", {
    method: "POST",
    body: JSON.stringify({ identifier }),
  });
  if (!r.ok) return null;
  const { identifier: _ignored, ...rest } = r.data;
  void _ignored;
  return rest;
}
