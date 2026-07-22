import sharp from "sharp";

function parseDataUrl(dataUrl: string): { buffer: Buffer; mime: string } {
  const match = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl.trim());
  if (!match) {
    throw new Error("Invalid data URL");
  }
  return {
    mime: match[1]!,
    buffer: Buffer.from(match[2]!, "base64"),
  };
}

function toDataUrl(buffer: Buffer, mime = "image/webp"): string {
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

function listingOutputFormat(): "webp" | "jpeg" {
  const raw = process.env.LISTING_IMAGE_FORMAT?.trim().toLowerCase();
  return raw === "jpeg" || raw === "jpg" ? "jpeg" : "webp";
}

function encodeListingImage(sharpInstance: sharp.Sharp): Promise<Buffer> {
  if (listingOutputFormat() === "jpeg") {
    return sharpInstance.jpeg({ quality: 86, mozjpeg: true }).toBuffer();
  }
  return sharpInstance.webp({ quality: 82, effort: 4 }).toBuffer();
}

/** Optimize raw image bytes for listing storage (WebP by default). */
export async function optimizeListingImageBuffer(buffer: Buffer): Promise<Buffer> {
  const pipeline = sharp(buffer)
    .rotate()
    .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true });
  return encodeListingImage(pipeline);
}

export function listingImageMime(): string {
  return listingOutputFormat() === "jpeg" ? "image/jpeg" : "image/webp";
}

function buildWatermarkSvg(width: number, height: number, listingId: string): Buffer {
  const shortId = listingId.replace(/^l-/, "").slice(-8) || listingId.slice(0, 8);
  const fontSize = Math.max(14, Math.round(Math.min(width, height) * 0.035));
  const pad = Math.round(fontSize * 0.6);
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="wm" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="rgba(255,255,255,0.55)"/>
      <stop offset="100%" stop-color="rgba(255,255,255,0.25)"/>
    </linearGradient>
  </defs>
  <text x="${width / 2}" y="${height / 2}" transform="rotate(-24 ${width / 2} ${height / 2})"
    text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="${fontSize * 2.2}"
    font-weight="700" fill="url(#wm)" opacity="0.35">VAUTO</text>
  <rect x="${width - 220 - pad}" y="${height - fontSize * 2.2 - pad}" width="220" height="${fontSize * 2}"
    rx="6" fill="rgba(0,0,0,0.45)"/>
  <text x="${width - pad - 8}" y="${height - pad - fontSize * 0.35}" text-anchor="end"
    font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="600"
    fill="rgba(255,255,255,0.92)">VAUTO · ${shortId}</text>
</svg>`;
  return Buffer.from(svg);
}

/**
 * Dinaminis VAUTO vandens ženklas + listing ID prieš saugyklą.
 */
export async function applyVautoWatermark(
  imageDataUrl: string,
  listingId: string
): Promise<string> {
  if (!imageDataUrl.startsWith("data:image")) {
    return imageDataUrl;
  }

  const { buffer } = parseDataUrl(imageDataUrl);
  const meta = await sharp(buffer).metadata();
  const width = meta.width ?? 1280;
  const height = meta.height ?? 960;

  const watermark = buildWatermarkSvg(width, height, listingId);
  const output = await encodeListingImage(
    sharp(buffer).rotate().composite([{ input: watermark, blend: "over" }])
  );

  return toDataUrl(output, listingImageMime());
}

export async function optimizeListingImage(imageDataUrl: string): Promise<string> {
  if (!imageDataUrl.startsWith("data:image")) return imageDataUrl;
  const { buffer } = parseDataUrl(imageDataUrl);
  const output = await optimizeListingImageBuffer(buffer);
  return toDataUrl(output, listingImageMime());
}

/**
 * Detect LT tech passport (green) / pale registration paper from a small sample.
 * Product/car photos stay false → full color path.
 */
export async function looksLikeDocumentImageBuffer(buffer: Buffer): Promise<boolean> {
  try {
    const { data, info } = await sharp(buffer)
      .rotate()
      .resize(48, 48, { fit: "inside" })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const channels = Math.max(1, info.channels ?? 3);
    let greenish = 0;
    let paperish = 0;
    let total = 0;
    for (let i = 0; i + 2 < data.length; i += channels) {
      const r = data[i] ?? 0;
      const g = data[i + 1] ?? 0;
      const b = data[i + 2] ?? 0;
      total += 1;
      if (g > r + 18 && g > b + 10 && g > 70) greenish += 1;
      if (r > 200 && g > 200 && b > 190 && Math.abs(r - g) < 25) paperish += 1;
    }
    if (!total) return false;
    return greenish / total >= 0.12 || paperish / total >= 0.45;
  } catch {
    return false;
  }
}

/**
 * OCR prep for tech passport / registration documents:
 * grayscale (kill green paper noise) + contrast boost + sharpen for crisp text edges.
 */
export async function enhanceDocumentForOcr(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .rotate()
    .resize({
      width: 2000,
      height: 2000,
      fit: "inside",
      withoutEnlargement: false,
    })
    .grayscale()
    .normalize()
    .linear(1.28, -18)
    .sharpen({ sigma: 1.6, m1: 2.0, m2: 0.7 })
    .jpeg({ quality: 93, mozjpeg: true })
    .toBuffer();
}

export type PreparedVisionImage = {
  buffer: Buffer;
  mime: string;
  isDocument: boolean;
};

/**
 * Prepare a single image for Gemini Vision.
 * Documents → mono + contrast + sharpen (JPEG).
 * Product/car → original buffer unchanged (caller keeps original mime).
 */
export async function prepareImageForGeminiVision(
  buffer: Buffer,
  opts?: { forceDocument?: boolean; forceProduct?: boolean }
): Promise<PreparedVisionImage> {
  if (opts?.forceProduct) {
    return { buffer, mime: "image/jpeg", isDocument: false };
  }
  const isDocument =
    opts?.forceDocument === true || (await looksLikeDocumentImageBuffer(buffer));
  if (!isDocument) {
    return { buffer, mime: "image/jpeg", isDocument: false };
  }
  const enhanced = await enhanceDocumentForOcr(buffer);
  return { buffer: enhanced, mime: "image/jpeg", isDocument: true };
}
