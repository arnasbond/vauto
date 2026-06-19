export interface GoogleTokenPayload {
  email?: string;
  name?: string;
  picture?: string;
  sub: string;
}

/** Verify Google ID token via tokeninfo endpoint. */
export async function verifyGoogleIdToken(
  idToken: string
): Promise<GoogleTokenPayload | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!idToken) return null;

  try {
    const res = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`
    );
    if (!res.ok) return null;
    const data = (await res.json()) as GoogleTokenPayload & {
      aud?: string;
      email_verified?: string;
    };
    if (clientId && data.aud !== clientId) return null;
    if (!data.sub) return null;
    return {
      sub: data.sub,
      email: data.email,
      name: data.name,
      picture: data.picture,
    };
  } catch {
    return null;
  }
}
