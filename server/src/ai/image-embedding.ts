import { visionDescribe } from "./llm-provider.js";
import { cosineSimilarity } from "./vector-math.js";
import {
  buildListingSearchText,
  embedSearchText,
} from "./listing-embedding.js";
import {
  getListingForEmbedding,
  listListingsMissingImageEmbeddings,
  searchListingsByImageEmbeddingRows,
  syncImageEmbeddingsFromSearch,
  updateListingImageEmbedding,
} from "../repository.js";

const VISUAL_FINGERPRINT_PROMPT = `Describe this product or listing photo for visual similarity search.
Include object type, brand/model if visible, colors, materials, condition, size cues, and distinctive visual features.
Output dense English keywords only (no full sentences), max 80 words.`;

async function visualFingerprintFromImage(
  imageUrl: string
): Promise<string | null> {
  if (!imageUrl.trim()) return null;
  return visionDescribe(VISUAL_FINGERPRINT_PROMPT, imageUrl);
}

export async function refreshListingImageEmbedding(
  listingId: string
): Promise<boolean> {
  const listing = await getListingForEmbedding(listingId);
  if (!listing || listing.banned || listing.status === "sold") {
    return false;
  }

  const imageUrl = listing.image?.trim() ?? "";
  const skipVision =
    !imageUrl ||
    (imageUrl.startsWith("data:") && imageUrl.length > 500_000);

  const fingerprint = skipVision
    ? buildListingSearchText(listing)
    : (await visualFingerprintFromImage(imageUrl)) ||
      buildListingSearchText(listing);
  if (!fingerprint.trim()) return false;

  const embedding = await embedSearchText(fingerprint);
  if (!embedding) return false;

  await updateListingImageEmbedding(listingId, embedding);
  return true;
}

export async function imageSearchScores(
  imageDataUrl: string,
  limit = 40
): Promise<Record<string, number>> {
  const fingerprint = await visualFingerprintFromImage(imageDataUrl);
  if (!fingerprint) return {};

  const queryEmbedding = await embedSearchText(fingerprint);
  if (!queryEmbedding) return {};

  const rows = await searchListingsByImageEmbeddingRows();
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

export async function backfillImageEmbeddings(max = 15): Promise<number> {
  let count = await syncImageEmbeddingsFromSearch(max);
  const ids = await listListingsMissingImageEmbeddings(max);
  for (const id of ids) {
    try {
      if (await refreshListingImageEmbedding(id)) count += 1;
    } catch {
      /* skip */
    }
  }
  return count;
}
