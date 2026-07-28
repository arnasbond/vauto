import crypto from "node:crypto";
import { E2E_TEST_OTP, isE2eTestPhone } from "../auth/e2e-mock-auth.js";
import { isDemoBypassPhone, verifyDemoBypassOtp } from "../auth/demo-phones.js";
import { getSmsProvider } from "./sms.js";

interface OtpEntry {
  code: string;
  expiresAt: number;
}

const store = new Map<string, OtpEntry>();

const OTP_TTL_MS = 5 * 60 * 1000;

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

function resolveOtpLength(): number {
  const raw = Number(process.env.OTP_CODE_LENGTH ?? 6);
  if (!Number.isFinite(raw)) return 6;
  return Math.min(6, Math.max(4, Math.floor(raw)));
}

function generateOtpCode(): string {
  const length = resolveOtpLength();
  const min = 10 ** (length - 1);
  const max = 10 ** length - 1;
  return String(crypto.randomInt(min, max + 1));
}

/** Demo OTP when SMS is mocked — enables auth testing without burning BulkGate credits. */
export function usesDemoOtp(): boolean {
  // Non-production always uses fixed demo OTP (123456 / VAUTO_DEMO_OTP).
  if (process.env.NODE_ENV !== "production") {
    return true;
  }
  const mode = process.env.SMS_MODE?.trim().toLowerCase();
  // Explicit live carriers in production — real random OTP only.
  if (mode === "live" || mode === "twilio" || mode === "bulkgate") {
    return false;
  }
  const provider = getSmsProvider();
  if (provider === "twilio" || provider === "bulkgate") {
    return false;
  }
  return (
    provider === "mock" ||
    provider === "log" ||
    Boolean(process.env.VAUTO_DEMO_OTP)
  );
}

export function getOtpCodeLength(): number {
  if (usesDemoOtp() && process.env.VAUTO_DEMO_OTP) {
    return process.env.VAUTO_DEMO_OTP.length;
  }
  return resolveOtpLength();
}

export function issueOtp(phone: string): { code: string; expiresAt: number } {
  const key = normalizePhone(phone);
  // E2E / demo / non-prod → fixed OTP (logged to console; never burns BulkGate).
  const code = isE2eTestPhone(phone)
    ? E2E_TEST_OTP
    : isDemoBypassPhone(phone) || usesDemoOtp()
      ? process.env.VAUTO_DEMO_OTP ?? "123456"
      : generateOtpCode();
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

export function getOtpStoreSize(): number {
  return store.size;
}

/** Wipe all in-memory OTP codes (auth reset / clean launch). */
export function clearAllOtps(): number {
  const count = store.size;
  store.clear();
  return count;
}

/** Background cleanup for expired OTP entries (called opportunistically). */
export function purgeExpiredOtps(): number {
  const now = Date.now();
  let removed = 0;
  for (const [key, entry] of store) {
    if (entry.expiresAt < now) {
      store.delete(key);
      removed += 1;
    }
  }
  return removed;
}
