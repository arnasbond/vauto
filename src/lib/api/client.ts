import type { ChatThread, Listing, SupportReport, UserProfile } from "@/lib/types";
import type { ListingEditPatch } from "@/lib/listing-edit";
import { resolveListingCity } from "@/lib/city-resolve";
import {
  AI_FETCH_TIMEOUT_MS,
  AI_VISION_FETCH_TIMEOUT_MS,
} from "@/lib/ai-safeguards";
import { getAiBaseUrl, getDataApiBaseUrl } from "./config";
import { getAuthHeaders } from "@/lib/auth/session";

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

async function aiFetchOnce<T>(
  base: string,
  path: string,
  opts: RequestInit | undefined,
  timeoutMs: number
): Promise<T | null> {
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
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function aiFetch<T>(
  path: string,
  opts?: RequestInit,
  timeoutMs = AI_FETCH_TIMEOUT_MS
): Promise<T | null> {
  for (const base of getAiBaseUrls()) {
    const data = await aiFetchOnce<T>(base, path, opts, timeoutMs);
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
    openai?: boolean;
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
  adminProjectContext?: string;
}): Promise<import("@/lib/vauto-agent-client").VautoAgentResponse | null> {
  return aiFetch("/api/vauto-agent", {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(body),
  }, AI_VISION_FETCH_TIMEOUT_MS);
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
  openai: boolean;
  provider?: string | null;
  mode: string;
} | null> {
  for (const base of getAiBaseUrls()) {
    const health = await aiFetchOnce<{
      ok: boolean;
      openai: boolean;
      provider?: string | null;
      mode: string;
    }>(base, "/api/ai/health", undefined, 8_000);
    if (health?.openai) return health;
  }
  return aiFetch("/api/ai/health", undefined, 8_000);
}

export async function apiFetchListings(): Promise<ApiResult<Listing[]>> {
  return dataFetch<Listing[]>("/api/listings");
}

export async function apiCreateListing(
  listing: Listing,
  userId: string
): Promise<ApiResult<Listing>> {
  const payload: Listing = {
    ...listing,
    location: resolveListingCity(listing.location, "Vilnius"),
  };
  return dataFetch<Listing>("/api/listings", {
    method: "POST",
    body: JSON.stringify(payload),
    userId,
  });
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
  return dataFetch<Listing>(`/api/listings/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
    userId,
  });
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

export async function apiUpdateUser(
  user: UserProfile
): Promise<ApiResult<null>> {
  const payload = {
    ...user,
    city: resolveListingCity(user.city, "Vilnius"),
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

export async function apiTranscribeAudio(body: {
  audioBase64: string;
  mimeType?: string;
}): Promise<{ text: string } | null> {
  return aiFetch("/api/ai/transcribe-audio", {
    method: "POST",
    body: JSON.stringify(body),
  });
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

export async function apiAnalyzeVoice(body: {
  transcript: string;
  mode: "search" | "listing";
  history: { role: "user" | "assistant"; text: string }[];
  userCity: string;
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
