/** Visual AI Pipeline — bendri tipai (v1.6.17). */

export type VisualPipelineStage =
  | "background_removal"
  | "ocr"
  | "damage_detection"
  | "smart_sort"
  | "vision_extract";

export type BackgroundRemovalProvider = "photoroom" | "clipdrop" | "removebg" | "none";

export type OcrProvider = "google_vision" | "textract" | "tesseract" | "none";

export type PhotoAngleTag =
  | "hero_front"
  | "hero_side"
  | "hero_three_quarter"
  | "interior"
  | "detail"
  | "damage_closeup"
  | "label_sticker"
  | "document"
  | "tech_passport"
  | "receipt"
  | "other";

export interface VisualPipelineImageInput {
  /** Stable id per upload batch (0..n-1). */
  id: string;
  /** data: URL arba HTTPS. */
  sourceUrl: string;
  /** Po fono išvalymo (jei įjungta). */
  processedUrl?: string;
}

export interface OcrTextBlock {
  text: string;
  confidence: number;
  /** label | serial | model_code | price_tag | other */
  kind: "label" | "serial" | "model_code" | "price_tag" | "vin_plate" | "barcode" | "other";
}

export interface DamageFinding {
  type: "scratch" | "dent" | "crack" | "wear" | "rust" | "stain" | "other";
  severity: "minor" | "moderate" | "major";
  locationHint: string;
  confidence: number;
  includeInDescriptionSuggested: boolean;
}

export interface ClassifiedPhoto {
  id: string;
  url: string;
  angleTag: PhotoAngleTag;
  heroScore: number;
  sortIndex: number;
}

export interface VisualPipelineStageResult<T> {
  stage: VisualPipelineStage;
  ok: boolean;
  provider: string;
  durationMs: number;
  data?: T;
  error?: string;
  skipped?: boolean;
  skipReason?: string;
}

export interface BackgroundRemovalResult {
  images: Array<{
    id: string;
    originalUrl: string;
    processedUrl: string;
    studioApplied?: boolean;
  }>;
  provider: BackgroundRemovalProvider;
}

export interface OcrPipelineResult {
  blocks: OcrTextBlock[];
  mergedText: string;
  /** Modelio kodai, serijiniai nr., VIN fragmentai AI laukams. */
  extractedCodes: string[];
  provider: OcrProvider;
}

export interface DamageDetectionResult {
  findings: DamageFinding[];
  conditionHint: string;
  /** Formos būsena — asistentas mandagiai pasitikrina pokalbyje. */
  hasVisibleDefects: boolean;
  assistantPrompt?: string;
}

export interface SmartSortResult {
  ordered: ClassifiedPhoto[];
  coverImageId: string;
}

export interface VisionExtractResult {
  mergedText: string;
  extractedCodes: string[];
  vin?: string;
  plateNumber?: string;
  barcode?: string;
  modelCode?: string;
  confidence: number;
}

export interface VisualPipelineOptions {
  category?: string;
  listingTitle?: string;
  /** Fono išvalymas (default: true jei provider sukonfigūruotas). */
  removeBackground?: boolean;
  /** OCR (default: true jei provider sukonfigūruotas). */
  runOcr?: boolean;
  /** Defektų detekcija (default: true su Gemini). */
  detectDamage?: boolean;
  /** Galerijos rūšiavimas (default: true su Gemini). */
  smartSort?: boolean;
}

export interface VisualPipelineResult {
  ok: boolean;
  durationMs: number;
  images: VisualPipelineImageInput[];
  coverImageId: string;
  orderedImageUrls: string[];
  backgroundRemoval?: VisualPipelineStageResult<BackgroundRemovalResult>;
  ocr?: VisualPipelineStageResult<OcrPipelineResult>;
  visionExtract?: VisualPipelineStageResult<VisionExtractResult>;
  damage?: VisualPipelineStageResult<DamageDetectionResult>;
  smartSort?: VisualPipelineStageResult<SmartSortResult>;
  /** Tekstas techniniam aprašymui (OCR + defektai). */
  technicalDescriptionDraft?: string;
  /** Draft attribute hints Vision + OCR. */
  attributeHints: Record<string, string>;
  /** Pokalbio UI — mandagus defektų patikslinimas. */
  conversationalHints?: {
    hasVisibleDefects: boolean;
    assistantPrompt?: string;
    isDamageVerified?: boolean;
  };
}

export interface VisualPipelineFeatures {
  backgroundRemoval: BackgroundRemovalProvider;
  ocr: OcrProvider;
  visionExtract: boolean;
  damageDetection: boolean;
  smartSort: boolean;
}
