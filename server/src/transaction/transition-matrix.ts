/**
 * Strict allowed-transitions matrix by actor role.
 * Illegal jumps (e.g. DISCUSSION → PAID) are absent and rejected.
 */

import type { ActorType, ReasonCode, TransactionStatus } from "./types.js";

/** Edge: from → to allowed for listed actors (optionally gated by reason). */
export type TransitionEdge = {
  to: TransactionStatus;
  actors: readonly ActorType[];
  /** If set, reasonCode must be one of these. */
  requiredReasons?: readonly ReasonCode[];
};

/**
 * Canonical matrix — Stage 11A.
 * COMPLETED / CANCELLED / EXPIRED are terminal (empty outbound).
 * DISPUTED is resolvable by ADMIN/SYSTEM only (11H.1).
 */
export const TRANSITION_MATRIX: Readonly<
  Record<TransactionStatus, readonly TransitionEdge[]>
> = {
  DISCUSSION: [
    // H-02: buyer opens negotiation; SYSTEM/ADMIN reserved for ops recovery
    {
      to: "OFFER_PENDING",
      actors: ["BUYER"],
      requiredReasons: ["OFFER_SUBMITTED"],
    },
    {
      to: "OFFER_PENDING",
      actors: ["SYSTEM", "ADMIN"],
      requiredReasons: ["SYSTEM_TRANSITION"],
    },
    {
      to: "CANCELLED",
      actors: ["BUYER", "SELLER", "ADMIN", "SYSTEM"],
      requiredReasons: [
        "BUYER_CANCELLED",
        "SELLER_CANCELLED",
        "ADMIN_CANCELLED",
        "SYSTEM_TRANSITION",
      ],
    },
  ],
  OFFER_PENDING: [
    {
      to: "NEGOTIATING",
      actors: ["BUYER", "SELLER", "SYSTEM", "ADMIN"],
      requiredReasons: ["COUNTER_OFFER", "OFFER_SUBMITTED", "SYSTEM_TRANSITION"],
    },
    {
      to: "AGREED",
      actors: ["BUYER", "SELLER", "ADMIN"],
      requiredReasons: ["OFFER_ACCEPTED", "MUTUAL_AGREEMENT"],
    },
    {
      to: "EXPIRED",
      actors: ["SYSTEM", "ADMIN"],
      requiredReasons: ["TIMEOUT_EXPIRED", "SYSTEM_TRANSITION"],
    },
    {
      to: "CANCELLED",
      actors: ["BUYER", "SELLER", "ADMIN", "SYSTEM"],
      requiredReasons: [
        "BUYER_CANCELLED",
        "SELLER_CANCELLED",
        "ADMIN_CANCELLED",
        "SYSTEM_TRANSITION",
      ],
    },
  ],
  NEGOTIATING: [
    {
      to: "AGREED",
      actors: ["BUYER", "SELLER", "ADMIN"],
      requiredReasons: ["OFFER_ACCEPTED", "MUTUAL_AGREEMENT"],
    },
    {
      to: "OFFER_PENDING",
      actors: ["BUYER", "SELLER", "SYSTEM", "ADMIN"],
      requiredReasons: ["OFFER_SUBMITTED", "COUNTER_OFFER", "SYSTEM_TRANSITION"],
    },
    {
      to: "CANCELLED",
      actors: ["BUYER", "SELLER", "ADMIN", "SYSTEM"],
      requiredReasons: [
        "BUYER_CANCELLED",
        "SELLER_CANCELLED",
        "ADMIN_CANCELLED",
        "SYSTEM_TRANSITION",
      ],
    },
    {
      to: "EXPIRED",
      actors: ["SYSTEM", "ADMIN"],
      requiredReasons: ["TIMEOUT_EXPIRED", "SYSTEM_TRANSITION"],
    },
  ],
  AGREED: [
    {
      to: "PAYMENT_PENDING",
      actors: ["BUYER", "SELLER", "SYSTEM", "ADMIN"],
      requiredReasons: ["PAYMENT_REQUESTED", "SYSTEM_TRANSITION", "MUTUAL_AGREEMENT"],
    },
    {
      to: "CANCELLED",
      actors: ["BUYER", "SELLER", "ADMIN", "SYSTEM"],
      requiredReasons: [
        "BUYER_CANCELLED",
        "SELLER_CANCELLED",
        "ADMIN_CANCELLED",
        "SYSTEM_TRANSITION",
      ],
    },
  ],
  PAYMENT_PENDING: [
    {
      to: "PAID",
      actors: ["SYSTEM", "ADMIN"],
      requiredReasons: ["PAYMENT_CONFIRMED", "SYSTEM_TRANSITION"],
    },
    {
      to: "EXPIRED",
      actors: ["SYSTEM", "ADMIN"],
      requiredReasons: ["TIMEOUT_EXPIRED", "SYSTEM_TRANSITION"],
    },
    {
      to: "CANCELLED",
      actors: ["BUYER", "SELLER", "ADMIN", "SYSTEM"],
      requiredReasons: [
        "BUYER_CANCELLED",
        "SELLER_CANCELLED",
        "ADMIN_CANCELLED",
        "SYSTEM_TRANSITION",
      ],
    },
  ],
  PAID: [
    {
      to: "SHIPPING_PENDING",
      actors: ["SELLER", "SYSTEM", "ADMIN"],
      requiredReasons: ["SHIPMENT_READY", "SYSTEM_TRANSITION"],
    },
    {
      to: "DISPUTED",
      actors: ["BUYER", "SELLER", "ADMIN", "SYSTEM"],
      requiredReasons: ["DISPUTE_OPENED"],
    },
    {
      // Refund-gated cancel only — never a free jump out of PAID.
      to: "CANCELLED",
      actors: ["ADMIN", "SYSTEM"],
      requiredReasons: ["REFUND_APPROVED"],
    },
  ],
  SHIPPING_PENDING: [
    {
      to: "SHIPPED",
      actors: ["SELLER", "SYSTEM", "ADMIN"],
      requiredReasons: ["SHIPPED_CONFIRMED", "SYSTEM_TRANSITION"],
    },
    {
      to: "DISPUTED",
      actors: ["BUYER", "SELLER", "ADMIN", "SYSTEM"],
      requiredReasons: ["DISPUTE_OPENED"],
    },
  ],
  SHIPPED: [
    {
      to: "DELIVERED",
      actors: ["BUYER", "SELLER", "SYSTEM", "ADMIN"],
      requiredReasons: ["DELIVERY_CONFIRMED", "SYSTEM_TRANSITION"],
    },
    {
      to: "DISPUTED",
      actors: ["BUYER", "SELLER", "ADMIN", "SYSTEM"],
      requiredReasons: ["DISPUTE_OPENED"],
    },
  ],
  DELIVERED: [
    {
      to: "COMPLETED",
      actors: ["BUYER", "SELLER", "SYSTEM", "ADMIN"],
      requiredReasons: ["COMPLETION_CONFIRMED", "SYSTEM_TRANSITION", "MUTUAL_AGREEMENT"],
    },
    {
      to: "DISPUTED",
      actors: ["BUYER", "SELLER", "ADMIN", "SYSTEM"],
      requiredReasons: ["DISPUTE_OPENED"],
    },
  ],
  COMPLETED: [],
  CANCELLED: [],
  EXPIRED: [],
  DISPUTED: [
    {
      to: "CANCELLED",
      actors: ["ADMIN", "SYSTEM"],
      requiredReasons: ["DISPUTE_RESOLVED_BUYER_REFUND"],
    },
    {
      to: "COMPLETED",
      actors: ["ADMIN", "SYSTEM"],
      requiredReasons: ["DISPUTE_RESOLVED_SELLER_PAYOUT"],
    },
  ],
};

export function listAllowedTargets(
  from: TransactionStatus,
  actorType: ActorType
): TransactionStatus[] {
  return TRANSITION_MATRIX[from]
    .filter((e) => e.actors.includes(actorType))
    .map((e) => e.to);
}

export function findTransitionEdge(
  from: TransactionStatus,
  to: TransactionStatus,
  actorType: ActorType
): TransitionEdge | null {
  const edge = TRANSITION_MATRIX[from].find(
    (e) => e.to === to && e.actors.includes(actorType)
  );
  return edge ?? null;
}

export function isTerminalStatus(status: TransactionStatus): boolean {
  return TRANSITION_MATRIX[status].length === 0;
}
