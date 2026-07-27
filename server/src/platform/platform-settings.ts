import { query } from "../db.js";

export type PlatformFlagKey =
  | "maintenanceMode"
  | "disableNewListings"
  | "disableCheckout";

export interface PlatformFlags {
  maintenanceMode: boolean;
  disableNewListings: boolean;
  disableCheckout: boolean;
}

const FLAG_KEYS: PlatformFlagKey[] = [
  "maintenanceMode",
  "disableNewListings",
  "disableCheckout",
];

const DEFAULT_FLAGS: PlatformFlags = {
  maintenanceMode: false,
  disableNewListings: false,
  disableCheckout: false,
};

function parseBool(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const v = raw.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

export async function getPlatformSetting(
  key: string
): Promise<string | null> {
  try {
    const rows = await query<{ value: string }>(
      `SELECT value FROM platform_settings WHERE key = $1 LIMIT 1`,
      [key]
    );
    return rows[0]?.value ?? null;
  } catch {
    return null;
  }
}

export async function setPlatformSetting(
  key: string,
  value: string,
  updatedBy?: string | null
): Promise<void> {
  await query(
    `INSERT INTO platform_settings (key, value, updated_at, updated_by)
     VALUES ($1, $2, now(), $3)
     ON CONFLICT (key) DO UPDATE SET
       value = EXCLUDED.value,
       updated_at = now(),
       updated_by = EXCLUDED.updated_by`,
    [key, value, updatedBy ?? null]
  );
}

export async function getPlatformFlags(): Promise<PlatformFlags> {
  try {
    const rows = await query<{ key: string; value: string }>(
      `SELECT key, value FROM platform_settings
       WHERE key = ANY($1::text[])`,
      [FLAG_KEYS]
    );
    const flags: PlatformFlags = { ...DEFAULT_FLAGS };
    for (const row of rows) {
      if (row.key === "maintenanceMode") flags.maintenanceMode = parseBool(row.value);
      if (row.key === "disableNewListings") flags.disableNewListings = parseBool(row.value);
      if (row.key === "disableCheckout") flags.disableCheckout = parseBool(row.value);
    }
    return flags;
  } catch {
    return { ...DEFAULT_FLAGS };
  }
}

export async function setPlatformFlags(
  patch: Partial<PlatformFlags>,
  updatedBy?: string | null
): Promise<PlatformFlags> {
  for (const key of FLAG_KEYS) {
    if (patch[key] === undefined) continue;
    await setPlatformSetting(key, patch[key] ? "true" : "false", updatedBy);
  }
  return getPlatformFlags();
}

/** LT message when public writes are blocked by maintenance / kill switches. */
export const PLATFORM_MAINTENANCE_MESSAGE =
  "Platforma laikinai techninėje priežiūroje. Bandykite vėliau.";

export const PLATFORM_LISTINGS_DISABLED_MESSAGE =
  "Naujų skelbimų kūrimas laikinai išjungtas.";

export const PLATFORM_CHECKOUT_DISABLED_MESSAGE =
  "Mokėjimai laikinai išjungti. Bandykite vėliau.";
