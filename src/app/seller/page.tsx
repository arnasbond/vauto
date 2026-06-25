"use client";

import { Suspense } from "react";
import { SellerProfilePage } from "@/components/SellerProfilePage";

export default function SellerQueryPage() {
  return (
    <Suspense
      fallback={
        <p className="py-12 text-center text-slate-500">Kraunama...</p>
      }
    >
      <SellerProfilePage />
    </Suspense>
  );
}
