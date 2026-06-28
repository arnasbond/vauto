"use client";

import { useEffect } from "react";

/** Wake-word / voice STT disabled in v1.2 — text + Vision AI only. */
export function WakeWordHost() {
  useEffect(() => {
    document.body.classList.remove("vauto-audio-first");
  }, []);
  return null;
}
