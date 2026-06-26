"use client";

import { Suspense } from "react";
import { LogIn, MessageCircle } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { ChatThreadFromQuery } from "@/components/ChatThreadView";
import { useAuth } from "@/context/AuthContext";

export default function PokalbiaiPage() {
  const { isAuthenticated, authHydrated, openAuthModal } = useAuth();

  if (!authHydrated) {
    return (
      <AppShell variant="plain">
        <p className="py-16 text-center text-sm text-slate-500">Kraunama…</p>
      </AppShell>
    );
  }

  if (!isAuthenticated) {
    return (
      <AppShell variant="plain">
        <div className="flex min-h-[50dvh] flex-col items-center justify-center px-6 text-center">
          <MessageCircle className="mb-4 h-12 w-12 text-[var(--vauto-teal)]" />
          <h1 className="text-xl font-bold text-slate-900">Pokalbiai</h1>
          <p className="mt-2 text-sm text-slate-600">
            Prisijunkite, kad galėtumėte rašyti pardavėjams ir sekti pokalbius.
          </p>
          <button
            type="button"
            onClick={() => openAuthModal("/pokalbiai")}
            className="mt-6 flex items-center gap-2 rounded-2xl bg-[var(--vauto-teal)] px-6 py-3 text-sm font-semibold text-white"
          >
            <LogIn className="h-4 w-4" />
            Prisijungti
          </button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell variant="plain">
      <Suspense
        fallback={
          <p className="py-12 text-center text-sm text-[var(--vauto-text-muted)]">
            Kraunamas pokalbis…
          </p>
        }
      >
        <ChatThreadFromQuery />
      </Suspense>
    </AppShell>
  );
}
