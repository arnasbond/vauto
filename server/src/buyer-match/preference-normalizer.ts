/**
 * Separate hard SearchQuery constraints from soft BuyerPreferences.
 * Soft prefs never override / widen hard filters.
 */

import { parseSearchQuery, type SearchQuery } from "../ai/search/search-schema.js";
import type { BuyerPreferences, NormalizedPreferences } from "./types.js";
import { BuyerPreferencesSchema } from "./schema.js";

const FORBIDDEN_PREF_KEYS = new Set([
  "age",
  "gender",
  "sex",
  "ethnicity",
  "nationality",
  "religion",
  "health",
  "disability",
  "politics",
  "political",
  "income",
  "socioeconomic",
  "race",
]);

export function assertNoDiscriminatoryPreferenceKeys(raw: unknown): void {
  if (!raw || typeof raw !== "object") return;
  for (const key of Object.keys(raw as object)) {
    const k = key.toLowerCase();
    if (FORBIDDEN_PREF_KEYS.has(k)) {
      throw new Error(`Discriminatory preference key rejected: ${key}`);
    }
    // Also reject keys that are clearly demographic (exact token match after split)
    const tokens = k.split(/[^a-z0-9]+/).filter(Boolean);
    if (tokens.some((t) => FORBIDDEN_PREF_KEYS.has(t))) {
      throw new Error(`Discriminatory preference key rejected: ${key}`);
    }
  }
}

export function normalizePreferences(
  searchQuery: SearchQuery,
  preferences?: BuyerPreferences | null
): NormalizedPreferences {
  const hard = parseSearchQuery(searchQuery);
  if (preferences == null) {
    return { hard, soft: {} };
  }
  assertNoDiscriminatoryPreferenceKeys(preferences);
  const soft = BuyerPreferencesSchema.parse(preferences);
  return { hard, soft };
}
