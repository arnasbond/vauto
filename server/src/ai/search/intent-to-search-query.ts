/**
 * Map 10A IntentResult → validated SearchQuery (hard constraints preserved).
 */

import type { IntentResult } from "../intent/intent-schema.js";
import {
  parseSearchQuery,
  sanitizeSearchText,
  type SearchQuery,
} from "./search-schema.js";

const SEARCHABLE = new Set(["SEARCH", "BUY"]);

export function isSearchableIntent(intent: string): boolean {
  return SEARCHABLE.has(intent);
}

/**
 * Build SearchQuery from intent entities. Does not invent brands/prices.
 * Extra NL phrases (automatas, dyzelis, iki 18k, Kaunas) already resolved in 10A + domain normalizer.
 */
export function intentToSearchQuery(intent: IntentResult): SearchQuery {
  const e = intent.entities;
  const brand = e.make ?? e.brand ?? undefined;
  const raw: Record<string, unknown> = {};

  if (e.category) raw.category = e.category === "realty" ? "real_estate" : e.category;
  if (brand) raw.brand = brand;
  if (e.model) raw.model = e.model;
  if (e.priceMin != null) raw.priceMin = e.priceMin;
  if (e.priceMax != null) raw.priceMax = e.priceMax;
  if (e.yearMin != null) raw.yearMin = e.yearMin;
  if (e.yearMax != null) raw.yearMax = e.yearMax;
  if (e.location) raw.location = e.location;
  if (e.radiusKm != null) raw.radiusKm = e.radiusKm;
  if (e.condition) raw.condition = [e.condition];
  if (e.fuel) raw.fuel = e.fuel;
  if (e.transmission) raw.transmission = e.transmission;

  // Keywords: strip known structured tokens from query remnant
  let kw = sanitizeSearchText(e.query ?? intent.normalizedText ?? "");
  const drop = [
    brand,
    e.model,
    e.location,
    e.fuel,
    e.transmission,
    "ieškau",
    "ieskau",
    "rask",
    "surask",
    "rodyk",
    "parodyk",
    "perku",
    "pirksiu",
    "find",
    "search",
    "show me",
    "looking for",
    "want to buy",
    "looking to buy",
    "automatas",
    "automatinė",
    "automatine",
    "mechanas",
    "mechaninė",
    "mechanine",
    "automatic",
    "manual",
    "dyzelis",
    "dyzelinas",
    "diesel",
    "benzas",
    "benzinas",
    "petrol",
    "elektra",
    "electric",
    "quattro",
    "xdrive",
    "iki",
    "nuo",
    "under",
    "max",
    "eur",
    "euro",
    "€",
    "in",
    "with",
    "wait",
    "used",
    "new",
  ].filter(Boolean) as string[];
  for (const d of drop) {
    kw = kw.replace(new RegExp(d.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig"), " ");
  }
  // Drop bare years and prices left in remnant
  kw = kw.replace(/\b\d{2,7}\b/g, " ");
  // Drop common location case forms / English city leftovers
  kw = kw.replace(
    /\b(vilni(?:us|uje|aus)?|kaun(?:as|e|o)?|klaip[eė]d\w*|šiauli\w*|siauli\w*|panev[eė][zž]\w*|in)\b/gi,
    " "
  );
  kw = sanitizeSearchText(kw);
  if (kw) raw.keywords = kw;

  raw.sort = "relevance";
  return parseSearchQuery(raw);
}

/** Snapshot of hard constraints that must not be silently widened. */
export function hardConstraintsOf(query: SearchQuery): Partial<SearchQuery> {
  const hard: Partial<SearchQuery> = {};
  if (query.priceMin != null) hard.priceMin = query.priceMin;
  if (query.priceMax != null) hard.priceMax = query.priceMax;
  if (query.yearMin != null) hard.yearMin = query.yearMin;
  if (query.yearMax != null) hard.yearMax = query.yearMax;
  if (query.mileageMax != null) hard.mileageMax = query.mileageMax;
  if (query.radiusKm != null) hard.radiusKm = query.radiusKm;
  if (query.category) hard.category = query.category;
  if (query.brand) hard.brand = query.brand;
  if (query.model) hard.model = query.model;
  if (query.location) hard.location = query.location;
  if (query.fuel) hard.fuel = query.fuel;
  if (query.transmission) hard.transmission = query.transmission;
  if (query.condition?.length) hard.condition = query.condition;
  return hard;
}
