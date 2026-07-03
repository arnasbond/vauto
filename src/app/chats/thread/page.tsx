import { Suspense } from "react";
import { VautoAdaptiveLayout } from "@/components/layout/VautoAdaptiveLayout";
import { ChatThreadFromQuery } from "@/components/ChatThreadView";

function ChatThreadLoader() {
  return (
    <Suspense
      fallback={
        <p className="py-12 text-center text-slate-500">
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
    <VautoAdaptiveLayout variant="plain" hideNav>
      <ChatThreadLoader />
    </VautoAdaptiveLayout>
  );
}
