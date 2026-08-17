import type { TransitionEdge } from "../../transition-matrix.js";
import {
  PolicyForbiddenError,
  type ActorType,
  type TransactionStatus,
} from "../../types.js";
import type { FulfillmentPolicy } from "../types.js";

/**
 * Real-estate / jobs style: contact + dual-party verified interaction.
 * No PAID / SHIPPED / COMPLETED purchase statuses (no fake property sale).
 * CONTACT_ACCEPTED → INTERACTION_CLAIMED (one party) →
 * INTERACTION_CONFIRMED (counterparty) → INTERACTION_COMPLETED.
 */
const MATRIX: Partial<Record<string, readonly TransitionEdge[]>> = {
  DISCUSSION: [
    {
      to: "CONTACT_ACCEPTED",
      actors: ["BUYER", "SELLER", "ADMIN", "SYSTEM"],
      requiredReasons: ["CONTACT_ACCEPTED", "MUTUAL_AGREEMENT", "SYSTEM_TRANSITION"],
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
  CONTACT_ACCEPTED: [
    {
      to: "INTERACTION_CLAIMED",
      actors: ["BUYER", "SELLER"],
      requiredReasons: ["INTERACTION_CLAIMED", "MUTUAL_AGREEMENT"],
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
  INTERACTION_CLAIMED: [
    {
      to: "INTERACTION_CONFIRMED",
      actors: ["BUYER", "SELLER", "ADMIN"],
      requiredReasons: ["INTERACTION_CONFIRMED", "MUTUAL_AGREEMENT"],
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
  INTERACTION_CONFIRMED: [
    {
      to: "INTERACTION_COMPLETED",
      actors: ["BUYER", "SELLER", "ADMIN", "SYSTEM"],
      requiredReasons: [
        "INTERACTION_COMPLETED",
        "MUTUAL_AGREEMENT",
        "SYSTEM_TRANSITION",
        "TIMEOUT_EXPIRED",
      ],
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
  INTERACTION_COMPLETED: [],
};

export function assertDirectContactCounterparty(input: {
  from: TransactionStatus;
  to: TransactionStatus;
  actorType: ActorType;
  actorId: string;
  buyerId: string;
  sellerId: string;
  claimedBy: string | null;
}): void {
  const isBuyer = input.actorId === input.buyerId;
  const isSeller = input.actorId === input.sellerId;
  const isParty = isBuyer || isSeller;

  if (input.to === "INTERACTION_CLAIMED") {
    if (input.actorType !== "BUYER" && input.actorType !== "SELLER") {
      throw new PolicyForbiddenError(
        input.from,
        input.to,
        input.actorType,
        "Only a deal party may claim the interaction"
      );
    }
    if (!isParty) {
      throw new PolicyForbiddenError(
        input.from,
        input.to,
        input.actorType,
        "Actor is not a party to this transaction"
      );
    }
    return;
  }

  if (input.to === "INTERACTION_CONFIRMED") {
    if (input.actorType === "ADMIN") return;
    if (!isParty) {
      throw new PolicyForbiddenError(
        input.from,
        input.to,
        input.actorType,
        "Actor is not a party to this transaction"
      );
    }
    if (!input.claimedBy) {
      throw new PolicyForbiddenError(
        input.from,
        input.to,
        input.actorType,
        "Interaction has not been claimed"
      );
    }
    if (input.actorId === input.claimedBy) {
      throw new PolicyForbiddenError(
        input.from,
        input.to,
        input.actorType,
        "Counterparty confirmation is required"
      );
    }
    const claimedIsBuyer = input.claimedBy === input.buyerId;
    const claimedIsSeller = input.claimedBy === input.sellerId;
    const ok =
      (claimedIsBuyer && isSeller) || (claimedIsSeller && isBuyer);
    if (!ok) {
      throw new PolicyForbiddenError(
        input.from,
        input.to,
        input.actorType,
        "Counterparty confirmation is required"
      );
    }
  }
}

export const DirectContactPolicy: FulfillmentPolicy = {
  id: "DIRECT_CONTACT",
  findEdge(from, to, actorType): TransitionEdge | null {
    const edges = MATRIX[from] ?? [];
    return edges.find((e) => e.to === to && e.actors.includes(actorType)) ?? null;
  },
  forbidsUnauthenticatedCompletion(_from, to) {
    return to === "COMPLETED" || to === "PAID" || to === "SHIPPED";
  },
};
