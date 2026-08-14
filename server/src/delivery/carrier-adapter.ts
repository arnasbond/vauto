/**
 * Stage 11G — CarrierAdapter boundary (Fake + Real stubs).
 * 11G.2: Fake forbidden in production (fail-closed). Tests MUST use FakeCarrierAdapter.
 */

import { createHash, randomUUID } from "node:crypto";
import type {
  CarrierAdapter,
  CarrierLabelInput,
  CarrierLabelResult,
  CarrierTrackingSnapshot,
  CarrierReportedStatus,
  DeliveryCarrier,
  DeliveryStatus,
} from "./types.js";
import { DeliveryCarrierUnavailableError } from "./types.js";

const TRACKING_URL: Record<DeliveryCarrier, string> = {
  OMNIVA: "https://www.omniva.lt/verslo/siuntos_sekimas?barcode=",
  DPD: "https://www.dpd.com/lt/lt/tracking/?parcelNumber=",
  LP_EXPRESS: "https://www.lpexpress.lt/en/track?code=",
  DIRECT_COURIER: "https://vauto.lt/tracking?code=",
};

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

export class FakeCarrierAdapter implements CarrierAdapter {
  readonly name = "fake" as const;
  /** Simulated carrier is never production-authoritative. */
  readonly authoritative = !isProduction();
  private readonly byTracking = new Map<string, CarrierTrackingSnapshot>();
  private nextStatusOverride: CarrierReportedStatus | null = null;
  private createCalls = 0;
  private fetchCalls = 0;

  getCreateCallCount(): number {
    return this.createCalls;
  }
  getFetchCallCount(): number {
    return this.fetchCalls;
  }

  /** Test helper — next fetchTracking returns this status. */
  setNextTrackingStatus(status: CarrierReportedStatus): void {
    this.nextStatusOverride = status;
  }

  /** Force a known tracking code into DELIVERED for sync tests. */
  markDelivered(trackingCode: string): void {
    this.byTracking.set(trackingCode, {
      trackingCode,
      status: "DELIVERED",
      rawStatus: "delivered",
      summaryLt: "Siunta pristatyta",
    });
  }

  async createLabel(input: CarrierLabelInput): Promise<CarrierLabelResult> {
    this.createCalls += 1;
    const trackingCode =
      input.trackingCode?.trim() ||
      `FK${input.carrier.slice(0, 2)}${createHash("sha256")
        .update(`${input.transactionId}:${input.carrier}:${randomUUID()}`)
        .digest("hex")
        .slice(0, 12)
        .toUpperCase()}`;
    const labelId = `lbl_fake_${createHash("sha256")
      .update(trackingCode)
      .digest("hex")
      .slice(0, 16)}`;
    const snap: CarrierTrackingSnapshot = {
      trackingCode,
      status: "LABEL_CREATED",
      rawStatus: "label_created",
      summaryLt: "Siuntos lipdukas sukurtas",
    };
    this.byTracking.set(trackingCode, snap);
    return {
      trackingCode,
      labelId,
      trackingUrl: `${TRACKING_URL[input.carrier]}${encodeURIComponent(trackingCode)}`,
      carrier: input.carrier,
    };
  }

  async fetchTracking(trackingCode: string): Promise<CarrierTrackingSnapshot> {
    this.fetchCalls += 1;
    if (this.nextStatusOverride) {
      const status = this.nextStatusOverride;
      this.nextStatusOverride = null;
      const snap: CarrierTrackingSnapshot = {
        trackingCode,
        status,
        rawStatus: String(status).toLowerCase(),
        summaryLt:
          status === "DELIVERED"
            ? "Siunta pristatyta"
            : status === "IN_TRANSIT" || status === "CARRIER_ACCEPTED"
              ? "Siunta kelyje"
              : "Būsena atnaujinta",
      };
      this.byTracking.set(trackingCode, snap);
      return snap;
    }
    return (
      this.byTracking.get(trackingCode) ?? {
        trackingCode,
        status: "IN_TRANSIT",
        rawStatus: "in_transit",
        summaryLt: "Siunta kelyje",
      }
    );
  }
}

