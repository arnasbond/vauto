/**
 * VAUTO AI Maturity — Phase 2A audit remediation.
 *
 * Extracted, behavior-preserving from `VautoAgentContext.tsx`'s
 * `block_listing` / `mark_listing_sold` sideEffect handlers so the REAL
 * dialog → confirm/cancel wiring (not a re-implementation of it) can be
 * integration-tested without rendering the whole provider tree.
 *
 * `VautoAgentContext.tsx` calls these two functions verbatim, passing its
 * own `showConfirm` (from `VautoContext`, backed by
 * `confirm-dialog-queue.ts`) and its own success/error/state callbacks.
 * The confirm/cancel HTTP calls always go through the real
 * `apiConfirmConsequentialAction` / `apiCancelConsequentialAction` client
 * wrapper (`consequential-action-confirm.ts`) — never re-implemented here.
 */
import {
  apiCancelConsequentialAction,
  apiConfirmConsequentialAction,
} from "@/lib/consequential-action-confirm";

export interface ConfirmDialogPrompt {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "danger";
}

export interface BlockListingSideEffect {
  listingId: string;
  reason: string;
  listingTitle?: string;
  pendingActionId: string;
}

export interface MarkListingSoldSideEffect {
  listingId: string;
  title?: string;
  pendingActionId: string;
}

export interface ConsequentialActionDialogCallbacks {
  showConfirm: (prompt: ConfirmDialogPrompt) => Promise<boolean>;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}

/** Mirrors the exact `block_listing` sideEffect handler previously inlined in VautoAgentContext.tsx. */
export async function handleBlockListingSideEffect(
  sideEffect: BlockListingSideEffect,
  deps: ConsequentialActionDialogCallbacks & { onBanned: (listingId: string) => void }
): Promise<void> {
  const { listingId, pendingActionId, listingTitle, reason } = sideEffect;
  const confirmed = await deps.showConfirm({
    title: "Patvirtinti skelbimo blokavimą",
    message: listingTitle
      ? `Užblokuoti skelbimą „${listingTitle}"?${reason ? ` Priežastis: ${reason}.` : ""}`
      : `Užblokuoti skelbimą ${listingId}?${reason ? ` Priežastis: ${reason}.` : ""}`,
    confirmLabel: "Taip, blokuoti",
    cancelLabel: "Atšaukti",
    variant: "danger",
  });
  if (!confirmed) {
    void apiCancelConsequentialAction(pendingActionId).catch(() => {});
    return;
  }
  const res = await apiConfirmConsequentialAction(pendingActionId, "blockListing", listingId);
  if (res.ok && res.data.result.ok) {
    deps.onBanned(listingId);
    deps.onSuccess(
      listingTitle ? `AI užblokavo: ${listingTitle}` : `Skelbimas užblokuotas (${listingId})`
    );
  } else {
    deps.onError(res.ok ? "Nepavyko užblokuoti — patikrinkite teises." : res.error);
  }
}

/** Mirrors the exact `mark_listing_sold` sideEffect handler previously inlined in VautoAgentContext.tsx. */
export async function handleMarkListingSoldSideEffect(
  sideEffect: MarkListingSoldSideEffect,
  deps: ConsequentialActionDialogCallbacks & { onMarkedSold: (listingId: string) => void }
): Promise<void> {
  const { listingId, pendingActionId, title } = sideEffect;
  const confirmed = await deps.showConfirm({
    title: "Patvirtinti pardavimą",
    message: title
      ? `Pažymėti skelbimą „${title}" kaip parduotą?`
      : "Pažymėti skelbimą kaip parduotą?",
    confirmLabel: "Taip, pažymėti parduotu",
    cancelLabel: "Atšaukti",
  });
  if (!confirmed) {
    void apiCancelConsequentialAction(pendingActionId).catch(() => {});
    return;
  }
  const res = await apiConfirmConsequentialAction(pendingActionId, "markListingSold", listingId);
  if (res.ok && res.data.result.ok) {
    deps.onMarkedSold(listingId);
    deps.onSuccess(title ? `Skelbimas archyvuotas: ${title}` : "Skelbimas pažymėtas parduotu");
  } else {
    deps.onError(res.ok ? "Nepavyko archyvuoti — patikrinkite savininko teises." : res.error);
  }
}
