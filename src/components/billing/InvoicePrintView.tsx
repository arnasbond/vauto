"use client";

import { formatInvoiceDate, type VautoInvoice } from "@/lib/invoices";

const SELLER = {
  name: "UAB VAUTO Marketplace",
  code: "305987654",
  vatCode: "LT100098765432",
  address: "Konstitucijos pr. 12, LT-09308 Vilnius",
  email: "saskaitos@vauto.lt",
};

interface InvoicePrintViewProps {
  invoice: VautoInvoice;
  onClose: () => void;
}

export function InvoicePrintView({ invoice, onClose }: InvoicePrintViewProps) {
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-[230] flex items-start justify-center overflow-y-auto bg-black/70 p-4 pt-8 backdrop-blur-sm print:static print:bg-white print:p-0">
      <div className="w-full max-w-2xl">
        <div className="mb-3 flex justify-end gap-2 print:hidden">
          <button
            type="button"
            onClick={handlePrint}
            className="rounded-xl bg-[var(--vauto-teal)] px-4 py-2 text-sm font-semibold text-white"
          >
            Spausdinti / PDF
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-[var(--vauto-border)] bg-[var(--vauto-surface)] px-4 py-2 text-sm text-[var(--vauto-text)]"
          >
            Uždaryti
          </button>
        </div>

        <article
          id="vauto-invoice-print"
          className="rounded-2xl border border-[var(--vauto-border)] bg-white p-8 text-slate-900 shadow-xl print:rounded-none print:border-0 print:shadow-none"
        >
          <header className="mb-8 flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-6">
            <div>
              <p className="text-2xl font-black tracking-tight text-[#0d9488]">VAUTO</p>
              <p className="mt-1 text-sm text-slate-600">{SELLER.name}</p>
              <p className="text-xs text-slate-500">Įm. kodas: {SELLER.code}</p>
              <p className="text-xs text-slate-500">PVM kodas: {SELLER.vatCode}</p>
              <p className="text-xs text-slate-500">{SELLER.address}</p>
            </div>
            <div className="text-right">
              <h1 className="text-xl font-bold uppercase tracking-wide">Sąskaita-faktūra</h1>
              <p className="mt-2 text-lg font-semibold">{invoice.number}</p>
              <p className="text-sm text-slate-600">{formatInvoiceDate(invoice.createdAt)}</p>
            </div>
          </header>

          <section className="mb-8 grid gap-6 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Pirkėjas
              </p>
              <p className="font-semibold">{invoice.buyerName}</p>
              {invoice.buyerCompanyName && (
                <p className="text-sm text-slate-700">{invoice.buyerCompanyName}</p>
              )}
              {invoice.buyerCompanyCode && (
                <p className="text-xs text-slate-500">Įm. kodas: {invoice.buyerCompanyCode}</p>
              )}
              {invoice.buyerVatCode && (
                <p className="text-xs text-slate-500">PVM kodas: {invoice.buyerVatCode}</p>
              )}
              {invoice.buyerEmail && (
                <p className="text-xs text-slate-500">{invoice.buyerEmail}</p>
              )}
            </div>
            <div className="text-sm text-slate-600 sm:text-right">
              <p>Mokėjimo būdas: {invoice.paymentMethod}</p>
              <p>Valiuta: EUR</p>
            </div>
          </section>

          <table className="mb-6 w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="pb-2 pr-4">Paslauga</th>
                <th className="pb-2 text-right">Suma be PVM</th>
                <th className="pb-2 text-right">PVM</th>
                <th className="pb-2 text-right">Viso</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-slate-100">
                <td className="py-3 pr-4">
                  <p className="font-medium">{invoice.serviceTitle}</p>
                  {invoice.serviceDescription && (
                    <p className="text-xs text-slate-500">{invoice.serviceDescription}</p>
                  )}
                </td>
                <td className="py-3 text-right">{invoice.amountNet.toFixed(2)} €</td>
                <td className="py-3 text-right">
                  {invoice.vatAmount.toFixed(2)} € ({Math.round(invoice.vatRate * 100)}%)
                </td>
                <td className="py-3 text-right font-semibold">
                  {invoice.amountGross.toFixed(2)} €
                </td>
              </tr>
            </tbody>
          </table>

          <footer className="flex justify-end border-t border-slate-200 pt-4">
            <div className="w-full max-w-xs space-y-1 text-sm">
              <div className="flex justify-between text-slate-600">
                <span>Suma be PVM</span>
                <span>{invoice.amountNet.toFixed(2)} €</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>PVM ({Math.round(invoice.vatRate * 100)}%)</span>
                <span>{invoice.vatAmount.toFixed(2)} €</span>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-bold">
                <span>Viso mokėti</span>
                <span>{invoice.amountGross.toFixed(2)} €</span>
              </div>
            </div>
          </footer>

          <p className="mt-8 text-center text-[10px] text-slate-400 print:mt-12">
            Dokumentas sugeneruotas automatiškai VAUTO platformoje. Demonstracinis mokėjimas.
          </p>
        </article>
      </div>

      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #vauto-invoice-print,
          #vauto-invoice-print * {
            visibility: visible;
          }
          #vauto-invoice-print {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}
