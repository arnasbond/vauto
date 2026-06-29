"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LogIn, Shirt, Sparkles } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useVauto } from "@/context/VautoContext";

export default function AuthGatePage() {
  const router = useRouter();
  const { authHydrated, isAuthenticated, openAuthModal } = useVauto();

  useEffect(() => {
    if (authHydrated && isAuthenticated) {
      router.replace("/fashion/mine/");
    }
  }, [authHydrated, isAuthenticated, router]);

  return (
    <AppShell variant="plain">
      <div className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center px-6 text-center">
        <span className="mb-5 flex h-16 w-16 items-center justify-center rounded-3xl bg-fuchsia-600 text-white shadow-lg">
          <Shirt className="h-8 w-8" />
        </span>
        <h1 className="text-xl font-semibold text-white">Mano Spinta — tik registruotiems</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-400">
          Susikurk paskyrą ir valdyk savo drabužių spintą su AI importu, sinchronizacija ir
          saugiu pardavimu per VAUTO.
        </p>
        <button
          type="button"
          onClick={() => openAuthModal("/fashion/mine/")}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-fuchsia-600 py-3.5 text-sm font-semibold text-white shadow-md hover:bg-fuchsia-500"
        >
          <LogIn className="h-4 w-4" />
          Registruotis / Prisijungti
        </button>
        <Link
          href="/fashion/"
          className="mt-4 inline-flex items-center gap-1.5 text-sm text-fuchsia-300 hover:text-fuchsia-200"
        >
          <Sparkles className="h-4 w-4" />
          Tęsti kaip svečias (demo)
        </Link>
      </div>
    </AppShell>
  );
}
