import crypto from "node:crypto";

interface OtpEntry {
  code: string;
  expiresAt: number;
}

const store = new Map<string, OtpEntry>();

const OTP_TTL_MS = 5 * 60 * 1000;

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

export function issueOtp(phone: string): { code: string; expiresAt: number } {
  const key = normalizePhone(phone);
  const code =
    process.env.NODE_ENV === "production"
      ? String(crypto.randomInt(100000, 999999))
      : process.env.VAUTO_DEMO_OTP ?? "123456";
  const expiresAt = Date.now() + OTP_TTL_MS;
  store.set(key, { code, expiresAt });
  return { code, expiresAt };
}

export function verifyOtp(phone: string, code: string): boolean {
  const key = normalizePhone(phone);
  const entry = store.get(key);
  if (!entry) return false;
  if (entry.expiresAt < Date.now()) {
    store.delete(key);
    return false;
  }
  const ok = entry.code === code.trim();
  if (ok) store.delete(key);
  return ok;
}
