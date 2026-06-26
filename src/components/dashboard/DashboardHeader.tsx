"use client";

import Image from "next/image";
import { Building2, LogOut } from "lucide-react";
import type { UserProfile } from "@/lib/types";

interface DashboardHeaderProps {
  user: UserProfile;
  onLogout: () => void;
}

export function DashboardHeader({ user, onLogout }: DashboardHeaderProps) {
  const isPro = user.role === "pro";

  return (
    <div className="vauto-dashboard-card mb-4 rounded-3xl p-5">
      <div className="flex items-start gap-4">
        <Image
          src={user.avatar}
          alt={user.name}
          width={64}
          height={64}
          className="h-16 w-16 rounded-2xl ring-2 ring-[color-mix(in_srgb,var(--vauto-primary)_40%,transparent)]"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-lg font-bold text-[var(--vauto-text-main)]">
              {user.name}
            </h1>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                isPro
                  ? "bg-[color-mix(in_srgb,var(--vauto-accent)_20%,transparent)] text-[var(--vauto-accent)]"
                  : "bg-[color-mix(in_srgb,var(--vauto-primary)_20%,transparent)] text-[var(--vauto-primary)]"
              }`}
            >
              {isPro ? "Pro" : "Privatus"}
            </span>
          </div>
          <p className="mt-0.5 text-sm text-[var(--vauto-text-muted)]">
            {user.city} · {user.phone}
          </p>
          {isPro && user.businessType && (
            <p className="mt-1 flex items-center gap-1 text-xs text-[var(--vauto-primary)]">
              <Building2 className="h-3 w-3" />
              {user.businessType === "dealer"
                ? "Auto salonas"
                : user.businessType === "services"
                  ? "Paslaugos"
                  : "Verslas"}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="rounded-xl bg-[color-mix(in_srgb,var(--vauto-text-main)_6%,transparent)] p-2.5 text-[var(--vauto-text-muted)] hover:text-[var(--vauto-text-main)]"
          aria-label="Atsijungti"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
