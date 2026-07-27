/**
 * Shared Stripe Checkout payment-method defaults for VAUTO.
 * Apple Pay / Google Pay appear on hosted Checkout when enabled in Dashboard
 * + domain verified for www.vauto.lt (and APP_ORIGIN).
 */
import type Stripe from "stripe";

/** Card + Link (wallets ride on card once Dashboard/domain ready). */
export function checkoutPaymentMethodTypes(): Stripe.Checkout.SessionCreateParams.PaymentMethodType[] {
  const raw = process.env.STRIPE_CHECKOUT_PAYMENT_METHODS?.trim();
  if (raw) {
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean) as Stripe.Checkout.SessionCreateParams.PaymentMethodType[];
  }
  // card → Visa/MC + Apple Pay + Google Pay (Dashboard); link → Stripe Link / bank-ish save.
  return ["card", "link"];
}

/** Common Checkout UX knobs for in-VAUTO return + tax IDs (PVM). */
export function checkoutBuyerCollectionParams(
  mode: "payment" | "subscription"
): Partial<Stripe.Checkout.SessionCreateParams> {
  const base: Partial<Stripe.Checkout.SessionCreateParams> = {
    payment_method_types: checkoutPaymentMethodTypes(),
    billing_address_collection: "required",
    phone_number_collection: { enabled: true },
    tax_id_collection: { enabled: true },
    allow_promotion_codes: true,
  };
  if (mode === "payment") {
    // Stripe-hosted invoice PDF for one-off charges (promote / style boost).
    base.invoice_creation = { enabled: true };
  }
  return base;
}
