/** Portal sync adapter contract — import, refresh, publish phases. */

import type { UserPortalLink } from "../repository-portal-links.js";

export type PortalSyncPhase = "import" | "refresh" | "publish" | "delete";

export interface PortalSyncContext {
  userId: string;
  userName: string;
  defaultLocation?: string;
  link: UserPortalLink;
  force?: boolean;
}

export interface PortalSyncOutcome {
  status: "updated" | "skipped" | "error";
  itemCount: number;
  phase: PortalSyncPhase;
  error?: string;
}

export interface PortalSyncAdapter {
  readonly portalKey: string;
  readonly supportedPhases: PortalSyncPhase[];
  sync(ctx: PortalSyncContext): Promise<PortalSyncOutcome>;
}

const adapters = new Map<string, PortalSyncAdapter>();

export function registerPortalSyncAdapter(adapter: PortalSyncAdapter): void {
  adapters.set(adapter.portalKey, adapter);
}

export function getPortalSyncAdapter(portalKey: string): PortalSyncAdapter | undefined {
  return adapters.get(portalKey);
}

export function listPortalSyncAdapters(): PortalSyncAdapter[] {
  return [...adapters.values()];
}
