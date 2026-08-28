/**
 * VAUTO AI Maturity — Phase 1: Consequential Action Confirmation Boundary.
 *
 * Client-side calls for the ONLY endpoints that may execute
 * `markListingSold` / `blockListing`. Both require the exact opaque
 * `pendingActionId` minted server-side by the tool proposal — there is no
 * way to trigger execution from chat text alone (see
 * server/src/ai/confirmation/consequential-action-policy.ts).
 */
import { dataFetch, type ApiResult } from "@/lib/api/client";

export type ConsequentialActionType = "markListingSold" | "blockListing";

export interface ConsequentialActionExecutionResult {
  ok: boolean;
  listingId: string;
  title?: string;
  reason?: "ownership_changed" | "role_changed" | "target_not_found";
}

export interface ConfirmConsequentialActionResponse {
  ok: true;
  replay: boolean;
  result: ConsequentialActionExecutionResult;
}

/** Must be called ONLY after an explicit user confirmation (e.g. showConfirm dialog). */
export async function apiConfirmConsequentialAction(
  pendingActionId: string,
  type: ConsequentialActionType,
  targetId: string
): Promise<ApiResult<ConfirmConsequentialActionResponse>> {
  return dataFetch<ConfirmConsequentialActionResponse>(
    "/api/consequential-actions/confirm",
    {
      method: "POST",
      body: JSON.stringify({ pendingActionId, type, targetId }),
    }
  );
}

export async function apiCancelConsequentialAction(
  pendingActionId: string
): Promise<ApiResult<{ ok: true }>> {
  return dataFetch<{ ok: true }>("/api/consequential-actions/cancel", {
    method: "POST",
    body: JSON.stringify({ pendingActionId }),
  });
}
