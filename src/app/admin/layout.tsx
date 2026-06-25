"use client";

import { notFound } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { isSuperAdminUser } from "@/lib/admin-access";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, authHydrated, isAuthenticated } = useAuth();

  if (!authHydrated) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-sm text-slate-500">
        Kraunama…
      </div>
    );
  }

  if (!isAuthenticated || !isSuperAdminUser(user)) {
    notFound();
  }

  return children;
}
