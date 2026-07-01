import { logProductionWarn } from "../lib/production-log.js";
import type { MileageRecord } from "./vehicle-attribute-mappers.js";
import { normalizeVin } from "./vin-utils.js";

function normalizeLtPlateLocal(raw: string): string {
  const compact = raw.trim().toUpperCase().replace(/\s+/g, "");
  if (compact.length !== 6) return raw.trim().toUpperCase();
  return `${compact.slice(0, 3)} ${compact.slice(3)}`;
}

export interface LtTaOpenData {
  taExpiry?: string;
  taValid?: boolean;
  mileage?: string;
  mileageRecords: MileageRecord[];
  make?: string;
  model?: string;
  year?: string;
  vin?: string;
  source: "lt-transeksta-opendata" | "lt-regitra-opendata";
}

function parseKm(raw: string): string | undefined {
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits || Number(digits) <= 0) return undefined;
  const n = Number(digits);
  return `${n.toLocaleString("lt-LT")} km`;
}

function parseDate(raw: string): string | undefined {
  const iso = raw.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const lt = raw.match(/\b(\d{4})[./-](\d{1,2})[./-](\d{1,2})\b/);
  if (lt) {
    const mm = lt[2].padStart(2, "0");
    const dd = lt[3].padStart(2, "0");
    return `${lt[1]}-${mm}-${dd}`;
  }
  return undefined;
}

function extractTaFromHtml(html: string): LtTaOpenData | null {
  const mileageRecords: MileageRecord[] = [];
  let taExpiry: string | undefined;
  let mileage: string | undefined;
  let taValid: boolean | undefined;

  const taUntil = html.match(
    /(?:galioja\s+iki|ta\s+galiojimo\s+pabaiga|mot\s+expiry|galiojimo\s+data)[^0-9]{0,40}(\d{4}[./-]\d{1,2}[./-]\d{1,2})/i
  );
  if (taUntil) taExpiry = parseDate(taUntil[1]);

  const mileageMatches = [
    ...html.matchAll(/(?:rida|odometer|mileage|nuvažiuota)[^0-9]{0,20}([\d\s.,]{2,12})\s*km/gi),
    ...html.matchAll(/([\d\s.,]{2,12})\s*km/gi),
  ];
  for (const m of mileageMatches) {
    const km = parseKm(m[1]);
    if (!km) continue;
    mileage = km;
    mileageRecords.push({ date: "—", km: km.replace(/\s/g, "").replace("km", "") });
    break;
  }

  if (/ta\s+galioja|islaikyta|be\s+trūkumų/i.test(html)) {
    taValid = true;
  }
  if (/negalioja|dideli\s+trūkumai|neišlaikyta/i.test(html)) {
    taValid = false;
  }

  if (!taExpiry && !mileage && taValid === undefined) return null;

  return {
    source: "lt-transeksta-opendata",
    taExpiry,
    taValid,
    mileage,
    mileageRecords,
  };
}

/** Attempt Transeksta / VTA public TA history fetch by VIN (no paid API). */
export async function lookupLtTaByVinOpenData(vin: string): Promise<LtTaOpenData | null> {
  const normalized = normalizeVin(vin);
  if (normalized.length !== 17) return null;

  const endpoints = [
    `https://itais.vta.lt/itais/public/inspection/history?vin=${encodeURIComponent(normalized)}`,
    `https://www.vta.lt/lt/transporto-priemones/technines-apziuros-istorija?vin=${encodeURIComponent(normalized)}`,
  ];

  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        headers: {
          Accept: "text/html,application/json",
          "User-Agent": "vAuto/1.6.21 (+https://vauto.lt; opendata-ta-check)",
        },
        signal: AbortSignal.timeout(12_000),
      });
      if (!res.ok) continue;
      const text = await res.text();
      const parsed = extractTaFromHtml(text);
      if (parsed) return parsed;
      if (text.includes("tp_rida_km") || text.includes("ta_savaites_data")) {
        const kmMatch = text.match(/"tp_rida_km"\s*:\s*"?(\d+)/i);
        const dateMatch = text.match(/"ta_savaites_data"\s*:\s*"([^"]+)"/i);
        if (kmMatch || dateMatch) {
          return {
            source: "lt-transeksta-opendata",
            mileage: kmMatch ? parseKm(kmMatch[1]) : undefined,
            mileageRecords: kmMatch
              ? [{ date: dateMatch?.[1] ?? "—", km: kmMatch[1] }]
              : [],
            taExpiry: dateMatch ? parseDate(dateMatch[1]) : undefined,
            taValid: /"ar_ta_islaikyta"\s*:\s*true/i.test(text),
            vin: normalized,
          };
        }
      }
    } catch (e) {
      logProductionWarn("lt-ta-opendata", "Transeksta fetch failed", {
        url,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return null;
}

/** Regitra public check when plate + VIN are both known (2-of-3 rule). */
export async function lookupLtRegitraOpenData(
  plate: string,
  vin?: string
): Promise<LtTaOpenData | null> {
  const normalizedPlate = normalizeLtPlateLocal(plate).replace(/\s+/g, "");
  const normalizedVin = vin ? normalizeVin(vin) : "";
  if (!normalizedVin || normalizedVin.length !== 17) return null;

  const url = `https://www.regitra.lt/infocenter/public_search?plate=${encodeURIComponent(normalizedPlate)}&vin=${encodeURIComponent(normalizedVin)}`;
  try {
    const res = await fetch(url, {
      headers: {
        Accept: "text/html,application/json",
        "User-Agent": "vAuto/1.6.21 (+https://vauto.lt; regitra-opendata)",
      },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const parsed = extractTaFromHtml(html);
    if (!parsed) return null;
    return { ...parsed, source: "lt-regitra-opendata", vin: normalizedVin };
  } catch (e) {
    logProductionWarn("lt-ta-opendata", "Regitra open fetch failed", {
      error: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}

export async function lookupLtOpenData(
  plate: string,
  vin?: string
): Promise<LtTaOpenData | null> {
  if (vin) {
    const byVin = await lookupLtTaByVinOpenData(vin);
    if (byVin) return byVin;
    const byRegitra = await lookupLtRegitraOpenData(plate, vin);
    if (byRegitra) return byRegitra;
  }
  return null;
}
