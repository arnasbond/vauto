import { OAuth2Client } from "google-auth-library";
import { maybeParseE2eGoogleToken } from "./e2e-mock-auth.js";

export interface GoogleTokenPayload {
  email?: string;
  name?: string;
  picture?: string;
  sub: string;
}

/** Verify Google ID token via google-auth-library (uses GOOGLE_CLIENT_ID). */
export async function verifyGoogleIdToken(
  idToken: string
): Promise<GoogleTokenPayload | null> {
  const e2e = maybeParseE2eGoogleToken(idToken);
  if (e2e?.sub) {
    return {
      sub: e2e.sub,
      email: e2e.email,
      name: e2e.name,
      picture: e2e.picture,
    };
  }

  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  if (!idToken || !clientId) return null;

  try {
    const client = new OAuth2Client(clientId);
    const ticket = await client.verifyIdToken({
      idToken,
      audience: clientId,
    });
    const payload = ticket.getPayload();
    if (!payload?.sub) return null;
    return {
      sub: payload.sub,
      email: payload.email,
      name: payload.name,
      picture: payload.picture,
    };
  } catch {
    return null;
  }
}

export function isGoogleOAuthConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID?.trim());
}
