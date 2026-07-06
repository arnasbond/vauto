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
