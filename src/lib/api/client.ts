import type { ChatThread, Listing, SupportReport, UserProfile } from "@/lib/types";
import type { ListingEditPatch } from "@/lib/listing-edit";
import { AI_FETCH_TIMEOUT_MS } from "@/lib/ai-safeguards";
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

async function aiFetch<T>(
  path: string,
  opts?: RequestInit
): Promise<T | null> {
  const base = getAiBaseUrl();
  if (!base) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_FETCH_TIMEOUT_MS);

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
  };
}

export async function apiHealthCheck(): Promise<boolean> {
  const r = await apiFetchHealthDetails();
  return r.ok && r.data.ok === true;
}

export async function apiFetchHealthDetails(): Promise<ApiResult<ApiHealthDetails>> {
  return dataFetch<ApiHealthDetails>("/api/health");
}

export async function apiAiHealthCheck(): Promise<{
  ok: boolean;
  openai: boolean;
  mode: "server" | "demo";
} | null> {
  return aiFetch("/api/ai/health");
}

export async function apiFetchListings(): Promise<ApiResult<Listing[]>> {
  return dataFetch<Listing[]>("/api/listings");
}

export async function apiCreateListing(
  listing: Listing,
  userId: string
): Promise<ApiResult<null>> {
  return dataFetch<null>("/api/listings", {
    method: "POST",
    body: JSON.stringify(listing),
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
  return dataFetch<null>(`/api/users/${user.id}`, {
    method: "PUT",
    body: JSON.stringify(user),
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
  return aiFetch("/api/ai/extract-image", {
    method: "POST",
    body: JSON.stringify(body),
  });
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
  return aiFetch("/api/ai/extract-combined", {
    method: "POST",
    body: JSON.stringify(body),
  });
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

export async function apiSubscribeB2BPlan(planId: string): Promise<
  ApiResult<{
    ok: boolean;
    mode: string;
    message: string;
    user: UserProfile;
  }>
> {
  return dataFetch("/api/billing/subscribe", {
    method: "POST",
    body: JSON.stringify({ planId }),
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
