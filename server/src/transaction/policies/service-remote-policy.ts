import type { TransitionEdge } from "../transition-matrix.js";
import { TRANSITION_MATRIX } from "../transition-matrix.js";
import type { TransactionStatus } from "../types.js";
import type { FulfillmentPolicy } from "./types.js";

function copyNegotiation(): Record<TransactionStatus, readonly TransitionEdge[]> {
  return {
    ...TRANSITION_MATRIX,
    PAID: [
      {
        to: "SERVICE_SCHEDULED",
        actors: ["SELLER", "SYSTEM", "ADMIN"],
        requiredReasons: ["SERVICE_SCHEDULED", "SYSTEM_TRANSITION"],
      },
      {
        to: "DISPUTED",
        actors: ["BUYER", "SELLER", "ADMIN", "SYSTEM"],
        requiredReasons: ["DISPUTE_OPENED"],
      },
      {
        to: "CANCELLED",
        actors: ["ADMIN", "SYSTEM"],
        requiredReasons: ["REFUND_APPROVED"],
      },
    ],
    AGREED: [
      ...TRANSITION_MATRIX.AGREED,
      {
        to: "SERVICE_SCHEDULED",
        actors: ["BUYER", "SELLER", "SYSTEM", "ADMIN"],
        requiredReasons: ["SERVICE_SCHEDULED", "SYSTEM_TRANSITION", "MUTUAL_AGREEMENT"],
      },
    ],
    SERVICE_SCHEDULED: [
      {
        to: "SERVICE_PERFORMED",
        actors: ["SELLER"],
        requiredReasons: ["SERVICE_PERFORMED"],
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
        to: "DISPUTED",
        actors: ["BUYER", "SELLER", "ADMIN", "SYSTEM"],
        requiredReasons: ["DISPUTE_OPENED"],
      },
    ],
    SERVICE_PERFORMED: [
      {
        to: "CUSTOMER_CONFIRMED",
        actors: ["BUYER"],
        requiredReasons: ["CUSTOMER_CONFIRMED"],
      },
      {
        to: "DISPUTED",
        actors: ["BUYER", "SELLER", "ADMIN", "SYSTEM"],
        requiredReasons: ["DISPUTE_OPENED"],
      },
    ],
    CUSTOMER_CONFIRMED: [
      {
        to: "COMPLETED",
        actors: ["BUYER", "SYSTEM", "ADMIN"],
        requiredReasons: ["COMPLETION_CONFIRMED", "MUTUAL_AGREEMENT", "SYSTEM_TRANSITION"],
      },
    ],
    SHIPPING_PENDING: [],
    SHIPPED: [],
    DELIVERED: [],
  };
}

const MATRIX = copyNegotiation();

/** Remote services — own policy id; never an alias of ServiceInPersonPolicy. */
export const ServiceRemotePolicy: FulfillmentPolicy = {
  id: "SERVICE_REMOTE",
  findEdge(from, to, actorType): TransitionEdge | null {
    const edges = MATRIX[from] ?? [];
    return edges.find((e) => e.to === to && e.actors.includes(actorType)) ?? null;
  },
  forbidsUnauthenticatedCompletion(from, to, actorType) {
    if (to !== "COMPLETED") return false;
    if (actorType === "SELLER") return true;
    if (from !== "CUSTOMER_CONFIRMED" && actorType !== "ADMIN") return true;
    return false;
  },
};
