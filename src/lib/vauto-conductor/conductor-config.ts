/** Build-time + runtime-config toggle for VautoConductor (Phase 4 rollout). */
let resolved: boolean | null = null;

function buildTimeConductorEnabled(): boolean {
  return (
    typeof process !== "undefined" && process.env.NEXT_PUBLIC_VAUTO_CONDUCTOR === "1"
  );
}

/** Sync read — before init, falls back to build env. */
export function isConductorEnabled(): boolean {
  if (resolved !== null) return resolved;
  return buildTimeConductorEnabled();
}

/** Hydrate from /runtime-config.json (overrides build when present). */
export async function initConductorConfig(): Promise<boolean> {
  if (resolved !== null) return resolved;

  let enabled = buildTimeConductorEnabled();

  if (typeof window !== "undefined") {
    try {
      const res = await fetch("/runtime-config.json", { cache: "no-store" });
      if (res.ok) {
        const json = (await res.json()) as { conductorEnabled?: boolean };
        if (typeof json.conductorEnabled === "boolean") {
          enabled = json.conductorEnabled;
        }
      }
    } catch {
      /* offline or missing file */
    }
  }

  resolved = enabled;
  return enabled;
}
