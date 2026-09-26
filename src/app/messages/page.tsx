"use client";

import { useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { VautoAdaptiveLayout } from "@/components/layout/VautoAdaptiveLayout";

function MessagesRedirectContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const q = searchParams.toString();
    const target = q ? `/chats?${q}` : "/chats";
    router.replace(target);
  }, [router, searchParams]);

  return (
    <VautoAdaptiveLayout variant="plain">
      <p className="py-16 text-center text-sm text-[var(--vauto-text-muted)]">Perkeliama į VAUTO pokalbius…</p>
    </VautoAdaptiveLayout>
  );
}

export default function MessagesRedirectPage() {
  return (
    <Suspense
      fallback={
        <VautoAdaptiveLayout variant="plain">
          <p className="py-16 text-center text-sm text-[var(--vauto-text-muted)]">Kraunama…</p>
        </VautoAdaptiveLayout>
      }
    >
      <MessagesRedirectContent />
    </Suspense>
  );
}
