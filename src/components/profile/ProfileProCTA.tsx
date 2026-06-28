"use client";

import Link from "next/link";
import { Building2, ChevronRight } from "lucide-react";

export function ProfileProCTA() {
  return (
    <Link
      href="/pro-registration/"
      className="mb-4 flex items-center gap-3 rounded-2xl border border-[var(--vauto-border)] bg-[var(--vauto-card-bg)] px-4 py-3.5 transition hover:bg-[color-mix(in_srgb,var(--vauto-primary)_5%,transparent)]"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--vauto-accent)_15%,transparent)]">
        <Building2 className="h-5 w-5 text-[var(--vauto-accent)]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-[var(--vauto-text-main)]">
          VAUTO Verslui
        </span>
        <span className="block text-xs text-[var(--vauto-text-muted)]">
          Pro planai, analitika ir verslo įrankiai
        </span>
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-[var(--vauto-text-muted)]" />
    </Link>
  );
}
