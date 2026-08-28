"use client";

import { FileSpreadsheet, UploadCloud } from "lucide-react";
import { useState } from "react";

const SAMPLE_XML = `<listing>
  <title>VW Golf 2019</title>
  <price>10900</price>
  <vin>WVWZZZ1KZAW123456</vin>
</listing>`;

export function BulkUploadCard() {
  const [imported, setImported] = useState(false);

  return (
    <section className="vauto-dashboard-card mb-4 rounded-2xl p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--ds-brand-soft)] text-[var(--ds-brand)]">
          <UploadCloud className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--vauto-text-muted)]">
            Bulk Upload / API XML
          </p>
          <h2 className="mt-1 text-base font-bold text-[var(--vauto-text-heading)]">
            Įkelkite 100+ skelbimų vienu veiksmu
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-[var(--vauto-text-muted)]">
            Demo importas imituoja XML/CSV feed iš auto aikštelės, sandėlio ar
            e-shop sistemos. Realus API ingestion gali naudoti tą patį kontraktą.
          </p>
          <pre className="mt-3 max-h-24 overflow-auto rounded-xl bg-black/30 p-3 text-[10px] text-slate-300">
            {SAMPLE_XML}
          </pre>
          <button
            type="button"
            onClick={() => setImported(true)}
            className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-[var(--ds-brand)] px-4 py-2.5 text-xs font-semibold text-[var(--ds-brand-contrast)]"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Testuoti demo importą
          </button>
          {imported && (
            <p className="mt-2 rounded-lg bg-[var(--ds-success-soft)] px-3 py-2 text-xs text-[var(--ds-success)]">
              Demo feed apdorotas: 12 skelbimų paruošta publikavimui, 2 reikalauja VIN patikros.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
