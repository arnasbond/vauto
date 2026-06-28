"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useUserBehavior } from "@/context/UserBehaviorContext";
import { pathToView } from "@/lib/app-views";

/** Tracks pathname changes into UserBehaviorContext. */
export function UserBehaviorNavigationTracker() {
  const pathname = usePathname();
  const { trackEvent } = useUserBehavior();
  const lastPathRef = useRef<string | null>(null);

  useEffect(() => {
    const path = pathname ?? "/";
    if (path === lastPathRef.current) return;
    lastPathRef.current = path;
    trackEvent("page_view", {
      pathname: path,
      view: pathToView(path),
    });
  }, [pathname, trackEvent]);

  return null;
}
