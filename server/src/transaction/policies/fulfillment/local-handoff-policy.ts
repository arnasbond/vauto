import { TRANSITION_MATRIX, type TransitionEdge } from "../../transition-matrix.js";
import type { FulfillmentPolicy } from "../types.js";

/** Local goods handoff: skip carrier; PAID → DELIVERED after confirm. */
const PAID: readonly TransitionEdge[] = [
  {
    to: "DELIVERED",
    actors: ["BUYER", "SELLER", "SYSTEM", "ADMIN"],
    requiredReasons: ["DELIVERY_CONFIRMED", "SYSTEM_TRANSITION", "MUTUAL_AGREEMENT"],
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
];

export const LocalHandoffPolicy: FulfillmentPolicy = {
  id: "LOCAL_HANDOFF",
  findEdge(from, to, actorType): TransitionEdge | null {
    const edges = from === "PAID" ? PAID : TRANSITION_MATRIX[from];
    return edges.find((e) => e.to === to && e.actors.includes(actorType)) ?? null;
  },
  forbidsUnauthenticatedCompletion() {
    return false;
  },
};
