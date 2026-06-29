"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import {
  defaultCabinetPath,
  needsProfileTypeSelection,
} from "@/lib/profile-type";

const AUTH_ONLY_PATHS = ["/registracija", "/auth-gate"] as const;

function normalizePath(path: string): string {
  const trimmed = path.replace(/\/$/, "");
  return trimmed || "/";
}

function isAuthOnlyPath(pathname: string | null): boolean {
  if (!pathname) return false;
  const normalized = normalizePath(pathname);
  return AUTH_ONLY_PATHS.some((p) => normalized === p);
}

/** Redirects authenticated users; profile type selection stays on /auth-gate. */
export function SessionAutoLoginGuard() {
  const router = useRouter();
  const pathname = usePathname();
  const { authHydrated, isAuthenticated, authModalOpen, closeAuthModal, user } =
    useAuth();

  useEffect(() => {
    if (!authHydrated || !isAuthenticated) return;

    if (authModalOpen) {
      closeAuthModal();
    }

    if (needsProfileTypeSelection(user)) {
      if (normalizePath(pathname ?? "") !== "/auth-gate") {
        router.replace("/auth-gate/");
      }
      return;
    }

    if (isAuthOnlyPath(pathname)) {
      router.replace(defaultCabinetPath(user.profileType));
    }
  }, [
    authHydrated,
    isAuthenticated,
    authModalOpen,
    closeAuthModal,
    pathname,
    router,
    user,
  ]);

  return null;
}
