import type { ChatThread, Listing, UserProfile } from "@/lib/types";
import { getAiBaseUrl, getDataApiBaseUrl } from "./config";

async function dataFetch<T>(
  path: string,
  opts?: RequestInit & { userId?: string }
): Promise<T | null> {
  const base = getDataApiBaseUrl();
  if (!base) return null;

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(opts?.userId ? { "X-User-Id": opts.userId } : {}),
    };
    const res = await fetch(`${base}${path}`, {
      ...opts,
      headers: { ...headers, ...(opts?.headers as Record<string, string>) },
    });
    if (!res.ok) return null;
    if (res.status === 204) return null as T;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function aiFetch<T>(
  path: string,
  opts?: RequestInit
): Promise<T | null> {
  const base = getAiBaseUrl();
  if (!base) return null;

  try {
    const res = await fetch(`${base}${path}`, {
      ...opts,
      headers: {
        "Content-Type": "application/json",
        ...(opts?.headers as Record<string, string>),
      },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function apiHealthCheck(): Promise<boolean> {
  const data = await dataFetch<{ ok: boolean }>("/api/health");
  return data?.ok === true;
}

export async function apiAiHealthCheck(): Promise<{
  ok: boolean;
  openai: boolean;
  mode: "server" | "demo";
} | null> {
  return aiFetch("/api/ai/health");
}

export async function apiFetchListings(): Promise<Listing[] | null> {
  return dataFetch<Listing[]>("/api/listings");
}

export async function apiCreateListing(
  listing: Listing,
  userId: string
): Promise<void> {
  await dataFetch("/api/listings", {
    method: "POST",
    body: JSON.stringify(listing),
    userId,
  });
}

export async function apiDeleteListing(
  id: string,
  userId: string
): Promise<void> {
  await dataFetch(`/api/listings/${id}`, { method: "DELETE", userId });
}

export async function apiFetchUser(id: string): Promise<UserProfile | null> {
  return dataFetch<UserProfile>(`/api/users/${id}`);
}

export async function apiUpdateUser(user: UserProfile): Promise<void> {
  await dataFetch(`/api/users/${user.id}`, {
    method: "PUT",
    body: JSON.stringify(user),
    userId: user.id,
  });
}

export async function apiFetchSaved(userId: string): Promise<string[] | null> {
  return dataFetch<string[]>(`/api/saved/${userId}`);
}

export async function apiUpdateSaved(
  userId: string,
  ids: string[]
): Promise<void> {
  await dataFetch(`/api/saved/${userId}`, {
    method: "PUT",
    body: JSON.stringify({ ids }),
    userId,
  });
}

export async function apiFetchChats(userId: string): Promise<ChatThread[] | null> {
  return dataFetch<ChatThread[]>(`/api/chats/${userId}`);
}

export async function apiUpsertChat(
  thread: ChatThread,
  userId: string
): Promise<void> {
  await dataFetch("/api/chats", {
    method: "PUT",
    body: JSON.stringify(thread),
    userId,
  });
}

export async function apiUpsertEscrow(
  escrow: import("@/lib/types").EscrowTransaction
): Promise<void> {
  await dataFetch("/api/escrow", {
    method: "PUT",
    body: JSON.stringify(escrow),
    userId: escrow.buyerId,
  });
}

export async function apiExtractImage(body: {
  imageDataUrl: string;
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
