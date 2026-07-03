"use client";

import { useSyncExternalStore } from "react";

const MOBILE_QUERY = "(max-width: 767px)";

function subscribeMobile(onChange: () => void): () => void {
  const mq = window.matchMedia(MOBILE_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function getMobileSnapshot(): boolean {
  return window.matchMedia(MOBILE_QUERY).matches;
}

function getServerMobileSnapshot(): boolean {
  return true;
}

/**
 * SSR-safe mobile detector aligned with Tailwind `md` (768px).
 * Uses useSyncExternalStore so the first client paint matches the real viewport.
 */
export function useIsMobile(defaultMobile = true): boolean {
  return useSyncExternalStore(
    subscribeMobile,
    getMobileSnapshot,
    defaultMobile ? getServerMobileSnapshot : () => false
  );
}

export function getIsMobileSnapshot(): boolean {
  if (typeof window === "undefined") return true;
  return getMobileSnapshot();
}
