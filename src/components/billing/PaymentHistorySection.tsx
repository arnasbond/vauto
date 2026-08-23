"use client";

import { useEffect, useMemo, useState } from "react";
import { FileText, Receipt } from "lucide-react";
import { InvoicePrintView } from "@/components/billing/InvoicePrintView";
import { apiListBillingInvoices } from "@/lib/api/client";
import { isDataApiEnabled } from "@/lib/api/config";
import {
  formatInvoiceDate,
  listInvoicesForUser,
  type VautoInvoice,
} from "@/lib/invoices";
import type { CheckoutProductKind } from "@/lib/monetization-catalog";
import type { UserProfile } from "@/lib/types";

interface PaymentHistorySectionProps {
  user: UserProfile;
  refreshKey?: number;
}

function mapServerInvoice(
  raw: {
    id: string;
    number: string;
    userId: string;
    kind: string;
    productId?: string;
    listingId?: string;
    serviceTitle: string;
    serviceDescription?: string;
    amountNet: number;
    vatRate: number;
    vatAmount: number;
    amountGross: number;
    buyerName?: string;
    buyerEmail?: string;
    buyerCompanyName?: string;
    buyerCompanyCode?: string;
    buyerVatCode?: string;
    paymentMethod?: string;
    createdAt: string;
  },
  user: UserProfile
): VautoInvoice {
  return {
    id: raw.id,
    number: raw.number,
    createdAt: raw.createdAt,
    userId: raw.userId,
    buyerName: raw.buyerName || user.companyName || user.name,
    buyerEmail: raw.buyerEmail || user.email,
    buyerCompanyName: raw.buyerCompanyName || user.companyName,
    buyerCompanyCode: raw.buyerCompanyCode || user.companyCode,
    buyerVatCode: raw.buyerVatCode || user.vatCode,
    serviceTitle: raw.serviceTitle,
    serviceDescription: raw.serviceDescription,
    amountNet: raw.amountNet,
    vatRate: raw.vatRate,
    vatAmount: raw.vatAmount,
    amountGross: raw.amountGross,
    paymentMethod: raw.paymentMethod || "Stripe",
    checkoutKind: (raw.kind as CheckoutProductKind) || "b2b_subscription",
    productId: raw.productId || raw.kind,
    listingId: raw.listingId,
  };
}

export function PaymentHistorySection({
  user,
  refreshKey = 0,
}: PaymentHistorySectionProps) {
  const [preview, setPreview] = useState<VautoInvoice | null>(null);
  const [serverInvoices, setServerInvoices] = useState<VautoInvoice[]>([]);

  useEffect(() => {
    if (!isDataApiEnabled()) return;
    void apiListBillingInvoices().then((r) => {
      if (r.ok && r.data.invoices) {
        setServerInvoices(r.data.invoices.map((inv) => mapServerInvoice(inv, user)));
      }
    });
  }, [user, refreshKey]);

  const invoices = useMemo(() => {
    void refreshKey;
    const local = listInvoicesForUser(user.id).map((inv) => ({
      ...inv,
      buyerName: inv.buyerName || user.companyName || user.name,
    }));
    const byId = new Map<string, VautoInvoice>();
    for (const inv of local) byId.set(inv.id, inv);
    for (const inv of serverInvoices) byId.set(inv.id, inv);
    // Prefer stripe session numbers / server rows by number uniqueness
    const byNumber = new Map<string, VautoInvoice>();
    for (const inv of byId.values()) {
      const existing = byNumber.get(inv.number);
      if (!existing || inv.createdAt > existing.createdAt) {
        byNumber.set(inv.number, inv);
      }
    }
    return [...byNumber.values()].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt)
    );
  }, [user.id, user.name, user.companyName, refreshKey, serverInvoices]);

  return (
    <section className="vauto-dashboard-card rounded-2xl p-4">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--vauto-text-muted)]">
            Apskaita
          </p>
          <h2 className="text-base font-bold text-[var(--vauto-text)]">
            Mokėjimų istorija ir Sąskaitos
          </h2>
        </div>
        <Receipt className="h-5 w-5 text-[var(--vauto-teal)]" />
      </div>

      {invoices.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--vauto-border)] py-8 text-center text-sm text-[var(--vauto-text-muted)]">
          Dar nėra apmokėjimų. Pasirinkite planą ar iškelkite skelbimą — sąskaita
          sugeneruojama automatiškai.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--vauto-border)] text-xs uppercase tracking-wide text-[var(--vauto-text-muted)]">
                <th className="pb-2 pr-3 font-semibold">Nr.</th>
                <th className="pb-2 pr-3 font-semibold">Data</th>
                <th className="pb-2 pr-3 font-semibold">Paslauga</th>
                <th className="pb-2 pr-3 font-semibold text-right">Suma</th>
                <th className="pb-2 font-semibold text-right">Veiksmai</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr
                  key={inv.id}
                  className="border-b border-[var(--vauto-border)]/60 last:border-0"
                >
                  <td className="py-3 pr-3 font-mono text-xs text-[var(--vauto-text)]">
                    {inv.number}
                  </td>
                  <td className="py-3 pr-3 text-[var(--vauto-text-muted)]">
                    {formatInvoiceDate(inv.createdAt)}
                  </td>
                  <td className="py-3 pr-3 text-[var(--vauto-text)]">{inv.serviceTitle}</td>
                  <td className="py-3 pr-3 text-right font-semibold text-[var(--vauto-ink)]">
                    {inv.amountGross.toFixed(2)} €
                  </td>
                  <td className="py-3 text-right">
                    <button
                      type="button"
                      onClick={() => setPreview(inv)}
                      className="inline-flex items-center gap-1 rounded-lg border border-[var(--vauto-border)] px-2.5 py-1.5 text-xs font-medium text-[var(--vauto-teal)] hover:bg-[var(--vauto-teal)]/10"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      Sąskaita
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {preview && (
        <InvoicePrintView invoice={preview} onClose={() => setPreview(null)} />
      )}
    </section>
  );
}
