import { getFilterableAttributes } from "./queries";
import { listingCategoryForVertical } from "./listing-flow";
import { resolveVerticalId, verticalIdToUiSlug } from "./legacy";
import type { AttributeDefinition, VerticalId } from "./types";

export const FACET_RESERVED_KEYS = [
  "vertical",
  "verticalid",
  "q",
  "sort",
  "page",
  "limit",
] as const;

export const FACET_SORT_ALLOWLIST = [
  "relevance",
  "newest",
  "price_asc",
  "price_desc",
] as const;

export type FacetSortId = (typeof FACET_SORT_ALLOWLIST)[number];

export const FACET_SORT_SQL: Record<
  FacetSortId,
  { sql: "created_at DESC" | "price ASC" | "price DESC"; field: "created_at" | "price" | "relevance" }
> = {
  relevance: { sql: "created_at DESC", field: "relevance" },
  newest: { sql: "created_at DESC", field: "created_at" },
  price_asc: { sql: "price ASC", field: "price" },
  price_desc: { sql: "price DESC", field: "price" },
};

export const DEFAULT_FACET_PAGE_SIZE = 24;
export const MAX_FACET_PAGE_SIZE = 50;

export type FacetIssueCode =
  | "unknown_category"
  | "unknown_facet"
  | "invalid_type"
  | "invalid_enum"
  | "min"
  | "max"
  | "range_order"
  | "invalid_sort";

export type FacetIssue = {
  key: string;
  code: FacetIssueCode;
  message: string;
};

export type FacetPredicate =
  | { kind: "eq"; key: string; value: string }
  | { kind: "in"; key: string; values: readonly string[] }
  | { kind: "min"; key: string; value: number }
  | { kind: "max"; key: string; value: number }
  | { kind: "contains"; key: string; value: string }
  | { kind: "location"; key: string; value: string }
  | { kind: "boolean"; key: string; value: boolean };

export type ParsedFacetQuery = {
  verticalId: VerticalId | null;
  q: string;
  sort: FacetSortId;
  page: number;
  limit: number;
  predicates: FacetPredicate[];
};

export type FacetParseResult =
  | { ok: true; query: ParsedFacetQuery }
  | { ok: false; issues: FacetIssue[] };

export type FacetableListing = {
  id: string;
  category: string;
  title?: string;
  description?: string;
  location?: string;
  price?: number;
  createdAt?: string;
  attributes?: Record<string, unknown> | null;
};

const SORT_ALIASES: Record<string, FacetSortId> = {
  relevance: "relevance",
  newest: "newest",
  price_asc: "price_asc",
  price_desc: "price_desc",
  cheapest: "price_asc",
  "price-asc": "price_asc",
  "price-desc": "price_desc",
};

export function listingCategoriesForVertical(id: VerticalId): readonly string[] {
  const primary = listingCategoryForVertical(id);
  if (id === "TRANSPORT") return [primary, "vehicles"];
  return [primary];
}

function isReserved(key: string): boolean {
  return (FACET_RESERVED_KEYS as readonly string[]).includes(key.toLowerCase());
}

function asNumber(raw: string): number | null {
  const n = Number(String(raw).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function splitRangeKey(key: string): { base: string; bound: "min" | "max" | null } {
  if (key.endsWith("_min")) return { base: key.slice(0, -4), bound: "min" };
  if (key.endsWith("_max")) return { base: key.slice(0, -4), bound: "max" };
  return { base: key, bound: null };
}

function attrMap(attrs: readonly AttributeDefinition[]): Map<string, AttributeDefinition> {
  return new Map(attrs.map((a) => [a.key, a]));
}

function collectParams(
  search: URLSearchParams
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const [rawKey, rawVal] of search.entries()) {
    const key = rawKey.trim();
    if (!key) continue;
    const list = out.get(key) ?? [];
    list.push(rawVal);
    out.set(key, list);
  }
  return out;
}

function parseSort(raw: string | undefined): FacetSortId | "invalid" {
  if (!raw || !raw.trim()) return "relevance";
  const mapped = SORT_ALIASES[raw.trim().toLowerCase()];
  return mapped ?? "invalid";
}

function parsePage(raw: string | undefined): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return 1;
  return n;
}

