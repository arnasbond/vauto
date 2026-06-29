"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

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

function resolvePostLoginPath(pathname: string | null): string {
  if (pathname && normalizePath(pathname) === "/auth-gate") {
    return "/fashion/mine/";
  }
  return "/fashion/mine/";
}

/** Redirects authenticated users away from registration/auth-gate screens after session hydration. */
export function SessionAutoLoginGuard() {
  const router = useRouter();
  const pathname = usePathname();
  const { authHydrated, isAuthenticated, authModalOpen, closeAuthModal } = useAuth();

  useEffect(() => {
    if (!authHydrated || !isAuthenticated) return;

    if (authModalOpen) {
      closeAuthModal();
    }

    if (isAuthOnlyPath(pathname)) {
      router.replace(resolvePostLoginPath(pathname));
    }
  }, [
    authHydrated,
    isAuthenticated,
    authModalOpen,
    closeAuthModal,
    pathname,
    router,
  ]);

  return null;
}
