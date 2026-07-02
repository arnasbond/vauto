/** Server-side infrastructure readiness snapshot for /api/health. */

import { visualPipelineFeatures } from "../services/visual-pipeline/features.js";
import { isStripeEscrowLive } from "../billing/stripe-b2b.js";

export interface InfraReadiness {
  ocrConfigured: boolean;
  studioBgConfigured: boolean;
  geminiConfigured: boolean;
  stripeConfigured: boolean;
  stripeWebhookConfigured: boolean;
  shippingCarrierLive: boolean;
  shippingCarrierProvider: string;
  pushConfigured: boolean;
  emailConfigured: boolean;
  warnings: string[];
}

export function getInfraReadiness(): InfraReadiness {
  const visual = visualPipelineFeatures();
  const warnings: string[] = [];

  const ocrConfigured = visual.ocr !== "none";
  const studioBgConfigured = visual.backgroundRemoval !== "none";
  const geminiConfigured = Boolean(
    process.env.GEMINI_API_KEY?.trim() ||
      process.env.AI_KEY?.trim() ||
      process.env.GOOGLE_AI_API_KEY?.trim()
  );
  const stripeConfigured = Boolean(process.env.STRIPE_SECRET_KEY?.trim());
  const stripeWebhookConfigured = Boolean(process.env.STRIPE_WEBHOOK_SECRET?.trim());
  const omnivaKey = Boolean(process.env.OMNIVA_API_KEY?.trim());
  const dpdKey = Boolean(process.env.DPD_API_KEY?.trim());
  const shippingCarrierLive = omnivaKey || dpdKey;
  const shippingCarrierProvider = omnivaKey
    ? "omniva"
    : dpdKey
      ? "dpd"
      : "simulated";
  const pushConfigured = Boolean(
    (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) ||
      process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  );
  const emailConfigured = Boolean(process.env.RESEND_API_KEY?.trim());

  if (!ocrConfigured) {
    warnings.push("OCR not configured — Code Vision fallback only");
  }
  if (!studioBgConfigured) {
    warnings.push("Studio BG provider not configured");
  }
  if (!geminiConfigured) {
    warnings.push("Gemini API key missing");
  }
  if (!stripeConfigured) {
    warnings.push("Stripe escrow not configured");
  } else if (!stripeWebhookConfigured) {
    warnings.push("Stripe webhook secret missing");
  }
  if (!shippingCarrierLive) {
    warnings.push("Carrier API not configured — simulated shipping labels");
  }
  if (!pushConfigured) {
    warnings.push("Push notifications not fully configured");
  }
  if (!emailConfigured) {
    warnings.push("Admin/report email not configured");
  }

  return {
    ocrConfigured,
    studioBgConfigured,
    geminiConfigured,
    stripeConfigured: stripeConfigured && isStripeEscrowLive(),
    stripeWebhookConfigured,
    shippingCarrierLive,
    shippingCarrierProvider,
    pushConfigured,
    emailConfigured,
    warnings,
  };
}
