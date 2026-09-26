"use client";

import { useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { VautoAdaptiveLayout } from "@/components/layout/VautoAdaptiveLayout";

function PokalbiaiRedirectContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const threadId = searchParams.get("thread") || searchParams.get("id");
    const q = searchParams.toString();
    const target = threadId ? `/chats/${threadId}` : q ? `/chats?${q}` : "/chats";
    router.replace(target);
  }, [router, searchParams]);

  return (
    <VautoAdaptiveLayout variant="plain">
      <p className="py-16 text-center text-sm text-[var(--vauto-text-muted)]">Perkeliama į VAUTO pokalbius…</p>
    </VautoAdaptiveLayout>
  );
}

export default function PokalbiaiPage() {
  return (
    <Suspense
      fallback={
        <VautoAdaptiveLayout variant="plain">
          <p className="py-16 text-center text-sm text-[var(--vauto-text-muted)]">Kraunama…</p>
        </VautoAdaptiveLayout>
      }
    >
      <PokalbiaiRedirectContent />
    </Suspense>
  );
}