function parseLimit(raw: string | undefined): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return DEFAULT_FACET_PAGE_SIZE;
  return Math.min(n, MAX_FACET_PAGE_SIZE);
}

/**
 * Authoritative facet parser. Unknown / incompatible keys → 400 issues.
 * Never interpolates keys into SQL.
 */
export function parseFacetSearchParams(
  search: string | URLSearchParams
): FacetParseResult {
  const params =
    search instanceof URLSearchParams
      ? search
      : new URLSearchParams(
          String(search).startsWith("?") ? String(search).slice(1) : String(search)
        );
  const bag = collectParams(params);
  const issues: FacetIssue[] = [];

  const verticalRaw =
    bag.get("verticalId")?.[0] ?? bag.get("vertical")?.[0] ?? "";
  const verticalId = verticalRaw ? resolveVerticalId(verticalRaw) : null;
  if (verticalRaw && !verticalId) {
    issues.push({
      key: "vertical",
      code: "unknown_category",
      message: "Nežinoma kategorija — filtrai netaikomi.",
    });
  }

  const sortRaw = bag.get("sort")?.[0];
  const sort = parseSort(sortRaw);
  if (sort === "invalid") {
    issues.push({
      key: "sort",
      code: "invalid_sort",
      message: "Rikiavimas neleistinas.",
    });
  }

  const q = (bag.get("q")?.[0] ?? "").trim();
  const page = parsePage(bag.get("page")?.[0]);
  const limit = parseLimit(bag.get("limit")?.[0]);

  const facetEntries: Array<[string, string[]]> = [];
  for (const [key, values] of bag) {
    if (isReserved(key)) continue;
    facetEntries.push([key, values]);
  }

  if (facetEntries.length > 0 && !verticalId) {
    for (const [key] of facetEntries) {
      issues.push({
        key,
        code: "unknown_facet",
        message: "Filtras be kanoninės vertikalės netaikomas.",
      });
    }
  }

  const allowed = verticalId ? attrMap(getFilterableAttributes(verticalId)) : new Map();
  const rangeAcc = new Map<string, { min?: number; max?: number }>();
  const predicates: FacetPredicate[] = [];

  for (const [rawKey, values] of facetEntries) {
    const { base, bound } = splitRangeKey(rawKey);
    const def = allowed.get(base);
    if (!def) {
      issues.push({
        key: rawKey,
        code: "unknown_facet",
        message: `Filtras „${rawKey}“ šiai kategorijai neleidžiamas.`,
      });
      continue;
    }

    if (bound) {
      if (def.type !== "number" && def.type !== "range") {
        issues.push({
          key: rawKey,
          code: "invalid_type",
          message: `Filtras „${rawKey}“ nėra skaičiaus rėžis.`,
        });
        continue;
      }
      const n = asNumber(values[values.length - 1] ?? "");
      if (n === null) {
        issues.push({
          key: rawKey,
          code: "invalid_type",
          message: `Filtras „${rawKey}“ turi būti skaičius.`,
        });
        continue;
      }
      if (def.min !== undefined && n < def.min) {
        issues.push({
          key: rawKey,
          code: "min",
          message: `Filtras „${rawKey}“ negali būti mažesnis nei ${def.min}.`,
        });
        continue;
      }
      if (def.max !== undefined && n > def.max) {
        issues.push({
          key: rawKey,
          code: "max",
          message: `Filtras „${rawKey}“ negali būti didesnis nei ${def.max}.`,
        });
        continue;
      }
      const acc = rangeAcc.get(base) ?? {};
      if (bound === "min") acc.min = n;
      else acc.max = n;
      rangeAcc.set(base, acc);
      continue;
    }

    if (def.type === "enum") {
      const value = values[values.length - 1] ?? "";
      if (!def.options?.includes(value)) {
        issues.push({
          key: rawKey,
          code: "invalid_enum",
          message: `Filtras „${def.label}“ priima tik schemos reikšmes.`,
        });
        continue;
      }
      predicates.push({ kind: "eq", key: def.key, value });
      continue;
    }

    if (def.type === "multi_enum") {
      const invalid = values.filter((v) => !def.options?.includes(v));
      if (invalid.length) {
        issues.push({
          key: rawKey,
          code: "invalid_enum",
          message: `Filtras „${def.label}“ priima tik schemos reikšmes.`,
        });
        continue;
      }
      predicates.push({ kind: "in", key: def.key, values: [...values] });
      continue;
    }

    if (def.type === "number" || def.type === "range") {
      const n = asNumber(values[values.length - 1] ?? "");
      if (n === null) {
        issues.push({
          key: rawKey,
          code: "invalid_type",
          message: `Filtras „${def.label}“ turi būti skaičius.`,
        });
        continue;
      }
      if (def.min !== undefined && n < def.min) {
        issues.push({
          key: rawKey,
          code: "min",
          message: `Filtras „${def.label}“ negali būti mažesnis nei ${def.min}.`,
        });
        continue;
      }
      if (def.max !== undefined && n > def.max) {
        issues.push({
          key: rawKey,
          code: "max",
          message: `Filtras „${def.label}“ negali būti didesnis nei ${def.max}.`,
        });
        continue;
      }
      predicates.push({ kind: "eq", key: def.key, value: String(n) });
      continue;
    }

    if (def.type === "boolean") {
      const raw = (values[values.length - 1] ?? "").toLowerCase();
      if (raw !== "true" && raw !== "false" && raw !== "1" && raw !== "0") {
        issues.push({
          key: rawKey,
          code: "invalid_type",
          message: `Filtras „${def.label}“ turi būti taip/ne.`,
        });
        continue;
      }
      predicates.push({
        kind: "boolean",
        key: def.key,
        value: raw === "true" || raw === "1",
      });
      continue;
    }

    if (def.type === "location") {
      const value = (values[values.length - 1] ?? "").trim();
      if (value) predicates.push({ kind: "location", key: def.key, value });
      continue;
    }

    const value = (values[values.length - 1] ?? "").trim();
    if (value) predicates.push({ kind: "contains", key: def.key, value });
  }

  for (const [key, range] of rangeAcc) {
    if (range.min != null && range.max != null && range.min > range.max) {
      issues.push({
        key: `${key}_max`,
        code: "range_order",
        message: "Minimumas negali būti didesnis už maksimumą.",
      });
      continue;
    }
    if (range.min != null) predicates.push({ kind: "min", key, value: range.min });
    if (range.max != null) predicates.push({ kind: "max", key, value: range.max });
  }

  if (issues.length) return { ok: false, issues };

  return {
    ok: true,
    query: {
      verticalId,
      q,
      sort: sort === "invalid" ? "relevance" : sort,
      page,
      limit,
      predicates,
    },
  };
}

