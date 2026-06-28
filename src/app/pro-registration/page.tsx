"use client";

import Link from "next/link";
import { ArrowLeft, Building2 } from "lucide-react";
import { ProRegistrationForm } from "@/components/profile/ProRegistrationForm";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { useAuth } from "@/context/AuthContext";
import { useVauto } from "@/context/VautoContext";

export default function ProRegistrationPage() {
  const { isAuthenticated, authHydrated } = useAuth();
  const { user } = useVauto();

  if (!authHydrated) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-sm text-[var(--vauto-text-muted)]">
        Kraunama…
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <DashboardShell>
        <p className="py-12 text-center text-sm text-[var(--vauto-text-muted)]">
          Prisijunkite, kad registruotumėte verslo paskyrą.
        </p>
      </DashboardShell>
    );
  }

  if (user.role === "pro") {
    return (
      <DashboardShell>
        <Link
          href="/profile/"
          className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--vauto-text-muted)]"
        >
          <ArrowLeft className="h-4 w-4" />
          Atgal į profilį
        </Link>
        <div className="vauto-dashboard-card rounded-2xl p-6 text-center">
          <p className="text-sm font-semibold text-[var(--vauto-text-main)]">
            Pro paskyra jau aktyvi
          </p>
          <Link
            href="/profile/"
            className="mt-4 inline-block rounded-xl bg-[var(--vauto-primary)] px-4 py-2 text-sm font-semibold text-white"
          >
            Atidaryti profilį
          </Link>
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <Link
        href="/profile/"
        className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--vauto-text-muted)] hover:text-[var(--vauto-text-main)]"
      >
        <ArrowLeft className="h-4 w-4" />
        Atgal
      </Link>

      <div className="vauto-dashboard-card rounded-2xl p-5">
        <div className="mb-5 flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--vauto-accent)_15%,transparent)]">
            <Building2 className="h-5 w-5 text-[var(--vauto-accent)]" />
          </span>
          <div>
            <h1 className="text-lg font-bold text-[var(--vauto-text-main)]">
              VAUTO Verslui
            </h1>
            <p className="text-xs text-[var(--vauto-text-muted)]">
              Pro planai, analitika ir verslo įrankiai visoje Lietuvoje
            </p>
          </div>
        </div>
        <ProRegistrationForm />
      </div>
    </DashboardShell>
  );
}
