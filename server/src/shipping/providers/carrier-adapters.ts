import type {
  CarrierAdapter,
  ShippingLabelRequest,
  ShippingLabelResult,
} from "../carrier-adapter.js";
import type { ShippingProviderId } from "../shipping-routing.js";

const PROVIDER_PREFIX: Record<ShippingProviderId, string> = {
  omniva: "OMN",
  lp_express: "LPE",
  dpd: "DPD",
};

function buildDeterministicSuffix(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return String(100000 + (hash % 900000));
}

export class SimulatedCarrierAdapter implements CarrierAdapter {
  readonly providerId: ShippingProviderId;
  readonly mode = "simulated" as const;

  constructor(providerId: ShippingProviderId = "omniva") {
    this.providerId = providerId;
  }

  async createLabel(req: ShippingLabelRequest): Promise<ShippingLabelResult> {
    const prefix = PROVIDER_PREFIX[req.providerId] ?? "SHP";
    const suffix = buildDeterministicSuffix(
      `${req.escrowId}:${req.listingId}:${req.lockerId ?? ""}`
    );
    const labelId = `${prefix}-${suffix}`;
    const locker = req.lockerName ?? "pasirinktą paštomatą";

    return {
      id: labelId,
      trackingCode: labelId,
      qrPayload: `VAUTO-SHIP:${labelId}:${req.listingId}`,
      instructions: `Nueikite į ${locker}, nuskenuokite QR ir įdėkite ${req.parcelSize ?? "M"} dydžio siuntą.`,
      provider: req.providerId,
      mode: "simulated",
    };
  }

  async getTrackingStatus(trackingCode: string): Promise<{
    status: string;
    summaryLt: string;
  }> {
    return {
      status: "label_created",
      summaryLt: `Siuntos ${trackingCode} būsena: lipdukas sugeneruotas (simuliacija).`,
    };
  }
}

export class OmnivaCarrierAdapter implements CarrierAdapter {
  readonly providerId = "omniva" as const;
  readonly mode = "live" as const;
  private fallback = new SimulatedCarrierAdapter("omniva");

  async createLabel(req: ShippingLabelRequest): Promise<ShippingLabelResult> {
    const apiKey = process.env.OMNIVA_API_KEY?.trim();
    const apiUrl = process.env.OMNIVA_API_URL?.trim();
    if (!apiKey || !apiUrl) {
      return this.fallback.createLabel(req);
    }

    try {
      const res = await fetch(`${apiUrl.replace(/\/$/, "")}/labels`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          parcelSize: req.parcelSize ?? "M",
          lockerId: req.lockerId,
          reference: req.escrowId,
        }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) throw new Error(`Omniva HTTP ${res.status}`);
      const data = (await res.json()) as {
        id?: string;
        trackingCode?: string;
        qrPayload?: string;
        instructions?: string;
        trackingUrl?: string;
      };
      const labelId = String(data.id ?? data.trackingCode ?? "").trim();
      if (!labelId) throw new Error("Omniva response missing label id");
      return {
        id: labelId,
        trackingCode: String(data.trackingCode ?? labelId),
        qrPayload: String(data.qrPayload ?? `OMNIVA:${labelId}`),
        instructions:
          String(data.instructions ?? "").trim() ||
          `Omniva lipdukas ${labelId} paruoštas.`,
        provider: "omniva",
        mode: "live",
        trackingUrl: data.trackingUrl,
      };
    } catch {
      const simulated = await this.fallback.createLabel(req);
      return { ...simulated, instructions: `${simulated.instructions} (Omniva API nepasiekiamas — simuliacija.)` };
    }
  }

  async getTrackingStatus(trackingCode: string): Promise<{
    status: string;
    summaryLt: string;
  }> {
    const apiKey = process.env.OMNIVA_API_KEY?.trim();
    const apiUrl = process.env.OMNIVA_API_URL?.trim();
    if (!apiKey || !apiUrl) {
      return this.fallback.getTrackingStatus!(trackingCode);
    }
    try {
      const res = await fetch(
        `${apiUrl.replace(/\/$/, "")}/tracking/${encodeURIComponent(trackingCode)}`,
        {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(12_000),
        }
      );
      if (!res.ok) throw new Error(`Omniva tracking HTTP ${res.status}`);
      const data = (await res.json()) as { status?: string; summary?: string };
      return {
        status: String(data.status ?? "in_transit"),
        summaryLt: String(data.summary ?? `Siuntos ${trackingCode} sekimas atnaujintas.`),
      };
    } catch {
      return this.fallback.getTrackingStatus!(trackingCode);
    }
  }
}

export function resolveCarrierAdapter(
  providerId: ShippingProviderId = "omniva"
): CarrierAdapter {
  if (providerId === "omniva" && process.env.OMNIVA_API_KEY?.trim()) {
    return new OmnivaCarrierAdapter();
  }
  return new SimulatedCarrierAdapter(providerId);
}
