import type { BackgroundRemovalProvider, OcrProvider, VisualPipelineFeatures } from "./types.js";

export function resolveBackgroundRemovalProvider(): BackgroundRemovalProvider {
  if (process.env.PHOTOROOM_API_KEY?.trim()) return "photoroom";
  if (process.env.CLIPDROP_API_KEY?.trim()) return "clipdrop";
  if (process.env.REMOVEBG_API_KEY?.trim()) return "removebg";
  return "none";
}

export function resolveOcrProvider(): OcrProvider {
  if (process.env.GOOGLE_CLOUD_VISION_CREDENTIALS_JSON?.trim()) return "google_vision";
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()) return "google_vision";
  if (
    process.env.AWS_ACCESS_KEY_ID?.trim() &&
    process.env.AWS_SECRET_ACCESS_KEY?.trim()
  ) {
    return "textract";
  }
  // Local tesseract is opt-in — avoids 30–60s server hangs when no cloud OCR is configured.
  if (process.env.TESSERACT_OCR_ENABLED === "1") return "tesseract";
  return "none";
}

export function visualPipelineFeatures(): VisualPipelineFeatures {
  const bg = resolveBackgroundRemovalProvider();
  const ocr = resolveOcrProvider();
  return {
    backgroundRemoval: bg,
    ocr,
    damageDetection: Boolean(process.env.GEMINI_API_KEY?.trim() || process.env.AI_KEY?.trim()),
    smartSort: Boolean(process.env.GEMINI_API_KEY?.trim() || process.env.AI_KEY?.trim()),
  };
}
