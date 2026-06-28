"use client";

import { Building2, UserRound } from "lucide-react";
import { useProfileViewMode } from "@/lib/profile-view";

export function ProfileProViewToggle() {
  const { viewMode, setViewMode } = useProfileViewMode(true);

  return (
    <div className="mb-4 grid grid-cols-2 gap-2 rounded-2xl border border-[var(--vauto-border)] bg-[var(--vauto-card-bg)] p-1">
      <button
        type="button"
        onClick={() => setViewMode("private")}
        className={`flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-semibold transition ${
          viewMode === "private"
            ? "bg-[var(--vauto-card-bg)] text-[var(--vauto-primary)] shadow-sm"
            : "text-[var(--vauto-text-muted)]"
        }`}
      >
        <UserRound className="h-3.5 w-3.5" />
        Privatus
      </button>
      <button
        type="button"
        onClick={() => setViewMode("business")}
        className={`flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-semibold transition ${
          viewMode === "business"
            ? "bg-[var(--vauto-card-bg)] text-[var(--vauto-accent)] shadow-sm"
            : "text-[var(--vauto-text-muted)]"
        }`}
      >
        <Building2 className="h-3.5 w-3.5" />
        Verslas
      </button>
    </div>
  );
}
