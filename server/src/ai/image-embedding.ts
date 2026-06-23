import { cosineSimilarity } from "./vector-math.js";
import { embedSearchText } from "./listing-embedding.js";
import {
  getListingForEmbedding,
  listListingsMissingImageEmbeddings,
  searchListingsByImageEmbeddingRows,
  updateListingImageEmbedding,
} from "../repository.js";

const VISUAL_FINGERPRINT_PROMPT = `Describe this product or listing photo for visual similarity search.
Include object type, brand/model if visible, colors, materials, condition, size cues, and distinctive visual features.
Output dense English keywords only (no full sentences), max 80 words.`;

async function visualFingerprintFromImage(
  imageUrl: string
): Promise<string | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key || !imageUrl.trim()) return null;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.1,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: VISUAL_FINGERPRINT_PROMPT },
            { type: "image_url", image_url: { url: imageUrl, detail: "low" } },
          ],
        },
      ],
    }),
  });

  if (!res.ok) return null;

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = data.choices?.[0]?.message?.content?.trim();
  return text || null;
}

export async function refreshListingImageEmbedding(
  listingId: string
): Promise<void> {
  const listing = await getListingForEmbedding(listingId);
  if (!listing || listing.banned || listing.status === "sold" || !listing.image) {
    return;
  }

  const fingerprint = await visualFingerprintFromImage(listing.image);
  if (!fingerprint) return;

  const embedding = await embedSearchText(fingerprint);
  if (!embedding) return;

  await updateListingImageEmbedding(listingId, embedding);
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
  const ids = await listListingsMissingImageEmbeddings(max);
  let count = 0;
  for (const id of ids) {
    try {
      await refreshListingImageEmbedding(id);
      count += 1;
    } catch {
      /* skip */
    }
  }
  return count;
}
