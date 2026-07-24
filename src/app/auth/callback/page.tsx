"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  loadOAuthLaunchContext,
  storeOAuthCallbackPayload,
} from "@/lib/auth/oauth-redirect";

/**
 * OAuth return landing (Apple fragment / Google query).
 * Stores the pending identity token + first-login Apple name in sessionStorage,
 * then returns to the seller/buyer path that opened auth (or home).
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const [message, setMessage] = useState("Prisijungiama…");

  useEffect(() => {
    const ctx = loadOAuthLaunchContext();
    const returnPath = ctx?.returnPath?.trim() || "/";
    const payload = storeOAuthCallbackPayload(window.location.href);

    if (!payload?.idToken) {
      setMessage("Nepavyko užbaigti prisijungimo. Grįžtame…");
      const t = window.setTimeout(() => {
        router.replace(returnPath.startsWith("/") ? returnPath : "/");
      }, 900);
      return () => window.clearTimeout(t);
    }

    // Strip OAuth params from the address bar before navigating back into chat.
    try {
      window.history.replaceState({}, "", "/auth/callback/");
    } catch {
      /* ignore */
    }

    router.replace(returnPath.startsWith("/") ? returnPath : "/");
  }, [router]);

  return (
    <main className="flex min-h-[50vh] flex-col items-center justify-center gap-2 px-6 text-center">
      <p className="text-sm font-medium text-slate-700">{message}</p>
      <p className="text-xs text-slate-500">
        Palaukite, nukreipiame atgal į VAUTO.
      </p>
    </main>
  );
}
