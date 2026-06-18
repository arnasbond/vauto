"use client";

import { ShieldCheck } from "lucide-react";
import { useState } from "react";
import { EscrowModal } from "@/components/EscrowModal";

export function EscrowActionBlock({ amount }: { amount: number }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="mx-2 my-3 rounded-2xl border border-[var(--vauto-blue)]/20 bg-[var(--vauto-blue)]/5 p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--vauto-blue)]/15">
            <ShieldCheck className="h-5 w-5 text-[var(--vauto-blue)]" />
          </div>
          <div>
            <p className="text-xs font-medium text-[var(--vauto-blue)]">
              AI Asistentas
            </p>
            <p className="mt-1 text-sm text-[var(--vauto-text)]">
              Atrodo, kad susitarėte dėl sandorio.{" "}
              <button
                type="button"
                className="font-semibold text-[var(--vauto-orange)] underline underline-offset-2"
                onClick={() => setOpen(true)}
              >
                Spauskite čia, kad sumokėtumėte saugiai ir gautumėte siuntos
                lipduką
              </button>
            </p>
          </div>
        </div>
      </div>
      {open && <EscrowModal amount={amount} onClose={() => setOpen(false)} />}
    </>
  );
}
