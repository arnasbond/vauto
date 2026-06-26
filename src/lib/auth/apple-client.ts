import {
  getAppleRedirectUris,
  getWebAuthCallbackUrl,
  isNativeAuthEnvironment,
} from "@/lib/auth/oauth-redirect";

export function getAppleClientId(): string | null {
  return process.env.NEXT_PUBLIC_APPLE_AUTH_CLIENT_ID ?? null;
}

export function isAppleAuthConfigured(): boolean {
  return Boolean(getAppleClientId());
}

/** Return URLs to register in Apple Developer → Sign in with Apple. */
export function getConfiguredAppleRedirectUris(): string[] {
  return getAppleRedirectUris();
}

export function getAppleAuthRedirectUri(): string {
  return getWebAuthCallbackUrl();
}

export function isAppleNativeAuthEnvironment(): boolean {
  return isNativeAuthEnvironment();
}
