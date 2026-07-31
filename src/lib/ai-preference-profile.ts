import type { BodyMeasurements, UserProfile } from "@/lib/types";
import type { UserPreferencesPayload } from "@/lib/api/user-intelligence";

export interface PrimaryVehiclePref {
  make: string;
  model: string;
  year: number;
}

/** Normalized AI Twin fields used by Preference Center + Magic Mirror. */
export interface AiTwinProfileForm {
  shoeSizeEu: string;
  clothingSize: string;
  heightCm: string;
  bustCm: string;
  waistCm: string;
  hipsCm: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: string;
  purchasePrefsRaw: string;
}

export const EMPTY_AI_TWIN_FORM: AiTwinProfileForm = {
  shoeSizeEu: "",
  clothingSize: "",
  heightCm: "",
  bustCm: "",
  waistCm: "",
  hipsCm: "",
  vehicleMake: "",
  vehicleModel: "",
  vehicleYear: "",
  purchasePrefsRaw: "",
};

const CLOTHING_PRESETS = ["XS", "S", "M", "L", "XL", "XXL"] as const;

export function isClothingSizePreset(value: string): boolean {
  return CLOTHING_PRESETS.includes(
    value.trim().toUpperCase() as (typeof CLOTHING_PRESETS)[number]
  );
}

export { CLOTHING_PRESETS };

function parseOptionalCm(raw: string): number | undefined {
  const n = Number(String(raw).replace(",", ".").trim());
  if (!Number.isFinite(n) || n <= 0 || n > 300) return undefined;
  return Math.round(n);
}

function parsePurchasePrefs(raw: string): string[] {
  const cleaned = raw
    .split(/[,\n;]/g)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 12)
    .map((s) => s.slice(0, 48));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const h of cleaned) {
    const k = h.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(h);
  }
  return out;
}

export function parsePrimaryVehicle(
  raw: unknown
): PrimaryVehiclePref | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const make = String(o.make ?? "").trim();
  const model = String(o.model ?? "").trim();
  const year = Number(o.year);
  if (!make || !model || !Number.isFinite(year) || year < 1950 || year > 2100) {
    return undefined;
  }
  return { make, model, year: Math.floor(year) };
}

export function formFromPreferences(
  prefs: UserPreferencesPayload | null | undefined,
  user?: Pick<UserProfile, "bodyMeasurements" | "primaryVehicle" | "hobbies">
): AiTwinProfileForm {
  const bm = prefs?.bodyMeasurements ?? user?.bodyMeasurements;
  const vehicle =
    parsePrimaryVehicle(prefs?.primaryVehicle) ?? user?.primaryVehicle;
  const clothing =
    String(prefs?.clothingSize ?? bm?.usualSize ?? "").trim() || "";
  const shoe = String(prefs?.shoeSizeEu ?? bm?.shoeSizeEu ?? "").trim();
  const purchase =
    prefs?.purchasePrefs?.length
      ? prefs.purchasePrefs
      : user?.hobbies ?? [];

  return {
    shoeSizeEu: shoe,
    clothingSize: clothing,
    heightCm: bm?.heightCm != null ? String(bm.heightCm) : "",
    bustCm: bm?.bustCm != null ? String(bm.bustCm) : "",
    waistCm: bm?.waistCm != null ? String(bm.waistCm) : "",
    hipsCm: bm?.hipsCm != null ? String(bm.hipsCm) : "",
    vehicleMake: vehicle?.make ?? "",
    vehicleModel: vehicle?.model ?? "",
    vehicleYear: vehicle?.year != null ? String(vehicle.year) : "",
    purchasePrefsRaw: purchase.join(", "),
  };
}

export function formToPreferencesPayload(
  form: AiTwinProfileForm
): UserPreferencesPayload {
  const clothingSize = form.clothingSize.trim();
  const shoeSizeEu = form.shoeSizeEu.trim();
  const bodyMeasurements: BodyMeasurements = {};
  const heightCm = parseOptionalCm(form.heightCm);
  const bustCm = parseOptionalCm(form.bustCm);
  const waistCm = parseOptionalCm(form.waistCm);
  const hipsCm = parseOptionalCm(form.hipsCm);
  if (heightCm) bodyMeasurements.heightCm = heightCm;
  if (bustCm) bodyMeasurements.bustCm = bustCm;
  if (waistCm) bodyMeasurements.waistCm = waistCm;
  if (hipsCm) bodyMeasurements.hipsCm = hipsCm;
  if (clothingSize) bodyMeasurements.usualSize = clothingSize;
  if (shoeSizeEu) bodyMeasurements.shoeSizeEu = shoeSizeEu;

  const vehicle = parsePrimaryVehicle({
    make: form.vehicleMake,
    model: form.vehicleModel,
    year: form.vehicleYear,
  });

  const purchasePrefs = parsePurchasePrefs(form.purchasePrefsRaw);
  const preferredSizes = [
    ...(clothingSize ? [clothingSize] : []),
    ...(shoeSizeEu ? [`EU${shoeSizeEu.replace(/^EU/i, "")}`] : []),
  ];

  return {
    clothingSize: clothingSize || undefined,
    shoeSizeEu: shoeSizeEu || undefined,
    bodyMeasurements:
      Object.keys(bodyMeasurements).length > 0 ? bodyMeasurements : {},
    primaryVehicle: vehicle
      ? { make: vehicle.make, model: vehicle.model, year: vehicle.year }
      : null,
    purchasePrefs,
    preferredSizes,
  };
}

/** Merge preferences into UserProfile fields Magic Mirror / Fleet read. */
export function userPatchFromPreferences(
  prefs: UserPreferencesPayload
): Partial<UserProfile> {
  const clothing = String(prefs.clothingSize ?? "").trim();
  const shoe = String(prefs.shoeSizeEu ?? "").trim();
  const bm: BodyMeasurements = { ...(prefs.bodyMeasurements ?? {}) };
  if (clothing) bm.usualSize = clothing;
  if (shoe) bm.shoeSizeEu = shoe;

  const vehicle = parsePrimaryVehicle(prefs.primaryVehicle);
  const purchase = Array.isArray(prefs.purchasePrefs)
    ? prefs.purchasePrefs.map(String).filter(Boolean)
    : [];

  const patch: Partial<UserProfile> = {};
  if (Object.keys(bm).length > 0) patch.bodyMeasurements = bm;
  if (vehicle) patch.primaryVehicle = vehicle;
  if (purchase.length) patch.hobbies = purchase;
  return patch;
}

/** True when Magic Mirror has enough real buyer size data from AI Twin profile. */
export function hasAiTwinFitData(
  user: Pick<UserProfile, "bodyMeasurements">
): boolean {
  const m = user.bodyMeasurements;
  if (!m) return false;
  const hasSize = Boolean(String(m.usualSize ?? "").trim());
  const hasCm = [m.bustCm, m.waistCm, m.hipsCm, m.heightCm].some(
    (n) => typeof n === "number" && n > 0
  );
  return hasSize || hasCm;
}
