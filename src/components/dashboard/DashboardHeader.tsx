"use client";

import Image from "next/image";
import { Building2, LogOut, User } from "lucide-react";
import type { UserProfile } from "@/lib/types";

interface DashboardHeaderProps {
  user: UserProfile;
  onLogout: () => void;
}

export function DashboardHeader({ user, onLogout }: DashboardHeaderProps) {
  const isPro = user.role === "pro";

  return (
    <div className="vauto-dashboard-card mb-6 rounded-3xl p-5">
      <div className="flex items-start gap-4">
        <Image
          src={user.avatar}
          alt={user.name}
          width={64}
          height={64}
          className="h-16 w-16 rounded-2xl ring-2 ring-[var(--vauto-teal)]/40"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-lg font-bold text-white">{user.name}</h1>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                isPro
                  ? "bg-[var(--vauto-orange)]/20 text-[var(--vauto-orange)]"
                  : "bg-[var(--vauto-teal)]/20 text-[var(--vauto-teal)]"
              }`}
            >
              {isPro ? "Pro" : "Privatus"}
            </span>
          </div>
          <p className="mt-0.5 text-sm text-slate-400">{user.city} · {user.phone}</p>
          {isPro && user.businessType && (
            <p className="mt-1 flex items-center gap-1 text-xs text-teal-300/80">
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
          className="rounded-xl bg-white/5 p-2.5 text-slate-400 hover:bg-white/10 hover:text-white"
          aria-label="Atsijungti"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-4 flex items-center gap-2 rounded-xl bg-[var(--vauto-teal)]/10 px-3 py-2">
        <User className="h-4 w-4 text-[var(--vauto-teal)]" />
        <span className="text-xs text-teal-100/90">
          Valdymo skydelis · Mano skelbimai ir analitika
        </span>
      </div>
    </div>
  );
}
