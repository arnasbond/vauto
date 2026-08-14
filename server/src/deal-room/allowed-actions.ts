/**
 * Deterministic Deal Room allowed actions — role + 11A state + active offer.
 * Never invents PAY/SHIP (11F+).
 */

import type { DealRoomAllowedAction } from "./types.js";

const NEGOTIABLE = new Set([
  "DISCUSSION",
  "OFFER_PENDING",
  "NEGOTIATING",
]);

export function computeDealRoomAllowedActions(input: {
  viewerRole: "BUYER" | "SELLER";
  transactionStatus: string;
  activeOffer: {
    status: string;
    createdByRole: "BUYER" | "SELLER";
  } | null;
}): DealRoomAllowedAction[] {
  const { viewerRole, transactionStatus, activeOffer } = input;
  const actions: DealRoomAllowedAction[] = [];

  const terminal = new Set([
    "COMPLETED",
    "CANCELLED",
    "EXPIRED",
    "DISPUTED",
  ]);
  if (!terminal.has(transactionStatus)) {
    actions.push("SEND_MESSAGE");
  }

  if (NEGOTIABLE.has(transactionStatus)) {
    actions.push("OPEN_COPILOT", "DRAFT_COPILOT_MESSAGE");

    if (transactionStatus === "DISCUSSION" && !activeOffer) {
      if (viewerRole === "BUYER") actions.push("CREATE_OFFER");
    }

    if (activeOffer && activeOffer.status === "PENDING") {
      const isCreator = activeOffer.createdByRole === viewerRole;
      if (isCreator) {
        actions.push("WITHDRAW_OFFER");
      } else {
        actions.push("ACCEPT_OFFER", "REJECT_OFFER");
      }
      actions.push("COUNTER_OFFER");
      if (viewerRole === "BUYER" && !isCreator) {
        // buyer can still open counter path
      }
      if (
        viewerRole === "BUYER" &&
        transactionStatus !== "DISCUSSION"
      ) {
        // create new tip only when no pending — already gated
      }
    }

    if (
      !activeOffer &&
      (transactionStatus === "OFFER_PENDING" ||
        transactionStatus === "NEGOTIATING")
    ) {
      if (viewerRole === "BUYER") actions.push("CREATE_OFFER");
    }
  }

  // Explicitly never add PAY / SHIP / escrow in 11E
  return [...new Set(actions)];
}
