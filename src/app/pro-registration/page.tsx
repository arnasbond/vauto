"use client";

import { useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { VautoAdaptiveLayout } from "@/components/layout/VautoAdaptiveLayout";

function ProRegistrationRedirectContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const q = searchParams.toString();
    const target = q ? `/verslui?${q}` : "/verslui";
    router.replace(target);
  }, [router, searchParams]);

  return (
    <VautoAdaptiveLayout variant="plain">
      <p className="py-16 text-center text-sm text-[var(--vauto-text-muted)]">Perkeliama į VAUTO Verslui…</p>
    </VautoAdaptiveLayout>
  );
}

export default function ProRegistrationPage() {
  return (
    <Suspense
      fallback={
        <VautoAdaptiveLayout variant="plain">
          <p className="py-16 text-center text-sm text-[var(--vauto-text-muted)]">Kraunama…</p>
        </VautoAdaptiveLayout>
      }
    >
      <ProRegistrationRedirectContent />
    </Suspense>
  );
}
