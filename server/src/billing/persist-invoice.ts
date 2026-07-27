/**
 * Persist a PVM sąskaita-faktūra after successful Stripe Checkout.
 */
import type Stripe from "stripe";
import { calcVatFromGross } from "./legal-issuer.js";
import { insertBillingInvoice } from "../repository.js";

function serviceTitleForSession(session: Stripe.Checkout.Session): {
  title: string;
  description?: string;
  kind: string;
  productId?: string;
  listingId?: string;
} {
  const kind = session.metadata?.kind ?? "payment";
  if (kind === "b2c_promote") {
    return {
      title: "VAUTO skelbimo iškėlimas",
      description: session.metadata?.tier
        ? `Matomumo lygis ${session.metadata.tier}`
        : undefined,
      kind,
      productId: session.metadata?.productId || undefined,
      listingId: session.metadata?.listingId || undefined,
    };
  }
  if (kind === "escrow") {
    return {
      title: "VAUTO saugus pirkimas (pirkėjo apsauga)",
      description: session.metadata?.escrowId
        ? `Escrow ${session.metadata.escrowId}`
        : undefined,
      kind,
      productId: session.metadata?.escrowId,
    };
  }
  const planId = session.metadata?.planId ?? "plan";
  return {
    title: `VAUTO ${String(planId).toUpperCase()} prenumerata`,
    kind: kind === "b2b_subscription" ? kind : "b2b_subscription",
    productId: planId,
  };
}

export async function persistInvoiceFromCheckoutSession(
  session: Stripe.Checkout.Session
): Promise<void> {
  const userId =
    session.metadata?.userId ||
    session.metadata?.buyerId ||
    undefined;
  if (!userId) return;
  if (session.payment_status !== "paid" && session.status !== "complete") {
    return;
  }

  const kindHint = session.metadata?.kind ?? "payment";

  const amountGross =
    kindHint === "escrow"
      ? Number(session.metadata?.buyerProtectionFeeEur ?? 0)
      : session.amount_total != null
        ? session.amount_total / 100
        : 0;
  if (!Number.isFinite(amountGross) || amountGross <= 0) {
    // Launch promo / zero-amount — skip fiscal invoice.
    return;
  }

  const { amountNet, vatAmount, vatRate } = calcVatFromGross(amountGross);
  const svc = serviceTitleForSession(session);
  const details = session.customer_details;
  const taxIds = details?.tax_ids ?? [];
  const vatFromTax = taxIds.find((t) => t?.type === "eu_vat")?.value;

  await insertBillingInvoice({
    userId,
    stripeSessionId: session.id,
    stripeInvoiceId:
      typeof session.invoice === "string"
        ? session.invoice
        : session.invoice && typeof session.invoice === "object"
          ? session.invoice.id
          : undefined,
    kind: svc.kind,
    productId: svc.productId,
    listingId: svc.listingId,
    serviceTitle: svc.title,
    serviceDescription: svc.description,
    amountNet,
    vatRate,
    vatAmount,
    amountGross,
    buyerName: details?.name ?? undefined,
    buyerEmail: details?.email ?? session.customer_email ?? undefined,
    buyerVatCode: vatFromTax ?? undefined,
    paymentMethod: session.payment_method_types?.[0] ?? "card",
  });
}
