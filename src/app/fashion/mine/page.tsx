"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Legacy route — unified Mano skelbimai dashboard. */
export default function FashionMineRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/mano-skelbimai/");
  }, [router]);

  return (
    <div className="flex min-h-[40vh] items-center justify-center text-sm text-slate-400">
      Nukreipiama…
    </div>
  );
}
