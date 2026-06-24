"use client";

import { useState } from "react";
import { Plus, Wallet } from "lucide-react";

interface VautoWalletProps {
  balance: number;
  onTopUp: (amount: number) => void;
  /** When true, top-up credits balance without card charge (staging/demo). */
  demoTopUp?: boolean;
}

export function VautoWallet({ balance, onTopUp, demoTopUp }: VautoWalletProps) {
  const [topping, setTopping] = useState(false);

  const handleTopUp = () => {
    setTopping(true);
    setTimeout(() => {
      onTopUp(10);
      setTopping(false);
    }, 1200);
  };

  return (
    <div className="vauto-dashboard-card mb-4 overflow-hidden rounded-2xl p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--vauto-teal)]/20">
            <Wallet className="h-5 w-5 text-[var(--vauto-teal)]" />
          </div>
          <div>
            <p className="text-xs text-slate-400">VAUTO Pro balansas</p>
            <p className="text-2xl font-bold text-white">
              {balance.toFixed(2)} <span className="text-sm font-normal text-slate-400">€</span>
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleTopUp}
          disabled={topping}
          className="flex items-center gap-1.5 rounded-xl bg-[var(--vauto-teal)] px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-60"
        >
          {topping ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          Papildyti
        </button>
      </div>
      <p className="mt-3 text-[10px] text-slate-500">
        {demoTopUp
          ? "Demo papildymas — kreditas be kortelės (staging). Tikram mokėjimui bus Stripe."
          : "Naudokite PPC paspaudimams, skambučiams ir išmaniesiems reklamavimams."}
      </p>
    </div>
  );
}
