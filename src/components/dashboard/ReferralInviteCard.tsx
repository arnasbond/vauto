"use client";

import { useMemo } from "react";
import { Copy, Gift, Share2 } from "lucide-react";
import { useVauto } from "@/context/VautoContext";
import {
  buildReferralUrl,
  getReferralCredits,
  shareReferralInvite,
} from "@/lib/referral";
import { cn } from "@/lib/cn";

export function ReferralInviteCard() {
  const { user, showToast } = useVauto();
  const referralUrl = useMemo(() => buildReferralUrl(user.id), [user.id]);
  const credits = getReferralCredits(user.id);

  const handleShare = async () => {
    const ok = await shareReferralInvite(user);
    showToast(
      ok
        ? "Pakvietimas paruoštas — pasirinkite Messenger, Viber ar SMS"
        : "Nepavyko atidaryti dalijimosi meniu",
      ok ? "success" : "info"
    );
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(referralUrl);
      showToast("Nuoroda nukopijuota", "success");
    } catch {
      showToast("Nepavyko nukopijuoti", "error");
    }
  };

  return (
    <section className="vauto-dashboard-card rounded-2xl border border-[var(--vauto-orange)]/30 bg-[var(--vauto-orange)]/5 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Gift className="h-5 w-5 text-[var(--vauto-orange)]" />
        <div>
          <h3 className="text-sm font-bold text-[var(--vauto-text)]">
            Pakviesk draugą ir gauk TOP iškėlimą nemokamai
          </h3>
          <p className="text-[10px] text-[var(--vauto-text-muted)]">
            Visoje Lietuvoje · 1 pakvietimas = 1 TOP kreditas
            {credits > 0 ? ` · Turite: ${credits}` : ""}
          </p>
        </div>
      </div>

      <div
        className={cn(
          "mb-3 break-all rounded-xl border px-3 py-2 text-[11px]",
          "border-[var(--vauto-border)] bg-[var(--vauto-surface)] text-[var(--vauto-text-muted)]"
        )}
      >
        {referralUrl}
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void handleShare()}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--vauto-orange)] py-2.5 text-sm font-semibold text-white"
        >
          <Share2 className="h-4 w-4" />
          Dalintis
        </button>
        <button
          type="button"
          onClick={() => void handleCopy()}
          className="flex items-center justify-center gap-1 rounded-xl border border-[var(--vauto-border)] px-4 py-2.5 text-sm font-medium text-[var(--vauto-text)]"
          aria-label="Kopijuoti nuorodą"
        >
          <Copy className="h-4 w-4" />
        </button>
      </div>
    </section>
  );
}
