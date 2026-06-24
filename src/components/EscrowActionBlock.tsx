"use client";

import { CheckCircle2, PackageCheck, ShieldCheck, Truck } from "lucide-react";
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
    ["paying", "paid", "label_sent", "shipped", "delivered"].includes(escrow.status);

  const statusLabel =
    escrow?.status === "paying"
      ? "Mokėjimas vyksta"
      : escrow?.status === "paid"
        ? "Apmokėta — rinkitės siuntimą"
        : escrow?.status === "label_sent"
          ? "QR lipdukas paruoštas"
          : escrow?.status === "shipped"
            ? "Siunta išsiųsta"
            : escrow?.status === "delivered"
              ? "Siunta pristatyta"
              : "Saugus pirkimas";

  return (
    <>
      <div className="mx-2 my-3 rounded-2xl border border-[#bfdbfe] bg-[#eef6ff] p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-[#1167b1] shadow-sm">
            {escrow?.status === "label_sent" || escrow?.status === "shipped" ? (
              <Truck className="h-5 w-5" />
            ) : escrow?.status === "delivered" ? (
              <PackageCheck className="h-5 w-5" />
            ) : (
              <ShieldCheck className="h-5 w-5" />
            )}
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-[#1167b1]">
              {statusLabel}
              <span className="ml-2 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-800">
                Demo
              </span>
            </p>
            <p className="mt-1 text-sm text-[#374151]">
              {inProgress ? (
                <>
                  Mokėjimo / siuntos procesas vyksta.{" "}
                  <button
                    type="button"
                    className="font-semibold text-[#f97316] underline underline-offset-2"
                    onClick={() => setOpen(true)}
                  >
                    Atidaryti būseną
                  </button>
                </>
              ) : (
                <>
                  Atrodo, kad susitarėte dėl sandorio.{" "}
                  <button
                    type="button"
                    className="font-semibold text-[#f97316] underline underline-offset-2"
                    onClick={() => setOpen(true)}
                  >
                    Pirkti saugiai: bankinis mokėjimas + paštomato QR
                  </button>
                </>
              )}
            </p>
            {escrow?.trackingCode && (
              <p className="mt-2 font-mono text-xs text-[#1167b1]">
                {escrow.trackingCode}
              </p>
            )}
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
