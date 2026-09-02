import { dataFetch } from "@/lib/api/client";
import type { Listing } from "@/lib/types";

/**
 * F6.1/F6.2 — professional seller bulk listing control client.
 * Mirrors the server contract of /api/bulk-listings (preview → human
 * confirmation → durable execution → safe recovery). The client NEVER
 * decides execution eligibility — `executionEnabled` comes from the server
 * and a disabled gate makes /confirm unreachable by construction.
 */

export type BulkPreviewVerdict = {
  status: "owned" | "foreign" | "not_found" | "invalid";
  listingId: string;
  title?: string;
  category?: string;
};

export type BulkPreviewProposal = {
  operation: "hide" | "republish";
  expiresAt: number;
  items: BulkPreviewVerdict[];
  ownedCount: number;
  warnings: string[];
};

export type BulkPreviewResponse = {
  digest: string | null;
  proposal: BulkPreviewProposal;
  executionEnabled: boolean;
};

export type BulkOutcome = {
  id: string;
  status: "success" | "failed" | "skipped";
  detail?: string;
  reason?: string;
};

export type BulkConfirmResponse = {
  ok: boolean;
  code?: string;
  error?: string;
  state?: string;
  outcomes?: BulkOutcome[];
  audit?: unknown[];
  executed?: boolean;
  replayed?: boolean;
};

export type BulkRecoverResponse = BulkConfirmResponse;

export async function apiBulkPreview(input: {
  listingIds: string[];
  operation: "hide" | "republish";
}): Promise<
  | { ok: true; data: BulkPreviewResponse }
  | { ok: false; error: string; status?: number }
> {
  return dataFetch<BulkPreviewResponse>("/api/bulk-listings/preview", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function apiBulkConfirm(input: {
  digest: string;
  proposalExpiresAt: number;
  operation: "hide" | "republish";
  listingIds: string[];
  idempotencyKey: string;
}): Promise<
  | { ok: true; data: BulkConfirmResponse }
  | { ok: false; error: string; status?: number }
> {
  return dataFetch<BulkConfirmResponse>("/api/bulk-listings/confirm", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function apiBulkRecover(input: {
  operation: "hide" | "republish";
  idempotencyKey: string;
}): Promise<
  | { ok: true; data: BulkRecoverResponse }
  | { ok: false; error: string; status?: number }
> {
  return dataFetch<BulkRecoverResponse>("/api/bulk-listings/recover", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export type ListingSummary = Pick<
  Listing,
  "id" | "title" | "status" | "category"
> & { sellerId?: string };
