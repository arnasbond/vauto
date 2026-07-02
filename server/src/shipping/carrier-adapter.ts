import type { ShippingProviderId } from "./shipping-routing.js";

export interface ShippingLabelRequest {
  escrowId: string;
  listingId: string;
  providerId: ShippingProviderId;
  lockerId?: string;
  lockerName?: string;
  parcelSize?: string;
  originCity?: string;
  destinationCity?: string;
}

export interface ShippingLabelResult {
  id: string;
  trackingCode: string;
  qrPayload: string;
  instructions: string;
  provider: ShippingProviderId;
  mode: "live" | "simulated";
  trackingUrl?: string;
}

export interface CarrierAdapter {
  readonly providerId: ShippingProviderId;
  readonly mode: "live" | "simulated";
  createLabel(req: ShippingLabelRequest): Promise<ShippingLabelResult>;
  getTrackingStatus?(trackingCode: string): Promise<{
    status: string;
    summaryLt: string;
  }>;
}
