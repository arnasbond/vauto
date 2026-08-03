/** Free wallet credits — only when explicitly allowed (never silent in production). */
export function demoWalletTopUpAllowed(): boolean {
  if (process.env.VAUTO_ALLOW_DEMO_WALLET === "true") return true;
  if (process.env.NODE_ENV !== "production") return true;
  // Production: no free credits just because Stripe is missing.
  return false;
}

/** Never leak OTP codes in production API responses. */
export function exposeOtpDevHint(): boolean {
  return process.env.NODE_ENV !== "production";
}
