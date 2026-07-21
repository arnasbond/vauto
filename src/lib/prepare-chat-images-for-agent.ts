import { compressDataUrl } from "@/lib/native-media";

/** Max data-URL images on the agent stream wire (keeps Render under timeout). */
export const AGENT_VISION_MAX_DATA_IMAGES = 1;

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

/** Ultra-small vision payload for /api/vauto-agent/stream only. */
export async function compressForAgentVisionWire(
  dataUrl: string
): Promise<string> {
  if (!dataUrl.startsWith("data:image")) return dataUrl;
  return compressDataUrl(dataUrl, {
    maxDim: 480,
    quality: 0.5,
    maxChars: 18_000,
    force: true,
  });
}

function isHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url.trim());
}

/**
 * Prepare chat photos for listing + agent:
 * 1) canvas-compress every photo for the local gallery / publish draft
 * 2) build a tiny 1-image vision subset for the agent stream (never 6 data URLs)
 */
export async function prepareChatImagesForAgent(rawUrls: string[]): Promise<{
  listingImageUrls: string[];
  agentVisionUrls: string[];
}> {
  const unique = [...new Set(rawUrls.filter(Boolean))].slice(0, 6);
  if (!unique.length) return { listingImageUrls: [], agentVisionUrls: [] };

  const listingImageUrls = (
    await Promise.all(unique.map((url) => compressForAgentBatch(url)))
  ).filter(Boolean);

  const visionSource = listingImageUrls.find((u) => u.startsWith("data:image"))
    ?? listingImageUrls[0];
  const agentVisionUrls: string[] = [];
  if (visionSource) {
    if (isHttpUrl(visionSource)) {
      agentVisionUrls.push(visionSource);
    } else {
      agentVisionUrls.push(await compressForAgentVisionWire(visionSource));
    }
  }

  return {
    listingImageUrls,
    agentVisionUrls: selectAgentVisionUrls(agentVisionUrls),
  };
}

/** Prefer http URLs (tiny); otherwise send only a small data-URL vision subset. */
export function selectAgentVisionUrls(urls: string[]): string[] {
  if (!urls.length) return [];
  const http = urls.filter(isHttpUrl);
  if (http.length) return http.slice(0, 6);
  const data = urls.filter((u) => u.startsWith("data:"));
  return data.slice(0, AGENT_VISION_MAX_DATA_IMAGES);
}
