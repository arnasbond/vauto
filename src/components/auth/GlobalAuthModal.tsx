"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { AuthModal } from "@/components/auth/AuthModal";
import { useVauto } from "@/context/VautoContext";

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
  } = useVauto();
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
      onClose={closeAuthModal}
      onComplete={(data) => login(data)}
    />
  );
}
