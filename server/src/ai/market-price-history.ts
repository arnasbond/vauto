import { query } from "../db.js";
import type { MarketPriceAnalysisResult } from "./market-price-analysis.js";

export interface MarketPriceHistoryRow {
  id: string;
  category: string;
  subcategory: string | null;
  city: string | null;
  conditionGrade: string | null;
  minPrice: number;
  maxPrice: number;
  medianPrice: number;
  optimalPrice: number;
  sampleSize: number;
  updatedAt: string;
}

function hashAttributes(attrs: Record<string, unknown> | undefined): string {
  if (!attrs || !Object.keys(attrs).length) return "generic";
  const keys = ["brand", "make", "model", "condition", "propertyType", "partType"];
  const parts = keys
    .map((k) => `${k}:${String(attrs[k] ?? "")}`)
    .filter((p) => !p.endsWith(":"))
    .join("|");
  return parts || "generic";
}

export async function findMarketPriceHistory(input: {
  category: string;
  city?: string;
  condition?: string;
  attributes?: Record<string, unknown>;
}): Promise<MarketPriceHistoryRow | null> {
  const attrsHash = hashAttributes(input.attributes);
  const city = input.city?.trim() || null;
  const condition = input.condition?.trim() || null;

  try {
    const rows = await query<{
      id: string;
      category: string;
      subcategory: string | null;
      city: string | null;
      condition_grade: string | null;
      min_price: string;
      max_price: string;
      median_price: string;
      optimal_price: string;
      sample_size: number;
      updated_at: Date;
    }>(
      `SELECT id, category, subcategory, city, condition_grade,
              min_price, max_price, median_price, optimal_price, sample_size, updated_at
       FROM market_price_history
       WHERE category = $1
         AND (city IS NULL OR city = $2 OR $2 IS NULL)
         AND (condition_grade IS NULL OR condition_grade = $3 OR $3 IS NULL)
         AND (attributes_hash = $4 OR attributes_hash = 'generic')
       ORDER BY sample_size DESC, updated_at DESC
       LIMIT 1`,
      [input.category, city, condition, attrsHash]
    );

    const r = rows[0];
    if (!r) return null;

    return {
      id: r.id,
      category: r.category,
      subcategory: r.subcategory,
      city: r.city,
      conditionGrade: r.condition_grade,
      minPrice: Number(r.min_price),
      maxPrice: Number(r.max_price),
      medianPrice: Number(r.median_price),
      optimalPrice: Number(r.optimal_price),
      sampleSize: r.sample_size,
      updatedAt: r.updated_at.toISOString(),
    };
  } catch {
    return null;
  }
}

export async function upsertMarketPriceHistory(input: {
  category: string;
  city?: string;
  condition?: string;
  attributes?: Record<string, unknown>;
  analysis: MarketPriceAnalysisResult;
  optimalPrice: number;
}): Promise<void> {
  if (
    input.analysis.sampleSize < 1 ||
    input.analysis.minPrice == null ||
    input.analysis.maxPrice == null ||
    input.analysis.medianPrice == null
  ) {
    return;
  }

  const id = `mph-${input.category}-${input.city ?? "lt"}-${hashAttributes(input.attributes)}`.slice(
    0,
    120
  );

  try {
    await query(
      `INSERT INTO market_price_history (
        id, category, subcategory, city, condition_grade, attributes_hash,
        min_price, max_price, median_price, optimal_price, sample_size, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now())
      ON CONFLICT (id) DO UPDATE SET
        min_price = EXCLUDED.min_price,
        max_price = EXCLUDED.max_price,
        median_price = EXCLUDED.median_price,
        optimal_price = EXCLUDED.optimal_price,
        sample_size = EXCLUDED.sample_size,
        updated_at = now()`,
      [
        id,
        input.category,
        String(input.attributes?.subcategory ?? input.attributes?.partType ?? "") || null,
        input.city?.trim() || null,
        input.condition?.trim() || null,
        hashAttributes(input.attributes),
        input.analysis.minPrice,
        input.analysis.maxPrice,
        input.analysis.medianPrice,
        input.optimalPrice,
        input.analysis.sampleSize,
      ]
    );
  } catch {
    /* best-effort cache */
  }
}
