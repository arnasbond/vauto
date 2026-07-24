import crypto from "node:crypto";
import { maybeParseE2eAppleToken } from "./e2e-mock-auth.js";

export interface AppleTokenPayload {
  sub: string;
  email?: string;
  emailVerified?: boolean;
  isPrivateRelay?: boolean;
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

const APPLE_PRIVATE_RELAY_SUFFIX = "@privaterelay.appleid.com";

function base64UrlDecode(value: string): Buffer {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  return Buffer.from(padded + pad, "base64");
}

export function isApplePrivateRelayEmail(email?: string | null): boolean {
  return Boolean(
    email?.trim().toLowerCase().endsWith(APPLE_PRIVATE_RELAY_SUFFIX)
  );
}

function resolveAppleClientIds(): string[] {
  const ids = [
    process.env.APPLE_CLIENT_ID?.trim(),
    process.env.APPLE_SERVICE_ID?.trim(),
  ].filter((v): v is string => Boolean(v));
  return [...new Set(ids)];
}

function resolveAppleClientId(): string | null {
  return resolveAppleClientIds()[0] ?? null;
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
      isPrivateRelay: isApplePrivateRelayEmail(e2e.email),
    };
  }

  const clientIds = resolveAppleClientIds();
  if (!idToken || clientIds.length === 0) return null;

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
    is_private_email?: boolean | string;
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
  if (!aud.some((a) => a && clientIds.includes(a))) return null;
  if (!payload.exp || payload.exp * 1000 < Date.now()) return null;

  const email = payload.email?.trim() || undefined;
  const isPrivateRelay =
    isApplePrivateRelayEmail(email) ||
    payload.is_private_email === true ||
    payload.is_private_email === "true";

  return {
    sub: payload.sub,
    email,
    emailVerified:
      payload.email_verified === true || payload.email_verified === "true",
    isPrivateRelay,
  };
}

/** Services ID is enough to verify ID tokens; Team/Key/secret enable code exchange. */
export function isAppleOAuthConfigured(): boolean {
  return Boolean(resolveAppleClientId());
}

export function getAppleOAuthConfigStatus(): {
  configured: boolean;
  clientId: boolean;
  teamId: boolean;
  keyId: boolean;
  privateKeyOrSecret: boolean;
} {
  return {
    configured: isAppleOAuthConfigured(),
    clientId: Boolean(resolveAppleClientId()),
    teamId: Boolean(process.env.APPLE_TEAM_ID?.trim()),
    keyId: Boolean(process.env.APPLE_KEY_ID?.trim()),
    privateKeyOrSecret: Boolean(
      process.env.APPLE_PRIVATE_KEY?.trim() ||
        process.env.APPLE_CLIENT_SECRET?.trim()
    ),
  };
}
