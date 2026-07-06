import { fetchImageBytes } from "../image-bytes.js";
import { logProductionWarn } from "../../../lib/production-log.js";
import {
  isPhotoroomConfigured,
  listingImageBytesToDataUrl,
  safeProcessListingPhoto,
} from "../../photoroom.js";
import { removeBackgroundClipdrop, removeBackgroundRemoveBg } from "./background-removal-fallback.js";
import type {
  BackgroundRemovalProvider,
  BackgroundRemovalResult,
  VisualPipelineImageInput,
} from "../types.js";

const FALLBACK_STUDIO_BG = "#F0F1F3";

async function processWithFallbackProvider(
  imageBytes: Buffer,
  provider: Exclude<BackgroundRemovalProvider, "photoroom" | "none">
): Promise<Buffer> {
  if (provider === "clipdrop") return removeBackgroundClipdrop(imageBytes);
  return removeBackgroundRemoveBg(imageBytes);
}

async function processOneImage(
  img: VisualPipelineImageInput,
  provider: BackgroundRemovalProvider
): Promise<BackgroundRemovalResult["images"][number]> {
  const sourceUrl = img.processedUrl ?? img.sourceUrl;
  try {
    const bytes = await fetchImageBytes(sourceUrl);

    if (provider === "photoroom" && isPhotoroomConfigured()) {
      const result = await safeProcessListingPhoto(bytes, sourceUrl);
      return {
        id: img.id,
        originalUrl: img.sourceUrl,
        processedUrl: result.dataUrl,
        studioApplied: result.ok,
      };
    }

    if (provider === "clipdrop" || provider === "removebg") {
      const cleaned = await processWithFallbackProvider(bytes, provider);
      const { optimizeListingImageBuffer } = await import("../../../ai/image-processor.js");
      const optimized = await optimizeListingImageBuffer(cleaned);
      return {
        id: img.id,
        originalUrl: img.sourceUrl,
        processedUrl: listingImageBytesToDataUrl(optimized),
        studioApplied: true,
      };
    }

    return {
      id: img.id,
      originalUrl: img.sourceUrl,
      processedUrl: sourceUrl,
      studioApplied: false,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logProductionWarn("visual-pipeline", "Background removal failed for image — using original", {
      imageId: img.id,
      provider,
      error: msg,
    });
    return {
      id: img.id,
      originalUrl: img.sourceUrl,
      processedUrl: sourceUrl,
      studioApplied: false,
    };
  }
}

/** Process images in parallel (concurrency-limited) for faster multi-photo uploads. */
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
        studioApplied: false,
      })),
    };
  }

  const concurrency = Math.min(3, Math.max(1, images.length));
  const out: BackgroundRemovalResult["images"] = new Array(images.length);
  let cursor = 0;

  async function worker() {
    while (cursor < images.length) {
      const index = cursor++;
      const img = images[index]!;
      out[index] = await processOneImage(img, provider);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  return { provider, images: out };
}

export { FALLBACK_STUDIO_BG };
