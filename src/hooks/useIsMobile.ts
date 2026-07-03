"use client";

import { useEffect, useState } from "react";

const MOBILE_QUERY = "(max-width: 767px)";

function readIsMobile(): boolean {
  if (typeof window === "undefined") return true;
  return window.matchMedia(MOBILE_QUERY).matches;
}

/**
 * SSR-safe mobile detector aligned with Tailwind `md` (768px).
 * Defaults to mobile until mounted to avoid desktop flash on phones.
 */
export function useIsMobile(defaultMobile = true): boolean {
  const [isMobile, setIsMobile] = useState(defaultMobile);

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  return isMobile;
}

export function getIsMobileSnapshot(): boolean {
  return readIsMobile();
}