export function serializeFacetSearchParams(query: ParsedFacetQuery): URLSearchParams {
  const params = new URLSearchParams();
  if (query.verticalId) params.set("vertical", verticalIdToUiSlug(query.verticalId));
  if (query.q) params.set("q", query.q);
  if (query.sort !== "relevance") params.set("sort", query.sort);
  if (query.page > 1) params.set("page", String(query.page));
  if (query.limit !== DEFAULT_FACET_PAGE_SIZE) params.set("limit", String(query.limit));

  for (const pred of query.predicates) {
    if (pred.kind === "eq") params.append(pred.key, pred.value);
    else if (pred.kind === "in") {
      for (const v of pred.values) params.append(pred.key, v);
    } else if (pred.kind === "min") params.append(`${pred.key}_min`, String(pred.value));
    else if (pred.kind === "max") params.append(`${pred.key}_max`, String(pred.value));
    else if (pred.kind === "contains" || pred.kind === "location") {
      const value = pred.value.trim();
      if (value) params.append(pred.key, value);
    } else if (pred.kind === "boolean") {
      params.append(pred.key, pred.value ? "true" : "false");
    }
  }
  return params;
}

export function clearVerticalFacets(query: ParsedFacetQuery): ParsedFacetQuery {
  return {
    ...query,
    predicates: [],
    page: 1,
  };
}

