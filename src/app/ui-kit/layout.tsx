"use client";

import { useEffect, useState } from "react";
import { AdminMaskedNotFound } from "@/components/admin/AdminMaskedNotFound";
import { useAuth } from "@/context/AuthContext";
import { isSuperAdminUser } from "@/lib/admin-access";

function readDevHost(): boolean {
  if (typeof window === "undefined") {
    return process.env.NEXT_PUBLIC_UI_KIT === "1";
  }
  const h = window.location.hostname;
  return (
    h === "localhost" ||
    h === "127.0.0.1" ||
    h.endsWith(".local") ||
    process.env.NEXT_PUBLIC_UI_KIT === "1"
  );
}

/**
 * /ui-kit — Design System 2.0 showcase.
 * Access: localhost/dev flag OR Control Center super-admin.
 * Guests / normal users see the same masked 404 as /admin.
 */
export default function UiKitLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, authHydrated, isAuthenticated } = useAuth();
  const [devHost, setDevHost] = useState(
    () =>
      typeof window === "undefined"
        ? process.env.NEXT_PUBLIC_UI_KIT === "1"
        : readDevHost()
  );

  useEffect(() => {
    setDevHost(readDevHost());
  }, []);

  if (devHost) return children;

  if (!authHydrated) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-sm text-[var(--ds-text-muted,#64748b)]">
        Kraunama…
      </div>
    );
  }

  if (!isAuthenticated || !isSuperAdminUser(user)) {
    return <AdminMaskedNotFound />;
  }

  return children;
}
