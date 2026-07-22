import { compressDataUrl } from "@/lib/native-media";

/** Max images on the agent stream wire (all session photos). */
export const AGENT_VISION_MAX_DATA_IMAGES = 6;

/**
 * Listing gallery compress — keeps all 6 usable locally for publish,
 * without needing a remote media round-trip first.
 */
export async function compressForAgentBatch(dataUrl: string): Promise<string> {
  if (!dataUrl.startsWith("data:image")) return dataUrl;
  return compressDataUrl(dataUrl, {
    maxDim: 720,
    quality: 0.62,
    maxChars: 48_000,
    force: true,
  });
}

/**
 * Product-car vision thumb — small enough for Gemini TPM on multi-photo turns.
 */
export async function compressForAgentVisionWire(
  dataUrl: string
): Promise<string> {
  if (!dataUrl.startsWith("data:image")) return dataUrl;
  return compressDataUrl(dataUrl, {
    maxDim: 640,
    quality: 0.55,
    maxChars: 48_000,
    force: true,
  });
}

/**
 * Tech passport / document OCR — high resolution so fine field codes stay readable.
 * Lithuanian registration certificate (žalias tech passport) needs crisp text for A/B/D.3/P.1/P.3.
 */
export async function compressForAgentDocumentVision(
  dataUrl: string
): Promise<string> {
  if (!dataUrl.startsWith("data:image")) return dataUrl;
  return compressDataUrl(dataUrl, {
    maxDim: 1600,
    quality: 0.88,
    maxChars: 320_000,
    force: true,
  });
}

function isHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url.trim());
}

/**
 * Heuristic: Lithuanian tech passport is green / paper-like.
 * Sample a downscaled canvas for green dominance or near-white document paper.
 */
export async function looksLikeDocumentDataUrl(dataUrl: string): Promise<boolean> {
  if (typeof document === "undefined" || !dataUrl.startsWith("data:image")) {
    return false;
  }
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const w = 48;
        const h = Math.max(1, Math.round((img.height / Math.max(img.width, 1)) * w));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) {
          resolve(false);
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        const { data } = ctx.getImageData(0, 0, w, h);
        let greenish = 0;
        let paperish = 0;
        let total = 0;
        for (let i = 0; i < data.length; i += 16) {
          const r = data[i] ?? 0;
          const g = data[i + 1] ?? 0;
          const b = data[i + 2] ?? 0;
          total += 1;
          // Green certificate body (LT tech passport)
          if (g > r + 18 && g > b + 10 && g > 70) greenish += 1;
          // Pale paper / form
          if (r > 200 && g > 200 && b > 190 && Math.abs(r - g) < 25) paperish += 1;
        }
        const greenRatio = total ? greenish / total : 0;
        const paperRatio = total ? paperish / total : 0;
        resolve(greenRatio >= 0.12 || paperRatio >= 0.45);
      } catch {
        resolve(false);
      }
    };
    img.onerror = () => resolve(false);
    img.src = dataUrl;
  });
}

/**
 * Compress for vision: documents stay high-res; product photos stay smaller.
 */
export async function compressForAgentVisionSmart(
  dataUrl: string
): Promise<string> {
  if (!dataUrl.startsWith("data:image")) return dataUrl;
  const isDoc = await looksLikeDocumentDataUrl(dataUrl);
  return isDoc
    ? compressForAgentDocumentVision(dataUrl)
    : compressForAgentVisionWire(dataUrl);
}

/**
 * Prepare chat photos for listing + agent:
 * 1) canvas-compress every photo for the local gallery / publish draft
 * 2) smart-compress for agent stream (documents high-res, cars smaller)
 */
export async function prepareChatImagesForAgent(rawUrls: string[]): Promise<{
  listingImageUrls: string[];
  agentVisionUrls: string[];
  suspectedDocumentUrls: string[];
}> {
  const unique = [...new Set(rawUrls.filter(Boolean))].slice(0, 6);
  if (!unique.length) {
    return { listingImageUrls: [], agentVisionUrls: [], suspectedDocumentUrls: [] };
  }

  const listingImageUrls = (
    await Promise.all(unique.map((url) => compressForAgentBatch(url)))
  ).filter(Boolean);

  const suspectedDocumentUrls: string[] = [];
  const agentVisionUrls = (
    await Promise.all(
      listingImageUrls.map(async (url) => {
        if (isHttpUrl(url)) return url;
        const isDoc = await looksLikeDocumentDataUrl(url);
        if (isDoc) suspectedDocumentUrls.push(url);
        return isDoc
          ? compressForAgentDocumentVision(url)
          : compressForAgentVisionWire(url);
      })
    )
  ).filter(Boolean);

  // Public gallery never includes suspected tech passport / document frames.
  const ban = new Set(suspectedDocumentUrls);
  const publicListingUrls = listingImageUrls.filter((u) => !ban.has(u));

  return {
    listingImageUrls: publicListingUrls.length ? publicListingUrls : listingImageUrls.filter((u) => !ban.has(u)),
    agentVisionUrls: selectAgentVisionUrls(agentVisionUrls),
    suspectedDocumentUrls,
  };
}

/** Prefer http URLs (tiny); otherwise send compressed data URLs (up to 6). */
export function selectAgentVisionUrls(urls: string[]): string[] {
  if (!urls.length) return [];
  const http = urls.filter(isHttpUrl);
  if (http.length) return http.slice(0, 6);
  const data = urls.filter((u) => u.startsWith("data:"));
  return data.slice(0, AGENT_VISION_MAX_DATA_IMAGES);
}
