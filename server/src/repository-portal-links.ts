import { query } from "./db.js";

export interface UserPortalLink {
  id: string;
  userId: string;
  portalKey: string;
  portalLabel: string;
  profileUrl: string;
  status: "syncing" | "synced" | "error";
  itemCount: number;
  lastItemHash: string | null;
  lastSyncedAt: string | null;
  nextSyncAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

type PortalLinkRow = {
  id: string;
  user_id: string;
  portal_key: string;
  portal_label: string;
  profile_url: string;
  status: string;
  item_count: number;
  last_item_hash: string | null;
  last_synced_at: Date | null;
  next_sync_at: Date | null;
  last_error: string | null;
  created_at: Date;
  updated_at: Date;
};

function mapPortalLinkRow(r: PortalLinkRow): UserPortalLink {
  return {
    id: r.id,
    userId: r.user_id,
    portalKey: r.portal_key,
    portalLabel: r.portal_label,
    profileUrl: r.profile_url,
    status: r.status as UserPortalLink["status"],
    itemCount: r.item_count,
    lastItemHash: r.last_item_hash,
    lastSyncedAt: r.last_synced_at?.toISOString() ?? null,
    nextSyncAt: r.next_sync_at?.toISOString() ?? null,
    lastError: r.last_error,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

export async function getPortalLinksForUser(userId: string): Promise<UserPortalLink[]> {
  const rows = await query<PortalLinkRow>(
    `SELECT * FROM user_portal_links WHERE user_id = $1 ORDER BY portal_label ASC`,
    [userId]
  );
  return rows.map(mapPortalLinkRow);
}

export async function getPortalLinkByKey(
  userId: string,
  portalKey: string
): Promise<UserPortalLink | null> {
  const rows = await query<PortalLinkRow>(
    `SELECT * FROM user_portal_links WHERE user_id = $1 AND portal_key = $2 LIMIT 1`,
    [userId, portalKey]
  );
  return rows[0] ? mapPortalLinkRow(rows[0]) : null;
}

export async function upsertPortalLink(input: {
  userId: string;
  portalKey: string;
  portalLabel: string;
  profileUrl: string;
  status?: UserPortalLink["status"];
  itemCount?: number;
  lastItemHash?: string | null;
  scheduleNextSync?: boolean;
}): Promise<UserPortalLink> {
  const id = `upl-${input.userId}-${input.portalKey}`;
  const nextSync = input.scheduleNextSync
    ? new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
    : null;

  const rows = await query<PortalLinkRow>(
    `INSERT INTO user_portal_links (
      id, user_id, portal_key, portal_label, profile_url, status, item_count,
      last_item_hash, last_synced_at, next_sync_at, updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now())
    ON CONFLICT (user_id, portal_key) DO UPDATE SET
      portal_label = EXCLUDED.portal_label,
      profile_url = EXCLUDED.profile_url,
      status = EXCLUDED.status,
      item_count = EXCLUDED.item_count,
      last_item_hash = COALESCE(EXCLUDED.last_item_hash, user_portal_links.last_item_hash),
      last_synced_at = COALESCE(EXCLUDED.last_synced_at, user_portal_links.last_synced_at),
      next_sync_at = COALESCE(EXCLUDED.next_sync_at, user_portal_links.next_sync_at),
      last_error = NULL,
      updated_at = now()
    RETURNING *`,
    [
      id,
      input.userId,
      input.portalKey,
      input.portalLabel,
      input.profileUrl,
      input.status ?? "synced",
      input.itemCount ?? 0,
      input.lastItemHash ?? null,
      input.status === "synced" ? new Date() : null,
      nextSync,
    ]
  );
  return mapPortalLinkRow(rows[0]!);
}

export async function markPortalLinkSyncing(userId: string, portalKey: string): Promise<void> {
  await query(
    `UPDATE user_portal_links SET status = 'syncing', updated_at = now()
     WHERE user_id = $1 AND portal_key = $2`,
    [userId, portalKey]
  );
}

export async function markPortalLinkError(
  userId: string,
  portalKey: string,
  message: string
): Promise<void> {
  await query(
    `UPDATE user_portal_links SET status = 'error', last_error = $3, updated_at = now()
     WHERE user_id = $1 AND portal_key = $2`,
    [userId, portalKey, message.slice(0, 500)]
  );
}

export async function getPortalLinksDueForSync(limit: number): Promise<UserPortalLink[]> {
  const rows = await query<PortalLinkRow>(
    `SELECT * FROM user_portal_links
     WHERE status <> 'error'
       AND (next_sync_at IS NULL OR next_sync_at <= now())
     ORDER BY COALESCE(next_sync_at, created_at) ASC
     LIMIT $1`,
    [Math.max(1, Math.min(limit, 20))]
  );
  return rows.map(mapPortalLinkRow);
}

export async function deletePortalLink(userId: string, portalKey: string): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `DELETE FROM user_portal_links WHERE user_id = $1 AND portal_key = $2 RETURNING id`,
    [userId, portalKey]
  );
  return rows.length > 0;
}
