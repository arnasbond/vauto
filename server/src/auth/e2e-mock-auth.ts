/** E2E-only mock OAuth tokens — disabled unless VAUTO_E2E_AUTH=1. */

export const E2E_GOOGLE_PREFIX = "vauto-e2e-google.";
export const E2E_APPLE_PREFIX = "vauto-e2e-apple.";

export const E2E_TEST_PHONE = "+37069900001";
export const E2E_TEST_OTP = "654321";

export interface E2eGooglePayload {
  sub: string;
  email?: string;
  name?: string;
  picture?: string;
}

export interface E2eApplePayload {
  sub: string;
  email?: string;
  name?: string;
}

export function isE2eMockAuthEnabled(): boolean {
  return process.env.VAUTO_E2E_AUTH === "1";
}

function decodePayload<T>(idToken: string, prefix: string): T | null {
  if (!isE2eMockAuthEnabled() || !idToken.startsWith(prefix)) return null;
  try {
    const raw = idToken.slice(prefix.length);
    const json = Buffer.from(raw, "base64url").toString("utf8");
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

export function encodeE2eGoogleToken(payload: E2eGooglePayload): string {
  return `${E2E_GOOGLE_PREFIX}${Buffer.from(JSON.stringify(payload)).toString("base64url")}`;
}

export function encodeE2eAppleToken(payload: E2eApplePayload): string {
  return `${E2E_APPLE_PREFIX}${Buffer.from(JSON.stringify(payload)).toString("base64url")}`;
}

export function maybeParseE2eGoogleToken(
  idToken: string
): E2eGooglePayload | null {
  return decodePayload<E2eGooglePayload>(idToken, E2E_GOOGLE_PREFIX);
}

export function maybeParseE2eAppleToken(
  idToken: string
): E2eApplePayload | null {
  return decodePayload<E2eApplePayload>(idToken, E2E_APPLE_PREFIX);
}

export function isE2eTestPhone(phone?: string | null): boolean {
  if (!isE2eMockAuthEnabled()) return false;
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits === E2E_TEST_PHONE.replace(/\D/g, "");
}

export function verifyE2eTestOtp(phone: string, code: string): boolean {
  if (!isE2eTestPhone(phone)) return false;
  return code.trim() === E2E_TEST_OTP;
}
