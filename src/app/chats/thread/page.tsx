import { Suspense } from "react";
import { AppShell } from "@/components/AppShell";
import { ChatThreadFromQuery } from "@/components/ChatThreadView";

function ChatThreadLoader() {
  return (
    <Suspense
      fallback={
        <p className="py-12 text-center text-[var(--vauto-text-muted)]">
          Kraunama...
        </p>
      }
    >
      <ChatThreadFromQuery />
    </Suspense>
  );
}

export default function ChatThreadPage() {
  return (
    <AppShell variant="plain" hideNav>
      <ChatThreadLoader />
    </AppShell>
  );
}
