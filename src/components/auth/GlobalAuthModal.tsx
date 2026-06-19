"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { AuthModal } from "@/components/auth/AuthModal";
import { useAuth } from "@/context/AuthContext";

/** App-wide login modal — opened when guest tries to publish a listing */
export function GlobalAuthModal() {
  const router = useRouter();
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
    const path = authRedirectPath;
    if (path) {
      router.push(path);
      clearAuthRedirect();
    }
    closeAuthModal();
    wasOpen.current = false;
  }, [
    isAuthenticated,
    authRedirectPath,
    clearAuthRedirect,
    closeAuthModal,
    router,
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
