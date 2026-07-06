import crypto from "node:crypto";
import { maybeParseE2eAppleToken } from "./e2e-mock-auth.js";

export interface AppleTokenPayload {
  sub: string;
  email?: string;
  emailVerified?: boolean;
}

interface AppleJwk {
  kid: string;
  kty: string;
  use?: string;
  alg?: string;
  n: string;
  e: string;
}

interface AppleJwksResponse {
  keys: AppleJwk[];
}

let jwksCache: { keys: AppleJwk[]; fetchedAt: number } | null = null;
const JWKS_TTL_MS = 60 * 60 * 1000;

function base64UrlDecode(value: string): Buffer {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  return Buffer.from(padded + pad, "base64");
}

function resolveAppleClientId(): string | null {
  return (
    process.env.APPLE_CLIENT_ID?.trim() ||
    process.env.APPLE_SERVICE_ID?.trim() ||
    null
  );
}

async function fetchAppleJwks(): Promise<AppleJwk[]> {
  const now = Date.now();
  if (jwksCache && now - jwksCache.fetchedAt < JWKS_TTL_MS) {
    return jwksCache.keys;
  }
  const res = await fetch("https://appleid.apple.com/auth/keys");
  if (!res.ok) return [];
  const data = (await res.json()) as AppleJwksResponse;
  jwksCache = { keys: data.keys ?? [], fetchedAt: now };
  return jwksCache.keys;
}

async function getApplePublicKey(kid: string): Promise<crypto.KeyObject | null> {
  const keys = await fetchAppleJwks();
  const jwk = keys.find((k) => k.kid === kid);
  if (!jwk) return null;
  try {
    return crypto.createPublicKey({
      key: jwk as unknown as crypto.JsonWebKey,
      format: "jwk",
    });
  } catch {
    return null;
  }
}

/** Verify Apple identity token (Sign in with Apple). */
export async function verifyAppleIdToken(
  idToken: string
): Promise<AppleTokenPayload | null> {
  const e2e = maybeParseE2eAppleToken(idToken);
  if (e2e?.sub) {
    return {
      sub: e2e.sub,
      email: e2e.email,
      emailVerified: Boolean(e2e.email),
    };
  }

  const clientId = resolveAppleClientId();
  if (!idToken || !clientId) return null;

  const parts = idToken.split(".");
  if (parts.length !== 3) return null;

  let header: { alg?: string; kid?: string };
  let payload: {
    iss?: string;
    aud?: string | string[];
    exp?: number;
    sub?: string;
    email?: string;
    email_verified?: boolean | string;
  };

  try {
    header = JSON.parse(base64UrlDecode(parts[0]!).toString("utf8")) as {
      alg?: string;
      kid?: string;
    };
    payload = JSON.parse(base64UrlDecode(parts[1]!).toString("utf8")) as typeof payload;
  } catch {
    return null;
  }

  if (header.alg !== "RS256" || !header.kid || !payload.sub) return null;

  const publicKey = await getApplePublicKey(header.kid);
  if (!publicKey) return null;

  const signed = Buffer.from(`${parts[0]}.${parts[1]}`, "utf8");
  const signature = base64UrlDecode(parts[2]!);
  const valid = crypto.verify("RSA-SHA256", signed, publicKey, signature);
  if (!valid) return null;

  if (payload.iss !== "https://appleid.apple.com") return null;
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!aud.includes(clientId)) return null;
  if (!payload.exp || payload.exp * 1000 < Date.now()) return null;

  return {
    sub: payload.sub,
    email: payload.email,
    emailVerified:
      payload.email_verified === true || payload.email_verified === "true",
  };
}

export function isAppleOAuthConfigured(): boolean {
  return Boolean(resolveAppleClientId());
}
