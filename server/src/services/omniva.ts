/**
 * Omniva OMX integration (production).
 *
 * - Parcel machines: public Baltic locations feed (no auth).
 * - Shipments / labels / tracking: OMX REST API with HTTP Basic Auth
 *   (OMNIVA_USERNAME + OMNIVA_PASSWORD).
 *
 * Production base: https://omx.omniva.eu/api/v01/omx
 * Test base (blocked in prod): https://test-omx.omniva.eu/...
 */

import type { ParcelLocker } from "../shipping/shipping-routing.js";
import { resolveShippingCity } from "../shipping/shipping-routing.js";

/** Official OMX production API root — never use test-omx in production. */
export const OMNIVA_OMX_PRODUCTION_BASE =
  "https://omx.omniva.eu/api/v01/omx";

/** Public parcel-machine registry (Baltics). Updated by Omniva ~daily. */
export const OMNIVA_LOCATIONS_JSON_URL =
  "https://www.omniva.ee/locations.json";

const LOCATIONS_CACHE_MS = 24 * 60 * 60 * 1000;

export interface OmnivaLocationRow {
  ZIP: string;
  NAME: string;
  TYPE: string;
  A0_NAME: string;
  A1_NAME?: string;
  A2_NAME?: string;
  A3_NAME?: string;
  A5_NAME?: string;
  A7_NAME?: string;
  comment_lit?: string;
  X_COORDINATE?: string;
  Y_COORDINATE?: string;
}

export interface OmnivaCredentials {
  username: string;
  password: string;
  customerCode: string;
  apiBase: string;
}

export interface OmnivaLabelRequest {
  escrowId: string;
  listingId: string;
  lockerZip: string;
  lockerName?: string;
  parcelSize?: string;
  receiverName?: string;
  receiverPhone?: string;
}

export interface OmnivaLabelResult {
  barcode: string;
  partnerShipmentId: string;
  labelPdfBase64?: string;
  trackingUrl: string;
}

export interface OmnivaTrackingEvent {
  eventCode?: string;
  eventName?: string;
  eventDate?: string;
  location?: string;
}

let locationsCache: { fetchedAt: number; rows: OmnivaLocationRow[] } | null =
  null;

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim();
}

/** Resolve OMX credentials from env. Returns null when not configured. */
export function getOmnivaCredentials(): OmnivaCredentials | null {
  const username =
    process.env.OMNIVA_USERNAME?.trim() ||
    process.env.OMNIVA_API_USERNAME?.trim() ||
    "";
  const password =
    process.env.OMNIVA_PASSWORD?.trim() ||
    process.env.OMNIVA_API_KEY?.trim() ||
    "";
  if (!username || !password) return null;

  const rawBase =
    process.env.OMNIVA_API_URL?.trim() || OMNIVA_OMX_PRODUCTION_BASE;
  const apiBase = rawBase.replace(/\/$/, "");

  if (/test-omx\.omniva\.eu/i.test(apiBase)) {
    const allowTest = process.env.OMNIVA_ALLOW_TEST_ENV === "1";
    if (!allowTest) {
      throw new Error(
        "OMNIVA_API_URL points to test-omx — set production OMX URL or OMNIVA_ALLOW_TEST_ENV=1 for dev only"
      );
    }
  }

  const customerCode =
    process.env.OMNIVA_CUSTOMER_CODE?.trim() || username;

  return { username, password, customerCode, apiBase };
}

export function isOmnivaLiveConfigured(): boolean {
  try {
    return getOmnivaCredentials() !== null;
  } catch {
    return false;
  }
}

function basicAuthHeader(creds: OmnivaCredentials): string {
  const token = Buffer.from(
    `${creds.username}:${creds.password}`,
    "utf8"
  ).toString("base64");
  return `Basic ${token}`;
}

async function omnivaFetch(
  creds: OmnivaCredentials,
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const url = `${creds.apiBase}${path.startsWith("/") ? path : `/${path}`}`;
  return fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: basicAuthHeader(creds),
      ...(init.headers as Record<string, string> | undefined),
    },
    signal: init.signal ?? AbortSignal.timeout(25_000),
  });
}

