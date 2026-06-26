"use client";

import { Suspense } from "react";
import { AppShell } from "@/components/AppShell";
import { ChatThreadFromQuery } from "@/components/ChatThreadView";

export default function PokalbiaiPage() {
  return (
    <AppShell variant="plain">
      <Suspense
        fallback={
          <p className="py-12 text-center text-sm text-[var(--vauto-text-muted)]">
            Kraunamas pokalbis…
          </p>
        }
      >
        <ChatThreadFromQuery />
      </Suspense>
    </AppShell>
  );
}
