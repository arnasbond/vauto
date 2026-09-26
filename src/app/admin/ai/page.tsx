"use client";

import { useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";

function AdminAiRedirectContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const q = searchParams.toString();
    const target = q ? `/admin?${q}` : "/admin";
    router.replace(target);
  }, [router, searchParams]);

  return (
    <AppShell variant="plain" hideNav>
      <p className="py-16 text-center text-sm text-[var(--vauto-text-muted)]">Perkeliama į administraciją…</p>
    </AppShell>
  );
}

export default function AdminAiPage() {
  return (
    <Suspense
      fallback={
        <AppShell variant="plain" hideNav>
          <p className="py-16 text-center text-sm text-[var(--vauto-text-muted)]">Kraunama…</p>
        </AppShell>
      }
    >
      <AdminAiRedirectContent />
    </Suspense>
  );
}
