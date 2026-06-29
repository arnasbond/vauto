import sharp from "sharp";

/** Convert upstream image bytes to WebP for mobile data savings. */
export async function optimizeProxyImageToWebp(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .rotate()
    .resize({ width: 1200, height: 1200, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 75 })
    .toBuffer();
}
