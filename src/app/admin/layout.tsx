"use client";

import { useEffect } from "react";
import Link from "next/link";
import { LogIn, ShieldOff } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { isSuperAdminUser } from "@/lib/admin-access";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, authHydrated, isAuthenticated, openAuthModal } = useAuth();

  useEffect(() => {
    if (authHydrated && !isAuthenticated) {
      openAuthModal("/admin");
    }
  }, [authHydrated, isAuthenticated, openAuthModal]);

  if (!authHydrated) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-sm text-slate-500">
        Kraunama…
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-[var(--vauto-bg,#f8fafc)] px-6 pb-24">
        <div className="vauto-dashboard-card max-w-sm rounded-3xl p-8 text-center">
          <h1 className="text-lg font-bold text-slate-900">Control Center</h1>
          <p className="mt-2 text-sm text-slate-500">
            Prisijunkite kaip administratorius
          </p>
          <button
            type="button"
            onClick={() => openAuthModal("/admin")}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-red-600 py-3.5 text-sm font-semibold text-white"
          >
            <LogIn className="h-4 w-4" />
            Administratoriaus įėjimas
          </button>
          <Link
            href="/"
            className="mt-3 block text-xs text-slate-500 underline"
          >
            Grįžti į pradžią
          </Link>
        </div>
      </div>
    );
  }

  if (!isSuperAdminUser(user)) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-[var(--vauto-bg,#f8fafc)] px-6 pb-24">
        <div className="vauto-dashboard-card max-w-sm rounded-3xl p-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-red-600">
            <ShieldOff className="h-7 w-7" />
          </div>
          <h1 className="text-lg font-bold text-slate-900">Prieiga uždrausta</h1>
          <p className="mt-2 text-sm text-slate-500">
            Neturite administratoriaus teisių
          </p>
          <Link
            href="/profile/"
            className="mt-6 inline-flex items-center justify-center rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white"
          >
            Į profilį
          </Link>
        </div>
      </div>
    );
  }

  return children;
}
