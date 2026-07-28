"use client";

import { isSuperAdminUser } from "@/lib/admin-access";
import { AdminMaskedNotFound } from "@/components/admin/AdminMaskedNotFound";
import { useAuth } from "@/context/AuthContext";

/**
 * /admin layout — zero-footprint + 404 masking.
 * Non-admins (and guests) see a generic 404; no Control Center login chrome,
 * no “Prieiga uždrausta”, and no auth modal that would advertise the route.
 */
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
    return <AdminMaskedNotFound />;
  }

  return children;
}
