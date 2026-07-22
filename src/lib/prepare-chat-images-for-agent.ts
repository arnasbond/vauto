import { compressDataUrl } from "@/lib/native-media";

/** Max images on the agent stream wire (all session photos). */
export const AGENT_VISION_MAX_DATA_IMAGES = 6;

/**
 * Light web optimize for car / product photos only (never documents).
 * Max 1920px, high quality — conserves memory without crushing detail.
 */
export async function compressForAgentBatch(dataUrl: string): Promise<string> {
  if (!dataUrl.startsWith("data:image")) return dataUrl;
  return compressDataUrl(dataUrl, {
    maxDim: 1920,
    quality: 0.88,
    maxChars: 900_000,
    force: true,
  });
}

/**
 * Product-car vision wire — light optimize (same budget as batch).
 */
export async function compressForAgentVisionWire(
  dataUrl: string
): Promise<string> {
  return compressForAgentBatch(dataUrl);
}

/**
 * Tech passport / document OCR — FULL ORIGINAL RESOLUTION.
 * Never compress, downscale, or re-encode documents.
 */
export async function compressForAgentDocumentVision(
  dataUrl: string
): Promise<string> {
  return dataUrl;
}

function isHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url.trim());
}

/**
 * Heuristic: Lithuanian tech passport is green / paper-like.
 * Used only to mark docs as primary OCR sources — NEVER to drop from the wire.
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
          if (g > r + 18 && g > b + 10 && g > 70) greenish += 1;
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
 * Compress for vision: documents stay FULL original; cars get light 1920px optimize.
 */
export async function compressForAgentVisionSmart(
  dataUrl: string
): Promise<string> {
  if (!dataUrl.startsWith("data:image")) return dataUrl;
  const isDoc = await looksLikeDocumentDataUrl(dataUrl);
  return isDoc ? dataUrl : compressForAgentVisionWire(dataUrl);
}

/**
 * Prepare chat photos for the agent wire.
 *
 * - Passports: FULL original resolution (ground-truth OCR).
 * - Cars: light ≤1920px optimize.
 * - ALL files sent (zero pre-filter). Gallery strip happens post-Vision on server.
 * Sequential loops — never Promise.all on heavy canvas work.
 */
export async function prepareChatImagesForAgent(rawUrls: string[]): Promise<{
  listingImageUrls: string[];
  agentVisionUrls: string[];
  suspectedDocumentUrls: string[];
}> {
  const unique = [...new Set(rawUrls.filter(Boolean))].slice(
    0,
    AGENT_VISION_MAX_DATA_IMAGES
  );
  if (!unique.length) {
    return { listingImageUrls: [], agentVisionUrls: [], suspectedDocumentUrls: [] };
  }

  // Detect documents on ORIGINAL bytes before any car optimize.
  const suspectedDocumentUrls: string[] = [];
  const prepared: string[] = [];
  for (const url of unique) {
    try {
      if (isHttpUrl(url)) {
        prepared.push(url);
        continue;
      }
      const isDoc = await looksLikeDocumentDataUrl(url);
      if (isDoc) {
        suspectedDocumentUrls.push(url);
        prepared.push(url); // full original — never compress
      } else {
        prepared.push(await compressForAgentBatch(url));
      }
    } catch {
      prepared.push(url);
    }
  }

  const ban = new Set(suspectedDocumentUrls);
  // Docs first = primary/ground-truth tech sources for chunked Gemini OCR.
  const docsFirst = [
    ...prepared.filter((u) => ban.has(u)),
    ...prepared.filter((u) => !ban.has(u)),
  ];
  const all = selectAgentVisionUrls(docsFirst);

  return {
    listingImageUrls: all,
    agentVisionUrls: all,
    suspectedDocumentUrls,
  };
}

/**
 * Keep ALL attached media for Gemini Vision (http + data), up to 6.
 * Never drop data-URL tech passports when some cars are already http.
 */
export function selectAgentVisionUrls(urls: string[]): string[] {
  if (!urls.length) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of urls) {
    const u = String(raw ?? "").trim();
    if (!u || seen.has(u)) continue;
    if (!isHttpUrl(u) && !u.startsWith("data:")) continue;
    seen.add(u);
    out.push(u);
    if (out.length >= AGENT_VISION_MAX_DATA_IMAGES) break;
  }
  return out;
}
