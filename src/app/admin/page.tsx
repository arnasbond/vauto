"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { isSuperAdminUser } from "@/lib/admin-access";

/**
 * /admin index — admins are redirected to Control Center (/profile).
 * Guests / non-admins are masked as 404 by admin/layout.tsx.
 */
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
        Kraunama…
      </div>
    );
  }

  return null;
}
