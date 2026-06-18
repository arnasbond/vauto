import { Suspense } from "react";
import { ListingDetailPage } from "@/components/ListingDetailPage";

export default function ListingPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50dvh] items-center justify-center text-sm text-[var(--vauto-text-muted)]">
          Kraunama...
        </div>
      }
    >
      <ListingDetailPage />
    </Suspense>
  );
}
