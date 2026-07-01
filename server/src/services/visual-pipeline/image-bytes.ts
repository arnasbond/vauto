/** Shared image fetch for visual-pipeline providers. */

export async function fetchImageBytes(url: string): Promise<Buffer> {
  if (url.startsWith("data:")) {
    const base64 = url.split(",")[1] ?? "";
    return Buffer.from(base64, "base64");
  }
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`Image fetch failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

export function imageBytesToBase64(bytes: Buffer): string {
  return bytes.toString("base64");
}
