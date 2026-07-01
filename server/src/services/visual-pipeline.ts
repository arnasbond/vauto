/**
 * Visual AI Pipeline — v1.6.17
 *
 * Vienas įėjimas visam nuotraukų konvejeriui:
 *   POST /api/ai/visual-pipeline  (planuojama)
 *   arba vidinis kvietimas iš /extract-image prieš Gemini extract.
 *
 * @see ./visual-pipeline/orchestrator.ts
 */
export { runVisualPipeline } from "./visual-pipeline/orchestrator.js";
export {
  runVisualPipelineForExtract,
  imagesAfterPipeline,
  mergePipelineIntoListingFields,
  visualPipelineResponseSlice,
} from "./visual-pipeline/extract-bridge.js";
export { visualPipelineFeatures, resolveBackgroundRemovalProvider, resolveOcrProvider } from "./visual-pipeline/features.js";
export type {
  VisualPipelineResult,
  VisualPipelineOptions,
  VisualPipelineFeatures,
  VisualPipelineImageInput,
  DamageDetectionResult,
  OcrPipelineResult,
  SmartSortResult,
  BackgroundRemovalResult,
  PhotoAngleTag,
} from "./visual-pipeline/types.js";
