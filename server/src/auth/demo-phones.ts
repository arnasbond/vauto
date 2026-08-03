import { isE2eTestPhone, verifyE2eTestOtp } from "./e2e-mock-auth.js";

/**
 * Demo / QA phone numbers — fixed OTP only when demo OTP is explicitly allowed.
 * Open LT production: VAUTO_ALLOW_DEMO_OTP must be false (env-check FATAL if true).
 * Local / non-prod: allowed for Playwright + ops scripts.
 * Never accept 123456 for arbitrary phones.
 */

export const DEMO_BYPASS_PHONES = new Set([
  "37060000001", // API listing smoke / prod-real E2E buyer
  "37060000002", // Pro business smoke / E2E seller
  "37060000099", // Admin demo phone
]);

/** True when fixed demo OTP may be issued/verified (never silent in bare production). */
export function isDemoOtpAllowed(): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  return process.env.VAUTO_ALLOW_DEMO_OTP === "true";
}

export function normalizePhoneDigits(phone?: string | null): string {
  return (phone ?? "").replace(/\D/g, "");
}

export function isDemoBypassPhone(phone?: string | null): boolean {
  if (!isDemoOtpAllowed()) return false;
  const digits = normalizePhoneDigits(phone);
  if (!digits) return false;
  if (isE2eTestPhone(phone)) return true;
  if (DEMO_BYPASS_PHONES.has(digits)) return true;
  if (process.env.VAUTO_DEMO_PHONES) {
    return process.env.VAUTO_DEMO_PHONES.split(/[,;\s]+/)
      .map((p) => normalizePhoneDigits(p))
      .filter(Boolean)
      .includes(digits);
  }
  return false;
}

export function demoOtpCode(): string {
  return process.env.VAUTO_DEMO_OTP ?? "123456";
}

export function verifyDemoBypassOtp(phone: string, code: string): boolean {
  if (!isDemoOtpAllowed()) return false;
  if (verifyE2eTestOtp(phone, code)) return true;
  if (!isDemoBypassPhone(phone)) return false;
  const trimmed = code.trim();
  return trimmed === demoOtpCode() || trimmed === "123456";
}
