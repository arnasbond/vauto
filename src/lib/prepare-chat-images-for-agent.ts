import { compressDataUrl } from "@/lib/native-media";

/** Max images on the agent stream wire (full single Gemini context). */
export const AGENT_VISION_MAX_DATA_IMAGES = 10;

/** Listing / car photos — keep POST payload under Express 50mb for ≤10 images. */
const LISTING_PHOTO_MAX_DIM = 1600;
const LISTING_PHOTO_QUALITY = 0.8;
const LISTING_PHOTO_MAX_CHARS = 520_000;

/**
 * Tech passport / registration OCR — preserve fine print (kW, VIN, model variants).
 * Prefer native resolution; only downscale when over budget, never below minDim.
 */
const DOCUMENT_PHOTO_MAX_DIM = 2800;
const DOCUMENT_PHOTO_MIN_DIM = 2200;
const DOCUMENT_PHOTO_QUALITY = 0.95;
const DOCUMENT_PHOTO_MAX_CHARS = 2_800_000;

/**
 * Pre-resize listing / car photos before Base64 wire encoding.
 * Max 1600px, JPEG quality 0.8.
 */
export async function compressForAgentBatch(dataUrl: string): Promise<string> {
  if (!dataUrl.startsWith("data:image")) return dataUrl;
  return compressDataUrl(dataUrl, {
    maxDim: LISTING_PHOTO_MAX_DIM,
    quality: LISTING_PHOTO_QUALITY,
    maxChars: LISTING_PHOTO_MAX_CHARS,
    force: true,
  });
}

/**
 * Product-car vision wire — same budget as batch pre-resize.
 */
export async function compressForAgentVisionWire(
  dataUrl: string
): Promise<string> {
  return compressForAgentBatch(dataUrl);
}

/**
 * Tech passport / document OCR — up to 2800px @ JPEG 0.95.
 * Skip re-encode when already under budget so native detail survives.
 */
export async function compressForAgentDocumentVision(
  dataUrl: string
): Promise<string> {
  if (!dataUrl.startsWith("data:image")) return dataUrl;
  return compressDataUrl(dataUrl, {
    maxDim: DOCUMENT_PHOTO_MAX_DIM,
    minDim: DOCUMENT_PHOTO_MIN_DIM,
    quality: DOCUMENT_PHOTO_QUALITY,
    maxChars: DOCUMENT_PHOTO_MAX_CHARS,
    force: false,
  });
}

function isHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url.trim());
}

/**
 * Heuristic: Lithuanian tech passport is green / paper-like.
 * Used only to pick OCR compression budget — NEVER to drop from the wire.
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
 * Compress for vision: documents ≤2800/0.95 (OCR); cars ≤1600/0.8.
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
 * Prepare chat photos for the agent wire.
 *
 * - Passports: ≤2800px @ JPEG 0.95 (OCR-sharp fine print).
 * - Cars: ≤1600px @ JPEG 0.8.
 * - ALL files sent together in one Gemini context (up to 10). Gallery strip post-Vision.
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
        const compressed = await compressForAgentDocumentVision(url);
        suspectedDocumentUrls.push(compressed);
        prepared.push(compressed);
      } else {
        prepared.push(await compressForAgentBatch(url));
      }
    } catch {
      // Last-resort: still try listing budget so a huge original never hits the wire.
      try {
        prepared.push(await compressForAgentBatch(url));
      } catch {
        prepared.push(url);
      }
    }
  }

  const ban = new Set(suspectedDocumentUrls);
  // Docs first = primary/ground-truth OCR sources in the single Gemini context.
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
 * Keep ALL attached media for Gemini Vision (http + data), up to 10.
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
