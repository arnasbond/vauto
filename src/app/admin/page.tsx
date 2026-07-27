"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { isSuperAdminUser } from "@/lib/admin-access";

/** Guests stay on /admin (layout opens admin login). Super-admins go to Control Center. */
export default function AdminIndexPage() {
  const router = useRouter();
  const { user, authHydrated, isAuthenticated } = useAuth();

  useEffect(() => {
    if (!authHydrated) return;
    if (isAuthenticated && isSuperAdminUser(user)) {
      router.replace("/profile/?tab=moderation");
    }
  }, [authHydrated, isAuthenticated, user, router]);

  if (!authHydrated) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-sm text-slate-500">
        Kraunama…
      </div>
    );
  }

  if (isAuthenticated && isSuperAdminUser(user)) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-sm text-slate-500">
        Nukreipiama į VAUTO Control Center…
      </div>
    );
  }

  return null;
}
