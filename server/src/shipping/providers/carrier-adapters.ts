import type {
  CarrierAdapter,
  ShippingLabelRequest,
  ShippingLabelResult,
} from "../carrier-adapter.js";
import type { ShippingProviderId } from "../shipping-routing.js";
import {
  createOmnivaShippingLabel,
  fetchOmnivaShipmentEvents,
  getOmnivaCredentials,
  isOmnivaLiveConfigured,
  summarizeOmnivaTracking,
} from "../../services/omniva.js";

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
      instructions: `Nueikite į ${locker} ir įdėkite ${req.parcelSize ?? "M"} dydžio siuntą pagal nurodymus telefone.`,
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
    if (!isOmnivaLiveConfigured()) {
      return this.fallback.createLabel(req);
    }

    try {
      const lockerZip = String(req.lockerId ?? "").trim();
      if (!lockerZip) {
        throw new Error("lockerId (Omniva ZIP) is required for live labels");
      }

      const live = await createOmnivaShippingLabel({
        escrowId: req.escrowId,
        listingId: req.listingId,
        lockerZip,
        lockerName: req.lockerName,
        parcelSize: req.parcelSize,
      });

      const locker = req.lockerName ?? "pasirinktą Omniva paštomatą";
      const pdfNote = live.labelPdfBase64
        ? " Lipduko PDF paruoštas VAUTO sistemoje."
        : "";

      return {
        id: live.barcode,
        trackingCode: live.barcode,
        qrPayload: live.barcode,
        instructions:
          `Omniva siunta ${live.barcode} užregistruota. Nueikite į ${locker}, ` +
          `atspausdinkite lipduką ir įdėkite ${req.parcelSize ?? "M"} dydžio siuntą.` +
          pdfNote,
        provider: "omniva",
        mode: "live",
        trackingUrl: live.trackingUrl,
      };
    } catch (err) {
      const simulated = await this.fallback.createLabel(req);
      const reason = err instanceof Error ? err.message : String(err);
      return {
        ...simulated,
        instructions: `${simulated.instructions} (Omniva API: ${reason} — simuliacija.)`,
      };
    }
  }

  async getTrackingStatus(trackingCode: string): Promise<{
    status: string;
    summaryLt: string;
  }> {
    if (!isOmnivaLiveConfigured()) {
      return this.fallback.getTrackingStatus!(trackingCode);
    }

    try {
      const events = await fetchOmnivaShipmentEvents(trackingCode);
      return summarizeOmnivaTracking(events);
    } catch {
      return this.fallback.getTrackingStatus!(trackingCode);
    }
  }
}

export class DpdCarrierAdapter implements CarrierAdapter {
  readonly providerId = "dpd" as const;
  readonly mode = "live" as const;
  private fallback = new SimulatedCarrierAdapter("dpd");

  async createLabel(req: ShippingLabelRequest): Promise<ShippingLabelResult> {
    const apiKey = process.env.DPD_API_KEY?.trim();
    const apiUrl = process.env.DPD_API_URL?.trim() || "https://api.dpd.lt";
    if (!apiKey) {
      return this.fallback.createLabel(req);
    }

    try {
      const res = await fetch(`${apiUrl.replace(/\/$/, "")}/shipments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          parcelSize: req.parcelSize ?? "M",
          pickupPointId: req.lockerId,
          reference: req.escrowId,
        }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) throw new Error(`DPD HTTP ${res.status}`);
      const data = (await res.json()) as {
        id?: string;
        trackingCode?: string;
        qrPayload?: string;
        instructions?: string;
        trackingUrl?: string;
      };
      const labelId = String(data.id ?? data.trackingCode ?? "").trim();
      if (!labelId) throw new Error("DPD response missing label id");
      return {
        id: labelId,
        trackingCode: String(data.trackingCode ?? labelId),
        qrPayload: String(data.qrPayload ?? `DPD:${labelId}`),
        instructions:
          String(data.instructions ?? "").trim() ||
          `DPD lipdukas ${labelId} paruoštas.`,
        provider: "dpd",
        mode: "live",
        trackingUrl: data.trackingUrl,
      };
    } catch {
      const simulated = await this.fallback.createLabel(req);
      return {
        ...simulated,
        instructions: `${simulated.instructions} (DPD API nepasiekiamas — simuliacija.)`,
      };
    }
  }

  async getTrackingStatus(trackingCode: string): Promise<{
    status: string;
    summaryLt: string;
  }> {
    const apiKey = process.env.DPD_API_KEY?.trim();
    const apiUrl = process.env.DPD_API_URL?.trim() || "https://api.dpd.lt";
    if (!apiKey) {
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
      if (!res.ok) throw new Error(`DPD tracking HTTP ${res.status}`);
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
  if (providerId === "omniva" && isOmnivaLiveConfigured()) {
    return new OmnivaCarrierAdapter();
  }
  if (providerId === "dpd" && process.env.DPD_API_KEY?.trim()) {
    return new DpdCarrierAdapter();
  }
  return new SimulatedCarrierAdapter(providerId);
}

/** @deprecated use isOmnivaLiveConfigured from services/omniva */
export function omnivaCredentialsPresent(): boolean {
  return getOmnivaCredentials() !== null;
}

