import { getDataApiBaseUrl } from "@/lib/api/config";
import { compressForAiVision } from "@/lib/native-media";

export interface StudioPhotoResult {
  id: string;
  originalUrl: string;
  processedUrl: string;
  studioApplied?: boolean;
}

export interface StudioPhotoBatchResponse {
  ok: boolean;
  provider: string;
  format?: string;
  images: StudioPhotoResult[];
}

export type StudioPhotoProgress = {
  completed: number;
  total: number;
  currentIndex: number;
};

/** Process photos through studio BG removal — batched for progress UX. */
export async function processStudioPhotos(
  dataUrls: string[],
  onProgress?: (progress: StudioPhotoProgress) => void
): Promise<StudioPhotoResult[]> {
  const base = getDataApiBaseUrl();
  if (!base || !dataUrls.length) {
    return dataUrls.map((url, id) => ({
      id: String(id),
      originalUrl: url,
      processedUrl: url,
      studioApplied: false,
    }));
  }

  const compressed = await Promise.all(
    dataUrls.map((url) => compressForAiVision(url))
  );

  const batchSize = 2;
  const results: StudioPhotoResult[] = new Array(dataUrls.length);
  let completed = 0;

  for (let offset = 0; offset < compressed.length; offset += batchSize) {
    const chunk = compressed.slice(offset, offset + batchSize);
    const chunkStart = offset;

    onProgress?.({
      completed,
      total: dataUrls.length,
      currentIndex: chunkStart,
    });

    try {
      const res = await fetch(`${base}/api/ai/studio-photos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageDataUrls: chunk }),
      });

      if (!res.ok) {
        chunk.forEach((url, i) => {
          const idx = chunkStart + i;
          results[idx] = {
            id: String(idx),
            originalUrl: dataUrls[idx]!,
            processedUrl: dataUrls[idx]!,
            studioApplied: false,
          };
        });
        completed += chunk.length;
        continue;
      }

      const json = (await res.json()) as StudioPhotoBatchResponse;
      for (const img of json.images ?? []) {
        const idx = chunkStart + Number(img.id);
        results[idx] = {
          ...img,
          id: String(idx),
          originalUrl: dataUrls[idx] ?? img.originalUrl,
        };
      }
      completed += chunk.length;
      onProgress?.({ completed, total: dataUrls.length, currentIndex: chunkStart });
    } catch {
      chunk.forEach((url, i) => {
        const idx = chunkStart + i;
        results[idx] = {
          id: String(idx),
          originalUrl: dataUrls[idx]!,
          processedUrl: dataUrls[idx]!,
          studioApplied: false,
        };
      });
      completed += chunk.length;
    }
  }

  return results.map((r, i) => r ?? {
    id: String(i),
    originalUrl: dataUrls[i]!,
    processedUrl: dataUrls[i]!,
    studioApplied: false,
  });
}
