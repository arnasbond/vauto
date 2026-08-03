"use client";

import { ScanFace } from "lucide-react";
import type { MagicMirrorFit } from "@/lib/magic-mirror";

/** Clothing fit banner — brand VAUTO tokens (no indigo AI-slop). */
export function MagicMirrorChatBanner({ fit }: { fit: MagicMirrorFit }) {
  return (
    <div className="mx-2 my-2 rounded-2xl border border-[var(--vauto-border)] bg-[color-mix(in_srgb,var(--vauto-primary)_8%,var(--vauto-surface))] p-3">
      <div className="flex items-start gap-2.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--vauto-surface)] text-[var(--vauto-primary)] shadow-sm">
          <ScanFace className="h-4 w-4" />
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--vauto-primary)]">
            Dydžio atitikimas · {fit.fitScore}%
          </p>
          <p className="mt-1 text-xs leading-relaxed text-[var(--vauto-text)]">
            {fit.recommendation}
          </p>
        </div>
      </div>
    </div>
  );
}
