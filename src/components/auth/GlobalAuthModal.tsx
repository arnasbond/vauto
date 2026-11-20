"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
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
    authHydrated,
    authLoading,
    authError,
    clearAuthError,
  } = useAuth();
  const wasOpen = useRef(false);
  const [modalKey, setModalKey] = useState(0);

  useEffect(() => {
    if (authModalOpen) {
      wasOpen.current = true;
      setModalKey((key) => key + 1);
    }
  }, [authModalOpen]);

  useEffect(() => {
    if (!wasOpen.current || !isAuthenticated) return;

    blockNativeClickThrough(1500);

    // Close immediately on native so authenticated profile (install links) cannot receive ghost taps.
    closeAuthModal();
    wasOpen.current = false;

    const path = authRedirectPath;
    if (path) {
      // R5 final — the manual listing entry lands on the STANDALONE /add form,
      // never on the AI chat. Legacy `manual=1` redirects also go to /add.
      const isManualListingEntry = path.includes("manual=1");
      const redirectTo = isManualListingEntry ? "/add" : path;
      const target = redirectTo.replace(/\/$/, "") || "/";
      const current = (pathname ?? "/").replace(/\/$/, "") || "/";
      if (target !== current) {
        router.replace(redirectTo);
      }
      clearAuthRedirect();
    }
  }, [
    isAuthenticated,
    authRedirectPath,
    clearAuthRedirect,
    closeAuthModal,
    router,
    pathname,
  ]);

  const returnPath = authRedirectPath ?? pathname ?? "/";

  return (
    <AuthModal
      key={modalKey}
      open={authModalOpen && authHydrated && !isAuthenticated}
      loading={authLoading}
      error={authError}
      onClearError={clearAuthError}
      onClose={closeAuthModal}
      returnPath={returnPath}
      onComplete={(data) => void login(data)}
    />
  );
}
