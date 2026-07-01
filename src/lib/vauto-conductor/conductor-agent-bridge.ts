import type { WakeWordAgentResult } from "@/lib/voice-intent-engine";

export type ConductorSearchExecutor = (
  query: string
) => Promise<WakeWordAgentResult | null>;

let searchExecutor: ConductorSearchExecutor | null = null;

/** Registered by VautoAgentContext — conductor-owned search uses the live agent stack. */
export function registerConductorSearchExecutor(fn: ConductorSearchExecutor | null): void {
  searchExecutor = fn;
}

export function hasConductorSearchExecutor(): boolean {
  return searchExecutor !== null;
}

export async function runConductorSearchExecutor(
  query: string
): Promise<WakeWordAgentResult | null> {
  if (!searchExecutor) return null;
  return searchExecutor(query);
}