/** Production fail-closed placeholder when no real carrier is configured. */
export class ProductionFailClosedCarrier implements CarrierAdapter {
  readonly name = "unconfigured" as const;
  readonly authoritative = false;
  async createLabel(): Promise<CarrierLabelResult> {
    throw new DeliveryCarrierUnavailableError();
  }
  async fetchTracking(): Promise<CarrierTrackingSnapshot> {
    throw new DeliveryCarrierUnavailableError();
  }
}

/** Real adapters are stubs — production keys unlock later; never used in tests. */
export class RealOmnivaAdapter implements CarrierAdapter {
  readonly name = "omniva-real" as const;
  readonly authoritative = true;
  async createLabel(input: CarrierLabelInput): Promise<CarrierLabelResult> {
    throw new Error("Real Omniva adapter not configured in 11G.2");
  }
  async fetchTracking(): Promise<CarrierTrackingSnapshot> {
    throw new Error("Real Omniva adapter not configured in 11G.2");
  }
}

export class RealDpdAdapter implements CarrierAdapter {
  readonly name = "dpd-real" as const;
  readonly authoritative = true;
  async createLabel(): Promise<CarrierLabelResult> {
    throw new Error("Real DPD adapter not configured in 11G.2");
  }
  async fetchTracking(): Promise<CarrierTrackingSnapshot> {
    throw new Error("Real DPD adapter not configured in 11G.2");
  }
}

export class RealLpExpressAdapter implements CarrierAdapter {
  readonly name = "lp-express-real" as const;
  readonly authoritative = true;
  async createLabel(): Promise<CarrierLabelResult> {
    throw new Error("Real LP Express adapter not configured in 11G.2");
  }
  async fetchTracking(): Promise<CarrierTrackingSnapshot> {
    throw new Error("Real LP Express adapter not configured in 11G.2");
  }
}

export function assertCarrierUsableInEnvironment(carrier: CarrierAdapter): void {
  if (isProduction() && (carrier.name === "fake" || !carrier.authoritative)) {
    throw new DeliveryCarrierUnavailableError();
  }
}

export function resolveDefaultCarrierAdapter(): CarrierAdapter {
  if (isProduction()) {
    // 11G.3: Omniva is the sole active v1 production carrier (default).
    const mode = (process.env.VAUTO_CARRIER_MODE || "omniva")
      .trim()
      .toLowerCase();
    if (mode === "omniva") return new RealOmnivaAdapter();
    if (mode === "dpd") return new RealDpdAdapter();
    if (mode === "lp_express" || mode === "lp-express") {
      return new RealLpExpressAdapter();
    }
    if (mode === "none" || mode === "unconfigured") {
      return new ProductionFailClosedCarrier();
    }
    // Unknown mode — fail-closed (never Fake).
    return new ProductionFailClosedCarrier();
  }
  return new FakeCarrierAdapter();
}

export function createCarrierAdapter(
  carrier: DeliveryCarrier,
  opts?: { forceFake?: boolean }
): CarrierAdapter {
  if (opts?.forceFake !== false && !isProduction()) {
    return new FakeCarrierAdapter();
  }
  if (isProduction() && opts?.forceFake) {
    throw new DeliveryCarrierUnavailableError(
      "Fake carrier adapter forbidden in production"
    );
  }
  switch (carrier) {
    case "OMNIVA":
      return new RealOmnivaAdapter();
    case "DPD":
      return new RealDpdAdapter();
    case "LP_EXPRESS":
      return new RealLpExpressAdapter();
    default:
      return resolveDefaultCarrierAdapter();
  }
}

/** Map carrier-reported status to persisted delivery status. */
export function toPersistedDeliveryStatus(
  reported: CarrierReportedStatus
): DeliveryStatus {
  if (reported === "CARRIER_ACCEPTED") return "IN_TRANSIT";
  if (reported === "LABEL_CREATED") return "LABEL_CREATED";
  if (reported === "PENDING_LABEL") return "PENDING_LABEL";
  if (reported === "FAILED_DELIVERY") return "FAILED_DELIVERY";
  if (reported === "DELIVERED") return "DELIVERED";
  return "IN_TRANSIT";
}