export function resetFacetPage(query: ParsedFacetQuery): ParsedFacetQuery {
  return { ...query, page: 1 };
}

function attrScalar(
  listing: FacetableListing,
  key: string
): string {
  const raw = listing.attributes?.[key];
  if (raw == null) return "";
  if (Array.isArray(raw)) return raw.map(String).join(" ");
  return String(raw).trim();
}

function attrNumber(listing: FacetableListing, key: string): number | null {
  const n = asNumber(attrScalar(listing, key));
  return n;
}

function matchesPredicate(listing: FacetableListing, pred: FacetPredicate): boolean {
  if (pred.kind === "eq") {
    const n = attrNumber(listing, pred.key);
    if (n != null && Number.isFinite(Number(pred.value))) {
      return n === Number(pred.value);
    }
    return attrScalar(listing, pred.key) === pred.value;
  }
  if (pred.kind === "in") {
    const raw = listing.attributes?.[pred.key];
    const values = Array.isArray(raw)
      ? raw.map(String)
      : attrScalar(listing, pred.key).split(/[,|]/).map((s) => s.trim());
    return pred.values.some((v) => values.includes(v));
  }
  if (pred.kind === "min") {
    const n = attrNumber(listing, pred.key);
    return n != null && n >= pred.value;
  }
  if (pred.kind === "max") {
    const n = attrNumber(listing, pred.key);
    return n != null && n <= pred.value;
  }
  if (pred.kind === "contains") {
    return attrScalar(listing, pred.key)
      .toLowerCase()
      .includes(pred.value.toLowerCase());
  }
  if (pred.kind === "location") {
    const hay = `${attrScalar(listing, pred.key)} ${listing.location ?? ""}`.toLowerCase();
    return hay.includes(pred.value.toLowerCase());
  }
  const raw = attrScalar(listing, pred.key).toLowerCase();
  return pred.value ? raw === "true" || raw === "1" : raw === "false" || raw === "0" || raw === "";
}

function matchesText(listing: FacetableListing, q: string): boolean {
  if (!q) return true;
  const hay = `${listing.title ?? ""} ${listing.description ?? ""} ${listing.location ?? ""}`.toLowerCase();
  return hay.includes(q.toLowerCase());
}

export function applyFacetFilters<T extends FacetableListing>(
  listings: readonly T[],
  query: ParsedFacetQuery
): T[] {
  const cats = query.verticalId
    ? new Set(listingCategoriesForVertical(query.verticalId))
    : null;
  return listings.filter((listing) => {
    if (cats && !cats.has(listing.category)) return false;
    if (!matchesText(listing, query.q)) return false;
    return query.predicates.every((p) => matchesPredicate(listing, p));
  });
}

export function sortFacetListings<T extends FacetableListing>(
  listings: readonly T[],
  sort: FacetSortId
): T[] {
  const copy = [...listings];
  if (sort === "price_asc") {
    copy.sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
  } else if (sort === "price_desc") {
    copy.sort((a, b) => (b.price ?? 0) - (a.price ?? 0));
  } else if (sort === "newest") {
    copy.sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")));
  }
  return copy;
}

export function paginateFacetListings<T>(
  listings: readonly T[],
  page: number,
  limit: number
): { items: T[]; total: number; page: number; pageCount: number } {
  const total = listings.length;
  const pageCount = Math.max(1, Math.ceil(total / limit) || 1);
  const safePage = Math.min(Math.max(1, page), pageCount);
  const start = (safePage - 1) * limit;
  return {
    items: listings.slice(start, start + limit) as T[],
    total,
    page: safePage,
    pageCount,
  };
}

export type FacetSqlPlan = {
  text: string;
  params: unknown[];
  sortSql: (typeof FACET_SORT_SQL)[FacetSortId]["sql"];
};

/**
 * Fail-safe JSON numeric read. Malformed values (`unknown`, units, blanks)
 * become NULL — they do not match numeric predicates and must not 500.
 * Facet key remains a bound parameter, never concatenated as an identifier.
 */
