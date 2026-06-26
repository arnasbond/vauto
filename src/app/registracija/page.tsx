"use client";

import { useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Gift, LogIn } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Header } from "@/components/Header";
import { useAuth } from "@/context/AuthContext";
import { storePendingReferral } from "@/lib/referral";

function RegistracijaContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { openAuthModal, isAuthenticated, authHydrated } = useAuth();

  useEffect(() => {
    const ref = searchParams.get("ref");
    if (ref) storePendingReferral(ref);
  }, [searchParams]);

  useEffect(() => {
    if (!authHydrated) return;
    if (isAuthenticated) {
      router.replace("/profile/");
    }
  }, [authHydrated, isAuthenticated, router]);

  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center px-2 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--vauto-orange)]/15">
        <Gift className="h-8 w-8 text-[var(--vauto-orange)]" />
      </div>
      <h1 className="text-2xl font-bold text-[var(--vauto-text)]">Prisijunk prie VAUTO</h1>
      <p className="mt-2 max-w-sm text-sm text-[var(--vauto-text-muted)]">
        Nacionalinė skelbimų ekosistema visoje Lietuvoje. Pakvietėte draugą? Užsiregistravę
        gausite bonusą — TOP iškėlimą nemokamai.
      </p>
      <button
        type="button"
        onClick={() => openAuthModal("/profile")}
        className="mt-6 flex items-center gap-2 rounded-2xl bg-[var(--vauto-teal)] px-8 py-3.5 text-sm font-semibold text-white"
      >
        <LogIn className="h-4 w-4" />
        Registruotis / Prisijungti
      </button>
    </div>
  );
}

export default function RegistracijaPage() {
  return (
    <AppShell variant="plain">
      <Header />
      <Suspense fallback={<p className="py-16 text-center text-sm text-slate-500">Kraunama…</p>}>
        <RegistracijaContent />
      </Suspense>
    </AppShell>
  );
}
