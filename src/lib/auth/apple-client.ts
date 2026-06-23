export function isAppleAuthConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_APPLE_AUTH_CLIENT_ID);
}
