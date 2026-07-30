import type { ChatMessage } from "@/lib/types";
import type { ParcelSize } from "@/lib/shipping/shipping-provider";
import { formatOmnivaParcelPrice } from "@/lib/shipping/omniva-parcel-prices";

export interface OmnivaShippingLabelPayload {
  trackingCode: string;
  qrPayload?: string;
  trackingUrl?: string;
  lockerName?: string;
  parcelSize?: ParcelSize;
  listingTitle?: string;
  mode?: "live" | "simulated";
}

/** Plain-text fallback for system bubble + notifications. */
export function buildOmnivaSellerNotifyText(
  payload: OmnivaShippingLabelPayload
): string {
  const size = payload.parcelSize ?? "M";
  const lines = [
    "📦 Naujas Omniva užsakymas su siuntimu",
    payload.listingTitle ? `Prekė: ${payload.listingTitle}` : "",
    payload.lockerName ? `Paštomatas: ${payload.lockerName}` : "",
    `Dydis: ${size} (${formatOmnivaParcelPrice(size)})`,
    `Siuntos kodas: ${payload.trackingCode}`,
    payload.trackingUrl
      ? `Sekimas: ${payload.trackingUrl}`
      : payload.qrPayload
        ? `QR / kodas: ${payload.qrPayload}`
        : "",
    "Įdėkite siuntą į pasirinktą Omniva paštomatą pagal lipduko nurodymus.",
  ].filter(Boolean);
  return lines.join("\n");
}

export function buildOmnivaShippingChatMessage(
  payload: OmnivaShippingLabelPayload
): ChatMessage {
  return {
    id: `m-ship-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    senderId: "vauto-system",
    text: buildOmnivaSellerNotifyText(payload),
    timestamp: new Date().toISOString(),
    kind: "shipping_label",
    shippingLabel: {
      provider: "omniva",
      trackingCode: payload.trackingCode,
      qrPayload: payload.qrPayload ?? payload.trackingCode,
      trackingUrl: payload.trackingUrl,
      lockerName: payload.lockerName,
      parcelSize: payload.parcelSize ?? "M",
      mode: payload.mode ?? "live",
    },
  };
}
