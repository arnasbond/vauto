"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AdminIndexPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/profile/?tab=moderation");
  }, [router]);

  return (
    <div className="flex min-h-dvh items-center justify-center text-sm text-slate-500">
      Nukreipiama į VAUTO Control Center…
    </div>
  );
}
