import { normalizeLtPhoneForApi } from "@/lib/phone-input";

const REGISTRY_KEY = "vauto_mock_phone_registry_v1";

export const DUPLICATE_USER_ERROR = "Toks vartotojas jau egzistuoja";

interface PhoneRegistryEntry {
  userId: string;
  phone: string;
  registeredAt: string;
}

type PhoneRegistry = Record<string, PhoneRegistryEntry>;

function readRegistry(): PhoneRegistry {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(REGISTRY_KEY);
    return raw ? (JSON.parse(raw) as PhoneRegistry) : {};
  } catch {
    return {};
  }
}

function writeRegistry(registry: PhoneRegistry): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(REGISTRY_KEY, JSON.stringify(registry));
  } catch {
    /* quota */
  }
}

export function normalizePhoneDigits(phone?: string | null): string {
  return normalizeLtPhoneForApi(phone ?? "").replace(/\D/g, "");
}

export function getMockUserIdByPhone(phone: string): string | null {
  const digits = normalizePhoneDigits(phone);
  if (!digits) return null;
  return readRegistry()[digits]?.userId ?? null;
}

/**
 * Validates mock phone auth and registers new testers.
 * Returns null on success, or an error message string.
 */
export function validateMockPhoneAuth(
  phone: string,
  userId: string,
  opts?: { isNewRegistration?: boolean }
): string | null {
  const digits = normalizePhoneDigits(phone);
  if (!digits) return "Neteisingas telefono numeris";

  const registry = readRegistry();
  const existing = registry[digits];

  if (existing && existing.userId !== userId) {
    return DUPLICATE_USER_ERROR;
  }

  if (opts?.isNewRegistration && existing) {
    return DUPLICATE_USER_ERROR;
  }

  registry[digits] = {
    userId,
    phone: normalizeLtPhoneForApi(phone),
    registeredAt: existing?.registeredAt ?? new Date().toISOString(),
  };
  writeRegistry(registry);
  return null;
}
