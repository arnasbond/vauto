"use client";

import { useEffect } from "react";
import { initWebAutoUpdate } from "@/lib/web-auto-update";

/** Mounts production web auto-update polling once at app startup. */
export function WebAutoUpdateHost() {
  useEffect(() => initWebAutoUpdate(), []);
  return null;
}
