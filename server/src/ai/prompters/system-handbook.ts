/**
 * VAUTO AI system handbook — positive factual directives only.
 * No hardcoded few-shot product examples (brand/model/city pollution).
 */

export type HandbookCategoryId =
  | "electronics"
  | "auto"
  | "music"
  | "art"
  | "realestate"
  | "services"
  | "jobs"
  | "publish";

export type HandbookPrompterId =
  | "auto"
  | "music"
  | "realestate"
  | "general"
  | "jobs"
  | "services";

export interface HandbookBenchmark {
  id: string;
  categoryId: HandbookCategoryId;
  title: string;
  inputContext: string;
  expectedAction: string;
  extractionPattern: string;
  generationPattern: string;
}

/** Shared first-principles directive for Pass 1 + Pass 2. */
export const FACTUAL_EXTRACTION_DIRECTIVE = `
Extract and structure ONLY the facts explicitly present in the provided images and user text.
If an attribute or location is not provided, leave the field null / omit it.
Do not hallucinate, invent, or default missing values (city, price, specs, condition extras).
Write natural, complete Lithuanian when generating sales copy — never leave empty template slots.
`.trim();

/** Empty suite — kept for API compatibility; few-shots intentionally removed. */
export const VAUTO_SYSTEM_HANDBOOK: HandbookBenchmark[] = [];

/** @deprecated Few-shots removed — stubs retained for import compatibility. */
export const BENCHMARK_ELECTRONICS_PEIKO: HandbookBenchmark = {
  id: "A",
  categoryId: "electronics",
  title: "Electronics",
  inputContext: "",
  expectedAction: FACTUAL_EXTRACTION_DIRECTIVE,
  extractionPattern: "",
  generationPattern: "",
};

/** @deprecated Few-shots removed — stubs retained for import compatibility. */
export const BENCHMARK_AUTO_REGITRA: HandbookBenchmark = {
  id: "B",
  categoryId: "auto",
  title: "Automotive",
  inputContext: "",
  expectedAction: FACTUAL_EXTRACTION_DIRECTIVE,
  extractionPattern: "",
  generationPattern: "",
};

/** @deprecated Few-shots removed — stubs retained for import compatibility. */
export const BENCHMARK_MUSIC_HOHNER: HandbookBenchmark = {
  id: "C",
  categoryId: "music",
  title: "Music",
  inputContext: "",
  expectedAction: FACTUAL_EXTRACTION_DIRECTIVE,
  extractionPattern: "",
  generationPattern: "",
};

/** @deprecated Few-shots removed — stubs retained for import compatibility. */
export const BENCHMARK_ART_PAINTING: HandbookBenchmark = {
  id: "D",
  categoryId: "art",
  title: "Art",
  inputContext: "",
  expectedAction: FACTUAL_EXTRACTION_DIRECTIVE,
  extractionPattern: "",
  generationPattern: "",
};

/** @deprecated Few-shots removed — stubs retained for import compatibility. */
export const BENCHMARK_REALESTATE_NT: HandbookBenchmark = {
  id: "E",
  categoryId: "realestate",
  title: "Real estate",
  inputContext: "",
  expectedAction: FACTUAL_EXTRACTION_DIRECTIVE,
  extractionPattern: "",
  generationPattern: "",
};

/** @deprecated Few-shots removed — stubs retained for import compatibility. */
export const BENCHMARK_SERVICES: HandbookBenchmark = {
  id: "F",
  categoryId: "services",
  title: "Services",
  inputContext: "",
  expectedAction: FACTUAL_EXTRACTION_DIRECTIVE,
  extractionPattern: "",
  generationPattern: "",
};

/** @deprecated Few-shots removed — stubs retained for import compatibility. */
export const BENCHMARK_JOBS: HandbookBenchmark = {
  id: "G",
  categoryId: "jobs",
  title: "Jobs",
  inputContext: "",
  expectedAction: FACTUAL_EXTRACTION_DIRECTIVE,
  extractionPattern: "",
  generationPattern: "",
};

/** @deprecated Few-shots removed — stubs retained for import compatibility. */
export const BENCHMARK_DIRECT_PUBLISH: HandbookBenchmark = {
  id: "H",
  categoryId: "publish",
  title: "Direct publish",
  inputContext: "",
  expectedAction:
    "When the user asks to publish and price (and photos if required) are already present, proceed without re-asking.",
  extractionPattern: "",
  generationPattern: "",
};

/** Pass-1: positive factual directive only (no product few-shots). */
export function buildHandbookExtractionFewShots(
  _prompterId?: HandbookPrompterId
): string {
  return `
═══════════════════════════════════════════════════════════════
VAUTO — PASS 1 FACTUAL EXTRACTION
${FACTUAL_EXTRACTION_DIRECTIVE}
═══════════════════════════════════════════════════════════════
`;
}

/** Pass-2: positive write directive only (no product few-shots). */
export function buildHandbookGenerationFewShots(
  _prompterId?: HandbookPrompterId
): string {
  return `
═══════════════════════════════════════════════════════════════
VAUTO — PASS 2 NATURAL SALES COPY
${FACTUAL_EXTRACTION_DIRECTIVE}
Write fluent Lithuanian marketplace copy from the extracted JSON facts only.
Structure naturally (hook → benefits → condition → specs → CTA) when facts support it.
═══════════════════════════════════════════════════════════════
`;
}

/** Category-scoped handbook slice for a prompter. */
export function getHandbookSliceForPrompter(
  _prompterId: HandbookPrompterId
): string {
  return buildHandbookGenerationFewShots();
}

/** Full handbook text (debug / admin). */
export function buildFullSystemHandbook(): string {
  return `${buildHandbookExtractionFewShots()}\n${buildHandbookGenerationFewShots()}`;
}
