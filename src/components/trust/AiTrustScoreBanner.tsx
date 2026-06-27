"use client";

import { ShieldCheck, Sparkles } from "lucide-react";
import type { UserTrustProfile } from "@/lib/user-trust-score";

export function AiTrustScoreBanner({ profile }: { profile: UserTrustProfile }) {
  return (
    <div className="mx-2 my-2 rounded-2xl border border-violet-200 bg-gradient-to-r from-violet-50 to-fuchsia-50 p-3 dark:border-violet-800 dark:from-violet-950/40 dark:to-fuchsia-950/30">
      <div className="flex items-start gap-2.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-violet-600 shadow-sm dark:bg-violet-950">
          <ShieldCheck className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-violet-700 dark:text-violet-300">
            <Sparkles className="h-3 w-3" />
            AI pasitikėjimo pasas
          </p>
          <p className="mt-1 text-xs leading-relaxed text-violet-950 dark:text-violet-100">
            {profile.recommendation}
          </p>
          <p className="mt-1.5 text-[10px] text-violet-600 dark:text-violet-400">
            Balas: {profile.score}% · Atsiliepimai {profile.reviewScore}% · Siuntimas{" "}
            {profile.shippingScore}%
          </p>
        </div>
      </div>
    </div>
  );
}
