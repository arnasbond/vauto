import type { ApiListing } from "../types.js";
import { cosineSimilarity } from "./vector-math.js";
import {
  getListingForEmbedding,
  searchListingsByEmbeddingRows,
  updateListingEmbedding,
} from "../repository.js";

const EMBEDDING_MODEL = "text-embedding-3-small";

export function buildListingSearchText(listing: Pick<
  ApiListing,
  "title" | "category" | "location" | "description" | "tags" | "attributes"
>): string {
  const attrs = listing.attributes
    ? Object.entries(listing.attributes)
        .filter(([k]) => !k.startsWith("_"))
        .flatMap(([, v]) => (Array.isArray(v) ? v : [String(v)]))
        .join(" ")
    : "";

  return [
    listing.title,
    listing.category,
    listing.location,
    listing.description ?? "",
    ...(listing.tags ?? []),
    attrs,
  ]
    .join(" ")
    .trim()
    .slice(0, 6000);
}

export function buildVisualProfileText(profile: {
  title: string;
  category: string;
  location?: string;
  description?: string;
  price?: number;
}): string {
  return [
    profile.title,
    profile.category,
    profile.location ?? "",
    profile.description ?? "",
    profile.price ? `kaina ${profile.price} eur` : "",
  ]
    .join(" ")
    .trim()
    .slice(0, 2000);
}

export async function embedSearchText(text: string): Promise<number[] | null> {
  const { embedText } = await import("./llm-provider.js");
  return embedText(text);
}

export async function refreshListingEmbedding(listingId: string): Promise<void> {
  const listing = await getListingForEmbedding(listingId);
  if (!listing || listing.banned || listing.status === "sold") return;

  const text = buildListingSearchText(listing);
  const embedding = await embedSearchText(text);
  if (!embedding) return;

  await updateListingEmbedding(listingId, embedding);
}

export async function semanticSearchScores(
  queryText: string,
  limit = 40
): Promise<Record<string, number>> {
  const queryEmbedding = await embedSearchText(queryText);
  if (!queryEmbedding) return {};

  const rows = await searchListingsByEmbeddingRows();
  const scored = rows
    .map((row) => ({
      id: row.id,
      score: cosineSimilarity(queryEmbedding, row.embedding),
    }))
    .filter((r) => r.score > 0.05)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  const out: Record<string, number> = {};
  for (const item of scored) {
    out[item.id] = Math.round(item.score * 1000) / 1000;
  }
  return out;
}

export async function backfillListingEmbeddings(max = 25): Promise<number> {
  const { listListingsMissingEmbeddings } = await import("../repository.js");
  const ids = await listListingsMissingEmbeddings(max);
  let count = 0;
  for (const id of ids) {
    try {
      await refreshListingEmbedding(id);
      count += 1;
    } catch {
      /* skip */
    }
  }
  return count;
}
