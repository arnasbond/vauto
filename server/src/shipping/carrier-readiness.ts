/**
 * Per-provider carrier readiness — used by /api/health and verify-carriers script.
 */
import type { ShippingLabelResult } from "./carrier-adapter.js";
import type { ShippingProviderId } from "./shipping-routing.js";
import { resolveCarrierAdapter } from "./providers/carrier-adapters.js";
import { isOmnivaLiveConfigured } from "../services/omniva.js";

export type CarrierProviderStatus =
  | "missing_key"
  | "simulated"
  | "live_configured"
  | "live_probe_ok"
  | "live_probe_failed";

export interface CarrierProviderReadiness {
  providerId: ShippingProviderId;
  status: CarrierProviderStatus;
  mode: "live" | "simulated";
  keyConfigured: boolean;
  adapterClass: string;
  note?: string;
}

const PROBE_REQ = {
  escrowId: "readiness-probe",
  listingId: "probe-listing",
  providerId: "omniva" as ShippingProviderId,
  lockerId: "probe-locker",
  lockerName: "Test Locker",
  parcelSize: "M",
};

function envForProvider(providerId: ShippingProviderId): {
  keyConfigured: boolean;
  urlConfigured: boolean;
} {
  switch (providerId) {
    case "omniva":
      return {
        keyConfigured: isOmnivaLiveConfigured(),
        urlConfigured: true,
      };
    case "dpd":
      return {
        keyConfigured: Boolean(process.env.DPD_API_KEY?.trim()),
        urlConfigured: Boolean(process.env.DPD_API_URL?.trim()),
      };
    case "lp_express":
      return {
        keyConfigured: Boolean(process.env.LP_EXPRESS_API_KEY?.trim()),
        urlConfigured: Boolean(process.env.LP_EXPRESS_API_URL?.trim()),
      };
    default:
      return { keyConfigured: false, urlConfigured: false };
  }
}

function adapterClassName(providerId: ShippingProviderId): string {
  const adapter = resolveCarrierAdapter(providerId);
  if (adapter.mode === "live") {
    return providerId === "omniva"
      ? "OmnivaCarrierAdapter"
      : providerId === "dpd"
        ? "DpdCarrierAdapter"
        : "LiveCarrierAdapter";
  }
  return "SimulatedCarrierAdapter";
}

export function getCarrierProviderReadiness(
  providerId: ShippingProviderId
): CarrierProviderReadiness {
  const { keyConfigured, urlConfigured } = envForProvider(providerId);
  const adapter = resolveCarrierAdapter(providerId);
  const adapterClass = adapterClassName(providerId);

  if (!keyConfigured) {
    return {
      providerId,
      status: "simulated",
      mode: "simulated",
      keyConfigured: false,
      adapterClass: "SimulatedCarrierAdapter",
      note: "API key not configured — simulated labels only",
    };
  }

  if (!urlConfigured && providerId !== "dpd") {
    return {
      providerId,
      status: "live_configured",
      mode: adapter.mode,
      keyConfigured: true,
      adapterClass,
      note: "API key set but API URL missing — may fall back to simulated",
    };
  }

  return {
    providerId,
    status: "live_configured",
    mode: adapter.mode,
    keyConfigured: true,
    adapterClass,
    note: "API key configured — live adapter active",
  };
}

export function getAllCarrierReadiness(): CarrierProviderReadiness[] {
  const ids: ShippingProviderId[] = ["omniva", "dpd", "lp_express"];
  return ids.map(getCarrierProviderReadiness);
}

/** Smoke-probe adapter contract (always safe — uses simulated when keys missing). */
export async function probeCarrierAdapter(
  providerId: ShippingProviderId = "omniva"
): Promise<{
  ok: boolean;
  label: ShippingLabelResult;
  readiness: CarrierProviderReadiness;
}> {
  const readiness = getCarrierProviderReadiness(providerId);
  const adapter = resolveCarrierAdapter(providerId);
  try {
    const label = await adapter.createLabel({ ...PROBE_REQ, providerId });
    const ok =
      Boolean(label.id) &&
      Boolean(label.trackingCode) &&
      Boolean(label.qrPayload) &&
      label.mode === adapter.mode;
    return {
      ok,
      label,
      readiness: {
        ...readiness,
        status: ok
          ? readiness.keyConfigured && label.mode === "live"
            ? "live_probe_ok"
            : "simulated"
          : "live_probe_failed",
        mode: label.mode,
      },
    };
  } catch (e) {
    return {
      ok: false,
      label: {
        id: "",
        trackingCode: "",
        qrPayload: "",
        instructions: "",
        provider: providerId,
        mode: "simulated",
      },
      readiness: {
        ...readiness,
        status: "live_probe_failed",
        note: e instanceof Error ? e.message : String(e),
      },
    };
  }
}
