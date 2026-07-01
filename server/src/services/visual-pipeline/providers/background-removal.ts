import { logProductionWarn } from "../../../lib/production-log.js";
import { fetchImageBytes } from "../image-bytes.js";
import type {
  BackgroundRemovalProvider,
  BackgroundRemovalResult,
  VisualPipelineImageInput,
} from "../types.js";

const STUDIO_BG = "#FFFFFF";

async function removeBackgroundPhotoroom(imageBytes: Buffer): Promise<Buffer> {
  const key = process.env.PHOTOROOM_API_KEY?.trim();
  if (!key) throw new Error("PHOTOROOM_API_KEY not configured");

  const form = new FormData();
  form.append("image_file", new Blob([imageBytes]), "upload.jpg");
  form.append("bg_color", STUDIO_BG);
  form.append("format", "png");

  const res = await fetch("https://sdk.photoroom.com/v1/segment", {
    method: "POST",
    headers: { "x-api-key": key },
    body: form,
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) throw new Error(`Photoroom HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function removeBackgroundClipdrop(imageBytes: Buffer): Promise<Buffer> {
  const key = process.env.CLIPDROP_API_KEY?.trim();
  if (!key) throw new Error("CLIPDROP_API_KEY not configured");

  const form = new FormData();
  form.append("image_file", new Blob([imageBytes]), "upload.jpg");
  form.append("bg_color", STUDIO_BG);

  const res = await fetch("https://clipdrop-api.co/remove-background/v1", {
    method: "POST",
    headers: { "x-api-key": key },
    body: form,
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) throw new Error(`Clipdrop HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function removeBackgroundRemoveBg(imageBytes: Buffer): Promise<Buffer> {
  const key = process.env.REMOVEBG_API_KEY?.trim();
  if (!key) throw new Error("REMOVEBG_API_KEY not configured");

  const form = new FormData();
  form.append("image_file", new Blob([imageBytes]), "upload.jpg");
  form.append("bg_color", STUDIO_BG);
  form.append("size", "auto");

  const res = await fetch("https://api.remove.bg/v1.0/removebg", {
    method: "POST",
    headers: { "X-Api-Key": key },
    body: form,
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) throw new Error(`remove.bg HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

function toDataUrlPng(bytes: Buffer): string {
  return `data:image/png;base64,${bytes.toString("base64")}`;
}

export async function runBackgroundRemoval(
  images: VisualPipelineImageInput[],
  provider: BackgroundRemovalProvider
): Promise<BackgroundRemovalResult> {
  if (provider === "none") {
    return {
      provider,
      images: images.map((img) => ({
        id: img.id,
        originalUrl: img.sourceUrl,
        processedUrl: img.sourceUrl,
      })),
    };
  }

  const removeFn =
    provider === "photoroom"
      ? removeBackgroundPhotoroom
      : provider === "clipdrop"
        ? removeBackgroundClipdrop
        : removeBackgroundRemoveBg;

  const out: BackgroundRemovalResult["images"] = [];
  for (const img of images) {
    const sourceUrl = img.processedUrl ?? img.sourceUrl;
    try {
      const bytes = await fetchImageBytes(sourceUrl);
      const cleaned = await removeFn(bytes);
      out.push({
        id: img.id,
        originalUrl: img.sourceUrl,
        processedUrl: toDataUrlPng(cleaned),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logProductionWarn("visual-pipeline", "Background removal failed for image — using original", {
        imageId: img.id,
        provider,
        error: msg,
      });
      out.push({
        id: img.id,
        originalUrl: img.sourceUrl,
        processedUrl: sourceUrl,
      });
    }
  }

  return { provider, images: out };
}
