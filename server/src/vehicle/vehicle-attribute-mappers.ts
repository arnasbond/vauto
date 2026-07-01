export interface MileageRecord {
  date: string;
  km: string;
}

export function mapFuelType(raw?: string): string {
  const v = (raw ?? "").toLowerCase();
  if (/dyzel|diesel/i.test(v)) return "Dyzelinas";
  if (/elektr/i.test(v)) return "Elektra";
  if (/hibrid|hybrid/i.test(v)) return "Hibridas";
  if (/benzin|petrol|gasoline/i.test(v)) return "Benzinas";
  if (/duj|lpg|cng/i.test(v)) return "Benzinas / dujos";
  return raw?.trim() || "Nežinoma";
}

export function mapGearbox(raw?: string): string | undefined {
  const v = (raw ?? "").toLowerCase();
  if (!v.trim()) return undefined;
  if (/manual|mechan/i.test(v)) return "Mechaninė";
  if (/automatic|automatin|cvt|dct|semi/i.test(v)) return "Automatinė";
  return undefined;
}

const BODY_TYPE_LT = [
  "Sedanas",
  "Hečbekas",
  "Universalas",
  "Visureigis / SUV",
  "Vienatūris",
  "Kupė (Coupe)",
  "Kabrioletas",
  "Pikapas",
  "Komercinis",
] as const;

export function mapBodyTypeLt(raw?: string): string {
  const v = (raw ?? "").trim();
  if (!v) return "Nežinomas";

  const lower = v.toLowerCase();
  if (/sedan|saloon|limuzin/i.test(lower)) return "Sedanas";
  if (/hatch|hečbek|hecbek/i.test(lower)) return "Hečbekas";
  if (/wagon|universal|estate|kombi|touring/i.test(lower)) return "Universalas";
  if (/suv|crossover|visureig|off.?road|4x4/i.test(lower)) return "Visureigis / SUV";
  if (/mpv|minivan|vienatūr|van.*passenger/i.test(lower)) return "Vienatūris";
  if (/coup/i.test(lower)) return "Kupė (Coupe)";
  if (/convert|cabrio|kabriolet/i.test(lower)) return "Kabrioletas";
  if (/pickup|pikap/i.test(lower)) return "Pikapas";
  if (/van|commercial|komercin|truck|lorry/i.test(lower)) return "Komercinis";

  const exact = BODY_TYPE_LT.find((opt) => opt.toLowerCase() === lower);
  if (exact) return exact;

  return v;
}

export function parsePowerKw(raw?: string): string | undefined {
  const v = (raw ?? "").trim();
  if (!v) return undefined;
  const kwMatch = v.match(/(\d+(?:[.,]\d+)?)\s*kW/i);
  if (kwMatch) return kwMatch[1].replace(",", ".");
  const num = Number(v);
  if (Number.isFinite(num) && num > 0 && num < 2000) return String(num);
  return undefined;
}

export function parsePowerHp(raw?: string): string | undefined {
  const v = (raw ?? "").trim();
  if (!v) return undefined;
  const hpMatch = v.match(/(\d+(?:[.,]\d+)?)\s*(?:AG|HP|hp)/i);
  if (hpMatch) return hpMatch[1].replace(",", ".");
  return undefined;
}

export function extractMileageRecords(
  json: Record<string, unknown>
): MileageRecord[] {
  const records: MileageRecord[] = [];
  const direct = json.MileageHistory ?? json.mileageHistory ?? json.MileageRecords;
  if (Array.isArray(direct)) {
    for (const item of direct) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      const km = pickString(row, "km", "Km", "Mileage", "mileage", "Odometer");
      const date = pickString(row, "date", "Date", "RecordedAt", "recordedAt");
      if (km) records.push({ date: date || "—", km });
    }
  }
  const lastKm = pickString(json, "Mileage", "mileage", "Odometer", "odometer");
  const lastDate = pickString(
    json,
    "MileageDate",
    "mileageDate",
    "LastMileageDate",
    "MotExpiryDate"
  );
  if (lastKm && records.length === 0) {
    records.push({ date: lastDate || "—", km: lastKm });
  }
  return records;
}

function pickString(obj: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return "";
}

export function isOfficialVehicleSource(
  source: string
): source is "vin-decoder-nhtsa" | "regitra-plate-api" {
  return source === "vin-decoder-nhtsa" || source === "regitra-plate-api";
}
