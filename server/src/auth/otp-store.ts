import crypto from "node:crypto";
import { verifyDemoBypassOtp } from "./demo-phones.js";

interface OtpEntry {
  code: string;
  expiresAt: number;
}

const store = new Map<string, OtpEntry>();

const OTP_TTL_MS = 5 * 60 * 1000;

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

function smsConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_FROM_NUMBER
  );
}

/** Demo OTP when Twilio is off — enables auth testing on production staging. */
export function usesDemoOtp(): boolean {
  return (
    process.env.NODE_ENV !== "production" ||
    !smsConfigured() ||
    Boolean(process.env.VAUTO_DEMO_OTP)
  );
}

export function issueOtp(phone: string): { code: string; expiresAt: number } {
  const key = normalizePhone(phone);
  const code = usesDemoOtp()
    ? process.env.VAUTO_DEMO_OTP ?? "123456"
    : String(crypto.randomInt(100000, 999999));
  const expiresAt = Date.now() + OTP_TTL_MS;
  store.set(key, { code, expiresAt });
  return { code, expiresAt };
}

export function verifyOtp(phone: string, code: string): boolean {
  const key = normalizePhone(phone);
  if (verifyDemoBypassOtp(phone, code)) return true;
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
