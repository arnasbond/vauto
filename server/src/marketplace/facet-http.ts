import type { Request, Response } from "express";
import { query } from "../db.js";
import {
  applyFacetFilters,
  buildFacetSqlPlan,
  FACET_RESULT_FIXTURES,
  paginateFacetListings,
  parseFacetSearchParams,
  sortFacetListings,
  type FacetableListing,
} from "../shared/marketplace-domain/index.js";

export function expressQueryToSearchParams(
  queryBag: Request["query"]
): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(queryBag)) {
    if (value == null) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item != null) params.append(key, String(item));
      }
    } else {
      params.append(key, String(value));
    }
  }
  return params;
}

type ListingSqlRow = {
  id: string;
  title: string;
  price: string | number;
  location: string;
  category: string;
  description: string | null;
  attributes: Record<string, unknown> | null;
  created_at: Date | string;
  total_count?: number;
};

function rowToListing(row: ListingSqlRow): FacetableListing {
  return {
    id: row.id,
    title: row.title,
    price: Number(row.price) || 0,
    location: row.location,
    category: row.category,
    description: row.description ?? "",
    attributes: row.attributes,
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
  };
}

export async function handleFacetListingSearch(req: Request, res: Response) {
  const parsed = parseFacetSearchParams(expressQueryToSearchParams(req.query));
  if (!parsed.ok) {
    res.status(400).json({ ok: false, issues: parsed.issues });
    return;
  }

  if (process.env.FACET_SEARCH_FIXTURES === "1") {
    const filtered = applyFacetFilters(FACET_RESULT_FIXTURES, parsed.query);
    const sorted = sortFacetListings(filtered, parsed.query.sort);
    const page = paginateFacetListings(
      sorted,
      parsed.query.page,
      parsed.query.limit
    );
    res.json({ ok: true, query: parsed.query, ...page });
    return;
  }

  const plan = buildFacetSqlPlan(parsed.query);
  const rows = await query<ListingSqlRow>(plan.text, plan.params);
  const items = rows.map(rowToListing);
  const total = Number(rows[0]?.total_count ?? items.length);
  const pageCount = Math.max(1, Math.ceil(total / parsed.query.limit) || 1);
  res.json({
    ok: true,
    query: parsed.query,
    items,
    total,
    page: parsed.query.page,
    pageCount,
  });
}
