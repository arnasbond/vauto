import { getStripe } from "./billing/stripe-client.js";

/** Free wallet credits — only when Stripe billing is off or explicitly allowed. */
export function demoWalletTopUpAllowed(): boolean {
  if (process.env.VAUTO_ALLOW_DEMO_WALLET === "true") return true;
  if (process.env.NODE_ENV !== "production") return true;
  return !getStripe();
}

/** Never leak OTP codes in production API responses. */
export function exposeOtpDevHint(): boolean {
  return process.env.NODE_ENV !== "production";
}
