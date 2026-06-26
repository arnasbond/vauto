import { calcVatBreakdown, type CheckoutProductKind } from "@/lib/monetization-catalog";
import { loadInvoices, saveInvoices, loadInvoiceSeries, saveInvoiceSeries } from "@/lib/storage";
import type { UserProfile } from "@/lib/types";

export interface VautoInvoice {
  id: string;
  number: string;
  createdAt: string;
  userId: string;
  buyerName: string;
  buyerEmail?: string;
  buyerCompanyName?: string;
  buyerCompanyCode?: string;
  buyerVatCode?: string;
  serviceTitle: string;
  serviceDescription?: string;
  amountNet: number;
  vatRate: number;
  vatAmount: number;
  amountGross: number;
  paymentMethod: string;
  checkoutKind: CheckoutProductKind;
  productId: string;
  listingId?: string;
}

function nextInvoiceNumber(): string {
  const year = new Date().getFullYear();
  const series = loadInvoiceSeries() ?? { year, seq: 0 };
  const seq = series.year === year ? series.seq + 1 : 1;
  saveInvoiceSeries({ year, seq });
  return `VAUTO-${year}-${String(seq).padStart(4, "0")}`;
}

export function listInvoicesForUser(userId: string): VautoInvoice[] {
  const all = loadInvoices() ?? [];
  return all
    .filter((inv) => inv.userId === userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function createInvoiceFromCheckout(params: {
  user: UserProfile;
  serviceTitle: string;
  serviceDescription?: string;
  amountGross: number;
  vatRate: number;
  paymentMethod: string;
  checkoutKind: CheckoutProductKind;
  productId: string;
  listingId?: string;
}): VautoInvoice {
  const { amountNet, vatAmount, amountGross } = calcVatBreakdown(
    params.amountGross,
    params.vatRate
  );
  const invoice: VautoInvoice = {
    id: `inv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    number: nextInvoiceNumber(),
    createdAt: new Date().toISOString(),
    userId: params.user.id,
    buyerName: params.user.companyName?.trim() || params.user.name,
    buyerEmail: params.user.email,
    buyerCompanyName: params.user.companyName,
    buyerCompanyCode: params.user.companyCode,
    buyerVatCode: params.user.vatCode,
    serviceTitle: params.serviceTitle,
    serviceDescription: params.serviceDescription,
    amountNet,
    vatRate: params.vatRate,
    vatAmount,
    amountGross,
    paymentMethod: params.paymentMethod,
    checkoutKind: params.checkoutKind,
    productId: params.productId,
    listingId: params.listingId,
  };
  const all = loadInvoices() ?? [];
  saveInvoices([invoice, ...all]);
  return invoice;
}

export function formatInvoiceDate(iso: string): string {
  return new Date(iso).toLocaleDateString("lt-LT", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