/** Fetch raw location rows (LT parcel machines, TYPE=0). */
export async function fetchOmnivaLocationRows(
  forceRefresh = false
): Promise<OmnivaLocationRow[]> {
  const now = Date.now();
  if (
    !forceRefresh &&
    locationsCache &&
    now - locationsCache.fetchedAt < LOCATIONS_CACHE_MS
  ) {
    return locationsCache.rows;
  }

  const res = await fetch(OMNIVA_LOCATIONS_JSON_URL, {
    signal: AbortSignal.timeout(30_000),
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Omniva locations HTTP ${res.status}`);
  }

  const data = (await res.json()) as OmnivaLocationRow[];
  const ltParcel = data.filter(
    (row) => row.A0_NAME === "LT" && String(row.TYPE) === "0" && row.ZIP
  );
  locationsCache = { fetchedAt: now, rows: ltParcel };
  return ltParcel;
}

function cityMatchTokens(canonical: string): string[] {
  const n = norm(canonical);
  const tokens = new Set<string>([n]);
  if (n.endsWith("ius")) tokens.add(`${n.slice(0, -3)}iaus`);
  if (n.endsWith("as")) tokens.add(`${n.slice(0, -2)}o`);
  if (n.endsWith("is")) tokens.add(`${n.slice(0, -2)}io`);
  if (n.endsWith("us")) tokens.add(`${n.slice(0, -2)}aus`);
  if (n.endsWith("a")) tokens.add(`${n.slice(0, -1)}os`);
  if (n.endsWith("e")) tokens.add(`${n.slice(0, -1)}es`);
  return [...tokens].filter((t) => t.length >= 4);
}

function rowMatchesCity(row: OmnivaLocationRow, cityFilter: string): boolean {
  const canonical = resolveShippingCity(cityFilter) ?? cityFilter.trim();
  const rowCity = resolveShippingCity(
    `${row.A3_NAME ?? ""} ${row.A2_NAME ?? ""} ${row.A1_NAME ?? ""}`
  );
  if (rowCity && rowCity === canonical) return true;

  const adminHay = norm(
    `${row.A3_NAME ?? ""} ${row.A2_NAME ?? ""} ${row.A1_NAME ?? ""}`
  );
  return cityMatchTokens(canonical).some((token) => adminHay.includes(token));
}

function resolveLockerCity(row: OmnivaLocationRow): string {
  const fromFields = resolveShippingCity(
    `${row.A3_NAME ?? ""} ${row.A2_NAME ?? ""} ${row.A1_NAME ?? ""} ${row.NAME}`
  );
  if (fromFields) return fromFields;
  return row.A3_NAME || row.A2_NAME || row.A1_NAME || "Lietuva";
}

function formatLockerAddress(row: OmnivaLocationRow): string {
  const street = [row.A5_NAME, row.A7_NAME].filter(Boolean).join(" ");
  const city = row.A3_NAME || row.A2_NAME || "";
  const parts = [street, city].filter(Boolean);
  if (row.comment_lit?.trim()) parts.push(row.comment_lit.trim());
  return parts.join(", ") || row.NAME;
}

export function mapOmnivaRowToLocker(row: OmnivaLocationRow): ParcelLocker {
  const city = resolveLockerCity(row);
  return {
    id: row.ZIP,
    name: row.NAME,
    city,
    address: formatLockerAddress(row),
    district: row.A1_NAME,
  };
}

/** Search Lithuanian Omniva parcel machines from the public registry. */
export async function searchOmnivaParcelLockers(opts: {
  query?: string;
  city?: string;
  limit?: number;
}): Promise<ParcelLocker[]> {
  const limit = opts.limit ?? 80;
  let rows = await fetchOmnivaLocationRows();

  const cityFilter = opts.city?.trim();
  if (cityFilter) {
    rows = rows.filter((row) => rowMatchesCity(row, cityFilter));
  }

  const query = opts.query?.trim();
  if (query) {
    const normQ = norm(query);
    rows = rows.filter((row) => {
      const hay = `${row.NAME} ${row.A3_NAME ?? ""} ${row.A2_NAME ?? ""} ${formatLockerAddress(row)} ${row.ZIP}`;
      return norm(hay).includes(normQ);
    });
  }

  return rows
    .map(mapOmnivaRowToLocker)
    .sort((a, b) => a.city.localeCompare(b.city, "lt") || a.name.localeCompare(b.name, "lt"))
    .slice(0, limit);
}

function parcelWeightKg(size?: string): number {
  switch ((size ?? "M").toUpperCase()) {
    case "S":
      return 0.5;
    case "L":
    case "XL":
      return 2;
    default:
      return 1;
  }
}

/** Register a business-to-client parcel-machine shipment (OMX production). */
export async function createOmnivaBusinessShipment(
  req: OmnivaLabelRequest
): Promise<{ barcode: string; partnerShipmentId: string }> {
  const creds = getOmnivaCredentials();
  if (!creds) throw new Error("Omniva credentials not configured");

  const partnerShipmentId = `vauto-${req.escrowId}`.slice(0, 64);
  const offloadPostcode = req.lockerZip.trim();
  if (!offloadPostcode) throw new Error("lockerZip (offload postcode) is required");

  const body = {
    customerCode: creds.customerCode,
    shipments: [
      {
        partnerShipmentId,
        mainService: "PARCEL",
        deliveryChannel: "PARCEL_MACHINE",
        returnAllowed: false,
        paidByReceiver: false,
        measurement: { weight: parcelWeightKg(req.parcelSize) },
        receiverAddressee: {
          personName: req.receiverName?.trim() || "VAUTO pirkėjas",
          contactMobile: req.receiverPhone?.trim() || "37060000000",
        },
        receiverAddress: {
          country: "LT",
          offloadPostcode,
        },
        comment: `VAUTO ${req.listingId}`.slice(0, 120),
      },
    ],
  };

  const res = await omnivaFetch(
    creds,
    "/shipments/business-to-client",
    { method: "POST", body: JSON.stringify(body) }
  );

  const data = (await res.json().catch(() => ({}))) as {
    resultCode?: string;
    savedShipments?: Array<{ barcode?: string; partnerShipmentId?: string }>;
    failedShipments?: Array<{ message?: string; errorMessage?: string }>;
    message?: string;
  };

  if (!res.ok) {
    const failMsg =
      data.failedShipments?.[0]?.message ||
      data.failedShipments?.[0]?.errorMessage ||
      data.message ||
      `HTTP ${res.status}`;
    throw new Error(`Omniva shipment failed: ${failMsg}`);
  }

  const saved = data.savedShipments?.[0];
  const barcode = String(saved?.barcode ?? "").trim();
  if (!barcode) {
    throw new Error(
      `Omniva shipment response missing barcode (resultCode=${data.resultCode ?? "?"})`
    );
  }

  return {
    barcode,
    partnerShipmentId: String(saved?.partnerShipmentId ?? partnerShipmentId),
  };
}

/** Request PDF label(s) for registered barcodes. */
export async function fetchOmnivaPackageLabels(
  barcodes: string[]
): Promise<string | undefined> {
  const creds = getOmnivaCredentials();
  if (!creds || barcodes.length === 0) return undefined;

  const res = await omnivaFetch(creds, "/shipments/package-labels", {
    method: "POST",
    body: JSON.stringify({
      barcodes,
      sendToEmail: false,
    }),
  });

  if (!res.ok) return undefined;

  const data = (await res.json().catch(() => ({}))) as {
    labelFile?: string;
    labels?: Array<{ fileData?: string }>;
  };

  if (data.labelFile) return data.labelFile;
  return data.labels?.[0]?.fileData;
}

/** Full label flow: register shipment + optional PDF label. */
export async function createOmnivaShippingLabel(
  req: OmnivaLabelRequest
): Promise<OmnivaLabelResult> {
  const { barcode, partnerShipmentId } = await createOmnivaBusinessShipment(req);
  const labelPdfBase64 = await fetchOmnivaPackageLabels([barcode]);

  return {
    barcode,
    partnerShipmentId,
    labelPdfBase64,
    trackingUrl: `https://www.omniva.lt/track/${encodeURIComponent(barcode)}`,
  };
}

/** Barcode-based tracking (OMX). Low-volume / debug use. */
export async function fetchOmnivaShipmentEvents(
  barcode: string
): Promise<OmnivaTrackingEvent[]> {
  const creds = getOmnivaCredentials();
  if (!creds) throw new Error("Omniva credentials not configured");

  const res = await omnivaFetch(
    creds,
    `/shipments/${encodeURIComponent(barcode)}`,
    { method: "GET" }
  );

  if (!res.ok) {
    throw new Error(`Omniva tracking HTTP ${res.status}`);
  }

  const data = (await res.json()) as
    | OmnivaTrackingEvent[]
    | { events?: OmnivaTrackingEvent[]; shipmentEvents?: OmnivaTrackingEvent[] };

  if (Array.isArray(data)) return data;
  return data.events ?? data.shipmentEvents ?? [];
}

export function summarizeOmnivaTracking(events: OmnivaTrackingEvent[]): {
  status: string;
  summaryLt: string;
} {
  if (!events.length) {
    return {
      status: "registered",
      summaryLt: "Siunta užregistruota Omniva sistemoje.",
    };
  }
  const last = events[events.length - 1]!;
  const code = String(last.eventCode ?? last.eventName ?? "in_transit");
  const when = last.eventDate ? ` (${last.eventDate})` : "";
  const where = last.location ? ` — ${last.location}` : "";
  return {
    status: code,
    summaryLt: `Omniva: ${last.eventName ?? code}${when}${where}`,
  };
}
