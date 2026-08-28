/**
 * Dev E2E: load real Citroën test photos and push them through the normal
 * agent Vision path (pendingImageUrls → scanListingPhotos → PrePublish).
 * Avoids OS file dialog / hung CDP HTMLInputElement hooks.
 */
import { compressForAiVision } from "@/lib/native-media";

/** c1 = tech pasas; c2–c9 = vehicle photos (6 cars + doc = 7). */
export const E2E_CITROEN_FILES = [
  "c1.png",
  "c2.png",
  "c5.png",
  "c6.png",
  "c7.png",
  "c8.png",
  "c9.png",
] as const;

export const E2E_CITROEN_LISTING_MESSAGE =
  "Naujas skelbimas: parduodu Citroën C4 Picasso, 2.0 HDi, 2007 m., 7 vietų, Prienai. Kaina 2250€.";

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error ?? new Error("FileReader failed"));
    reader.readAsDataURL(blob);
  });
}

/** Fetch real PNGs from public/e2e-citroen and compress for Vision. */
export async function loadE2eCitroenPendingImageUrls(): Promise<string[]> {
  const urls: string[] = [];
  for (const name of E2E_CITROEN_FILES) {
    const res = await fetch(`/e2e-citroen/${name}`);
    if (!res.ok) throw new Error(`Missing E2E photo ${name} (${res.status})`);
    const dataUrl = await blobToDataUrl(await res.blob());
    const compressed = await compressForAiVision(dataUrl);
    if (compressed) urls.push(compressed);
  }
  return urls;
}
