"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useVauto } from "@/context/VautoContext";

export function ProUpgradeNotice() {
  const searchParams = useSearchParams();
  const { user, showToast } = useVauto();
  const shownRef = useRef(false);

  useEffect(() => {
    if (shownRef.current) return;
    if (searchParams.get("upgrade") !== "pro") return;
    shownRef.current = true;

    if (user.role === "pro") {
      showToast("Jūs jau turite Pro paskyrą.", "info");
      return;
    }

    showToast(
      "Pro paskyra suteikia analitiką, matomumo planus ir PPC. Susisiekite su mumis dėl aktyvavimo (demo).",
      "info"
    );
  }, [searchParams, showToast, user.role]);

  return null;
}
