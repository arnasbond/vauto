import {
  TRANSITION_MATRIX,
  type TransitionEdge,
} from "../../transition-matrix.js";
import type { ActorType, TransactionStatus } from "../../types.js";
import type { FulfillmentPolicy } from "../types.js";

/**
 * Legacy Omniva / carrier path — identical to Stage 11A–11G TRANSITION_MATRIX.
 */
export const CarrierDeliveryPolicy: FulfillmentPolicy = {
  id: "CARRIER_DELIVERY",
  findEdge(from, to, actorType): TransitionEdge | null {
    return (
      TRANSITION_MATRIX[from].find(
        (e) => e.to === to && e.actors.includes(actorType)
      ) ?? null
    );
  },
  forbidsUnauthenticatedCompletion() {
    return false;
  },
};

export function findCarrierEdge(
  from: TransactionStatus,
  to: TransactionStatus,
  actorType: ActorType
): TransitionEdge | null {
  return CarrierDeliveryPolicy.findEdge(from, to, actorType);
}
