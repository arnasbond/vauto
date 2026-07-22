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
 * Used only to pick compression quality — NEVER to drop from the vision payload.
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
 * Prepare chat photos for the agent wire.
 *
 * ZERO PRE-FILTERING: every attached file (cars + tech passport) is returned
 * in both listingImageUrls and agentVisionUrls. Public-gallery stripping of
 * documents happens ONLY after Gemini Vision on the server/state layer.
 *
 * Sequential loops keep peak memory low (never Promise.all on heavy canvas work).
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

  const listingImageUrls: string[] = [];
  for (const url of unique) {
    try {
      const compressed = await compressForAgentBatch(url);
      if (compressed) listingImageUrls.push(compressed);
    } catch {
      if (url) listingImageUrls.push(url);
    }
  }

  const suspectedDocumentUrls: string[] = [];
  const agentVisionUrls: string[] = [];
  for (const url of listingImageUrls) {
    try {
      if (isHttpUrl(url)) {
        agentVisionUrls.push(url);
        continue;
      }
      const isDoc = await looksLikeDocumentDataUrl(url);
      if (isDoc) suspectedDocumentUrls.push(url);
      const vision = isDoc
        ? await compressForAgentDocumentVision(url)
        : await compressForAgentVisionWire(url);
      if (vision) agentVisionUrls.push(vision);
    } catch {
      agentVisionUrls.push(url);
    }
  }

  // Docs first so chunked Gemini OCR sees the passport early — still ALL files.
  const ban = new Set(suspectedDocumentUrls);
  const docsFirst = [
    ...agentVisionUrls.filter((u) => ban.has(u)),
    ...agentVisionUrls.filter((u) => !ban.has(u)),
  ];
  const visionAll = selectAgentVisionUrls(docsFirst);

  return {
    // Full set for session + wire — no client-side gallery ban.
    listingImageUrls: selectAgentVisionUrls(listingImageUrls),
    agentVisionUrls: visionAll,
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
