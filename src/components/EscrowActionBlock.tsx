"use client";

import { CheckCircle2, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { EscrowModal } from "@/components/EscrowModal";
import { useVauto } from "@/context/VautoContext";
import type { ChatThread } from "@/lib/types";

export function EscrowActionBlock({
  chat,
  amount,
}: {
  chat: ChatThread;
  amount: number;
}) {
  const { updateEscrow } = useVauto();
  const [open, setOpen] = useState(false);
  const escrow = chat.escrow;

  if (escrow?.status === "completed") {
    return (
      <div className="mx-2 my-3 flex items-center gap-2 rounded-2xl border border-green-200 bg-green-50 p-4">
        <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" />
        <div>
          <p className="text-sm font-medium text-green-800">
            Escrow sandoris užbaigtas
          </p>
          {escrow.trackingCode && (
            <p className="font-mono text-xs text-green-700">
              {escrow.trackingCode}
            </p>
          )}
        </div>
      </div>
    );
  }

  const inProgress =
    escrow &&
    ["paying", "paid", "label_sent"].includes(escrow.status);

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
              {inProgress ? (
                <>
                  Escrow procesas vyksta.{" "}
                  <button
                    type="button"
                    className="font-semibold text-[var(--vauto-orange)] underline underline-offset-2"
                    onClick={() => setOpen(true)}
                  >
                    Tęsti mokėjimą
                  </button>
                </>
              ) : (
                <>
                  Atrodo, kad susitarėte dėl sandorio.{" "}
                  <button
                    type="button"
                    className="font-semibold text-[var(--vauto-orange)] underline underline-offset-2"
                    onClick={() => setOpen(true)}
                  >
                    Spauskite čia, kad sumokėtumėte saugiai ir gautumėte siuntos
                    lipduką
                  </button>
                </>
              )}
            </p>
          </div>
        </div>
      </div>
      {open && (
        <EscrowModal
          chat={chat}
          amount={amount}
          escrow={escrow}
          onClose={() => setOpen(false)}
          onUpdate={(e) => updateEscrow(chat.id, e)}
        />
      )}
    </>
  );
}