export function jsonNumericAttrExpr(keyIdx: number): string {
  return `(CASE WHEN (attributes->>$${keyIdx}) ~ '^[+-]?[0-9]+([.][0-9]+)?$' THEN (attributes->>$${keyIdx})::numeric ELSE NULL END)`;
}

/**
 * Hydration / landing URL cleanup. Unknown vertical is dropped (not kept as
 * authoritative `vertical=`). Privileged facets are never copied without a
 * successful parse against 13A filterable keys.
 */
export function canonicalizeFacetSearchParams(
  search: string | URLSearchParams
): URLSearchParams {
  const parsed = parseFacetSearchParams(search);
  if (parsed.ok) return serializeFacetSearchParams(parsed.query);

  const raw =
    search instanceof URLSearchParams
      ? search
      : new URLSearchParams(
          String(search).startsWith("?") ? String(search).slice(1) : String(search)
        );
  const cleaned = new URLSearchParams();
  const verticalId = resolveVerticalId(raw.get("verticalId") ?? raw.get("vertical") ?? "");
  if (verticalId) cleaned.set("vertical", verticalIdToUiSlug(verticalId));
  const q = (raw.get("q") ?? "").trim();
  if (q) cleaned.set("q", q);
  return cleaned;
}

/**
 * Parameterized SELECT plan. Facet keys are bound as values (`attributes->>$n`),
 * never concatenated as identifiers. Sort is a closed allowlist literal.
 */
export function buildFacetSqlPlan(query: ParsedFacetQuery): FacetSqlPlan {
  const params: unknown[] = [];
  const where: string[] = ["status = 'active'", "banned = false"];

  if (query.verticalId) {
    params.push([...listingCategoriesForVertical(query.verticalId)]);
    where.push(`category = ANY($${params.length}::text[])`);
  }

  if (query.q) {
    params.push(`%${query.q.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_")}%`);
    where.push(
      `(title ILIKE $${params.length} ESCAPE '\\' OR COALESCE(description, '') ILIKE $${params.length} ESCAPE '\\')`
    );
  }

  for (const pred of query.predicates) {
    params.push(pred.key);
    const keyIdx = params.length;
    if (pred.kind === "eq") {
      params.push(pred.value);
      where.push(`attributes->>$${keyIdx} = $${params.length}`);
    } else if (pred.kind === "in") {
      params.push([...pred.values]);
      where.push(`attributes->>$${keyIdx} = ANY($${params.length}::text[])`);
    } else if (pred.kind === "min") {
      params.push(pred.value);
      where.push(
        `${jsonNumericAttrExpr(keyIdx)} >= $${params.length}`
      );
    } else if (pred.kind === "max") {
      params.push(pred.value);
      where.push(
        `${jsonNumericAttrExpr(keyIdx)} <= $${params.length}`
      );
    } else if (pred.kind === "contains" || pred.kind === "location") {
      params.push(`%${pred.value.trim().replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_")}%`);
      if (pred.kind === "location") {
        where.push(
          `(attributes->>$${keyIdx} ILIKE $${params.length} ESCAPE '\\' OR location ILIKE $${params.length} ESCAPE '\\')`
        );
      } else {
        where.push(`attributes->>$${keyIdx} ILIKE $${params.length} ESCAPE '\\'`);
      }
    } else {
      params.push(pred.value ? "true" : "false");
      where.push(`LOWER(COALESCE(attributes->>$${keyIdx}, '')) = $${params.length}`);
    }
  }

  const sortSql = FACET_SORT_SQL[query.sort].sql;
  const limitIdx = params.push(query.limit);
  const offsetIdx = params.push((query.page - 1) * query.limit);
  const text = `SELECT id, title, price, location, category, description, attributes, created_at, COUNT(*) OVER()::int AS total_count FROM listings WHERE ${where.join(" AND ")} ORDER BY ${sortSql} LIMIT $${limitIdx} OFFSET $${offsetIdx}`;
  return { text, params, sortSql };
}

export function activeFacetCount(query: ParsedFacetQuery): number {
  return query.predicates.length;
}

export function filterableKeysForVertical(id: VerticalId | null): readonly string[] {
  if (!id) return [];
  return getFilterableAttributes(id).map((a) => a.key);
}
