import sharp from "sharp";
import { logProductionError, logProductionWarn } from "../lib/production-log.js";

/** Neutral automotive showroom backdrop — soft cool gray gradient. */
export const AUTOMOTIVE_STUDIO_BG = "#F0F1F3";

export function isPhotoroomConfigured(): boolean {
  return Boolean(process.env.PHOTOROOM_API_KEY?.trim());
}

/** PhotoRoom segment API — removes background, applies studio color. */
export async function photoroomSegment(imageBytes: Buffer): Promise<Buffer> {
  const key = process.env.PHOTOROOM_API_KEY?.trim();
  if (!key) throw new Error("PHOTOROOM_API_KEY not configured");

  const form = new FormData();
  form.append("image_file", new Blob([imageBytes]), "upload.jpg");
  form.append("bg_color", AUTOMOTIVE_STUDIO_BG);
  form.append("format", "png");
  form.append("size", "full");

  const res = await fetch("https://sdk.photoroom.com/v1/segment", {
    method: "POST",
    headers: { "x-api-key": key },
    body: form,
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`PhotoRoom HTTP ${res.status}: ${text.slice(0, 120)}`);
  }

  return Buffer.from(await res.arrayBuffer());
}

/** Refine PhotoRoom output with showroom gradient + WebP for fast delivery. */
export async function applyAutomotiveStudioFinish(pngBytes: Buffer): Promise<Buffer> {
  const meta = await sharp(pngBytes).metadata();
  const width = meta.width ?? 1280;
  const height = meta.height ?? 960;

  const gradientSvg = Buffer.from(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="studio" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#E8EAEE"/>
          <stop offset="50%" stop-color="#F3F4F6"/>
          <stop offset="100%" stop-color="#FAFBFC"/>
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#studio)"/>
    </svg>`
  );

  return sharp(gradientSvg)
    .resize(width, height, { fit: "fill" })
    .composite([{ input: pngBytes, gravity: "centre" }])
    .resize({
      width: 1600,
      height: 1600,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 82, effort: 4 })
    .toBuffer();
}

export function listingImageBytesToDataUrl(buffer: Buffer, mime = "image/webp"): string {
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

/** Full listing photo pipeline: PhotoRoom BG → automotive studio → WebP. */
export async function processListingPhotoWithPhotoroom(
  imageBytes: Buffer
): Promise<{ dataUrl: string; provider: "photoroom" }> {
  const segmented = await photoroomSegment(imageBytes);
  const finished = await applyAutomotiveStudioFinish(segmented);
  return {
    dataUrl: listingImageBytesToDataUrl(finished),
    provider: "photoroom",
  };
}

export async function safeProcessListingPhoto(
  imageBytes: Buffer,
  fallbackDataUrl: string
): Promise<{ dataUrl: string; provider: "photoroom" | "none"; ok: boolean }> {
  if (!isPhotoroomConfigured()) {
    return { dataUrl: fallbackDataUrl, provider: "none", ok: false };
  }
  try {
    const result = await processListingPhotoWithPhotoroom(imageBytes);
    return { ...result, ok: true };
  } catch (err) {
    logProductionWarn("photoroom", "Studio processing failed — using original", {
      error: err instanceof Error ? err.message : String(err),
    });
    logProductionError("photoroom", err);
    return { dataUrl: fallbackDataUrl, provider: "none", ok: false };
  }
}
