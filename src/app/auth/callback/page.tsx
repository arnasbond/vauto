"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { storeOAuthCallbackPayload } from "@/lib/auth/oauth-redirect";

/** OAuth return landing — stores token in sessionStorage and returns to app shell. */
export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    storeOAuthCallbackPayload(window.location.href);
    router.replace("/");
  }, [router]);

  return (
    <main className="flex min-h-[50vh] flex-col items-center justify-center gap-2 px-6 text-center">
      <p className="text-sm font-medium text-slate-700">Prisijungiama…</p>
      <p className="text-xs text-slate-500">Palaukite, nukreipiame atgal į VAUTO.</p>
    </main>
  );
}
