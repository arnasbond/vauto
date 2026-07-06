import { isE2eTestPhone, verifyE2eTestOtp } from "./e2e-mock-auth.js";

/** Demo / QA phone numbers — bypass strict OTP when using VAUTO_DEMO_OTP code. */

export const DEMO_BYPASS_PHONES = new Set([
  "37060000002", // Pro business smoke test (PRO_DEMO_PHONE)
  "37060000099", // Admin demo phone
]);

export function normalizePhoneDigits(phone?: string | null): string {
  return (phone ?? "").replace(/\D/g, "");
}

export function isDemoBypassPhone(phone?: string | null): boolean {
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
  if (verifyE2eTestOtp(phone, code)) return true;
  if (!isDemoBypassPhone(phone)) return false;
  const trimmed = code.trim();
  return trimmed === demoOtpCode() || trimmed === "123456";
}
