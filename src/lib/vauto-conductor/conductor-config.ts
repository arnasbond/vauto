/** Build-time + runtime-config toggle for VautoConductor (Phase 4 rollout). */
import { initDataApiConfig, peekRuntimeConductorEnabled } from "@/lib/api/config";

let resolved: boolean | null = null;
let initPromise: Promise<boolean> | null = null;

function buildTimeConductorEnabled(): boolean {
  return (
    typeof process !== "undefined" && process.env.NEXT_PUBLIC_VAUTO_CONDUCTOR === "1"
  );
}

/** Sync read — before init, falls back to build env. */
export function isConductorEnabled(): boolean {
  if (resolved !== null) return resolved;
  const runtime = peekRuntimeConductorEnabled();
  if (runtime !== null) return runtime;
  return buildTimeConductorEnabled();
}

/** Hydrate from shared runtime-config fetch (via initDataApiConfig). */
export async function initConductorConfig(): Promise<boolean> {
  if (resolved !== null) return resolved;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    await initDataApiConfig();
    const runtime = peekRuntimeConductorEnabled();
    resolved = runtime !== null ? runtime : buildTimeConductorEnabled();
    return resolved;
  })();

  return initPromise;
}
