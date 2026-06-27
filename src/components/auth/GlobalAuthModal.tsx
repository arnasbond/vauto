"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import { AuthModal } from "@/components/auth/AuthModal";
import { useAuth } from "@/context/AuthContext";
import { blockNativeClickThrough } from "@/lib/native-click-guard";

/** App-wide login modal — opened when guest tries to publish a listing */
export function GlobalAuthModal() {
  const router = useRouter();
  const pathname = usePathname();
  const {
    authModalOpen,
    closeAuthModal,
    login,
    authRedirectPath,
    clearAuthRedirect,
    isAuthenticated,
    authLoading,
    authError,
    clearAuthError,
  } = useAuth();
  const wasOpen = useRef(false);

  useEffect(() => {
    if (authModalOpen) wasOpen.current = true;
  }, [authModalOpen]);

  useEffect(() => {
    if (!wasOpen.current || !isAuthenticated) return;

    blockNativeClickThrough();

    const path = authRedirectPath;
    const timer = window.setTimeout(() => {
      if (path) {
        const target = path.replace(/\/$/, "") || "/";
        const current = (pathname ?? "/").replace(/\/$/, "") || "/";
        if (target !== current) {
          router.replace(path);
        }
        clearAuthRedirect();
      }
      closeAuthModal();
      wasOpen.current = false;
    }, Capacitor.isNativePlatform() ? 700 : 0);

    return () => window.clearTimeout(timer);
  }, [
    isAuthenticated,
    authRedirectPath,
    clearAuthRedirect,
    closeAuthModal,
    router,
    pathname,
  ]);

  return (
    <AuthModal
      open={authModalOpen}
      loading={authLoading}
      error={authError}
      onClearError={clearAuthError}
      onClose={closeAuthModal}
      onComplete={(data) => void login(data)}
    />
  );
}
