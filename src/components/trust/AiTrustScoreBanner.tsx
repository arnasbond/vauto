"use client";

import { ShieldCheck, Sparkles } from "lucide-react";
import type { UserTrustProfile } from "@/lib/user-trust-score";

export function AiTrustScoreBanner({ profile }: { profile: UserTrustProfile }) {
  return (
    <div className="mx-2 my-2 rounded-2xl border border-[var(--ds-ai)]/25 bg-[var(--ds-ai-soft)] p-3">
      <div className="flex items-start gap-2.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--ds-surface-card)] text-[var(--ds-ai)] shadow-sm">
          <ShieldCheck className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-[var(--ds-ai-strong)]">
            <Sparkles className="h-3 w-3" />
            AI pasitikėjimo pasas
          </p>
          <p className="mt-1 text-xs leading-relaxed text-[var(--ds-text-primary)]">
            {profile.recommendation}
          </p>
          <p className="mt-1.5 text-[10px] text-[var(--ds-text-secondary)]">
            Balas: {profile.score}% · Atsiliepimai {profile.reviewScore}% · Siuntimas{" "}
            {profile.shippingScore}%
          </p>
        </div>
      </div>
    </div>
  );
}
