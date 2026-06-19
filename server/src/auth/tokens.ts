import crypto from "node:crypto";

const SECRET = process.env.JWT_SECRET ?? "vauto-dev-secret-change-in-production";
const TTL_MS = Number(process.env.JWT_TTL_MS ?? 7 * 24 * 60 * 60 * 1000);

export interface TokenPayload {
  sub: string;
  role?: string;
  provider?: string;
  exp: number;
}

function b64url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf.toString("base64url");
}

export function signAccessToken(payload: Omit<TokenPayload, "exp">): string {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(
    JSON.stringify({
      ...payload,
      exp: Date.now() + TTL_MS,
    } satisfies TokenPayload)
  );
  const sig = crypto
    .createHmac("sha256", SECRET)
    .update(`${header}.${body}`)
    .digest("base64url");
  return `${header}.${body}.${sig}`;
}

export function verifyAccessToken(token: string): TokenPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  const expected = crypto
    .createHmac("sha256", SECRET)
    .update(`${header}.${body}`)
    .digest("base64url");
  if (sig !== expected) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8")
    ) as TokenPayload;
    if (!payload.sub || !payload.exp) return null;
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function getTokenTtlMs(): number {
  return TTL_MS;
}
