import {
  getListingsPage,
  type ListingsPageResult,
} from "../repository.js";

export const DEFAULT_LISTINGS_PAGE_SIZE = 50;
export const MAX_LISTINGS_PAGE_SIZE = 50;

export interface ListingsQueryOptions {
  limit?: number;
  offset?: number;
}

function clampPageSize(limit?: number): number {
  const n = Number(limit);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LISTINGS_PAGE_SIZE;
  return Math.min(Math.floor(n), MAX_LISTINGS_PAGE_SIZE);
}

function clampOffset(offset?: number): number {
  const n = Number(offset);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

/** GET /api/listings — paginated feed (max 50 per page). */
export async function fetchListingsFeed(
  options: ListingsQueryOptions = {}
): Promise<ListingsPageResult> {
  return getListingsPage({
    limit: clampPageSize(options.limit),
    offset: clampOffset(options.offset),
  });
}
