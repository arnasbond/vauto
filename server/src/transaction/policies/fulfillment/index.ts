import type { FulfillmentType } from "../../types.js";
import type { FulfillmentPolicy } from "../types.js";
import { ServiceRemotePolicy } from "../service-remote-policy.js";
import { CarrierDeliveryPolicy } from "./carrier-delivery-policy.js";
import { DirectContactPolicy } from "./direct-contact-policy.js";
import { LocalHandoffPolicy } from "./local-handoff-policy.js";
import { ServiceInPersonPolicy } from "./service-in-person-policy.js";

export { CarrierDeliveryPolicy } from "./carrier-delivery-policy.js";
export { DirectContactPolicy } from "./direct-contact-policy.js";
export { LocalHandoffPolicy } from "./local-handoff-policy.js";
export { ServiceInPersonPolicy } from "./service-in-person-policy.js";
export { ServiceRemotePolicy } from "../service-remote-policy.js";

export function resolveFulfillmentPolicy(
  fulfillmentType: FulfillmentType
): FulfillmentPolicy {
  switch (fulfillmentType) {
    case "SERVICE_IN_PERSON":
      return ServiceInPersonPolicy;
    case "SERVICE_REMOTE":
      return ServiceRemotePolicy;
    case "DIRECT_CONTACT":
      return DirectContactPolicy;
    case "LOCAL_HANDOFF":
      return LocalHandoffPolicy;
    case "CARRIER_DELIVERY":
    default:
      return CarrierDeliveryPolicy;
  }
}
