/**
 * VAUTO AI system handbook — thin positive directives.
 * No hardcoded product few-shots (brand/model/city pollution).
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
  | "electronics"
  | "clothing"
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

/** Pass 1 — facts only. */
export const FACTUAL_EXTRACTION_DIRECTIVE = `
Extract and structure ONLY the facts explicitly present in the provided images and user text.
If an attribute or location is not provided, leave the field null / omit it.
Do not invent missing values.
`.trim();

/**
 * Pass 2 — warm marketplace copy (restore conversational sales quality).
 * Structure without brand/city few-shot pollution.
 */
export const NATURAL_SALES_COPY_DIRECTIVE = `
Rašyk engaginantį marketplace tekstą natūralia lietuvių kalba — tonas pagal kategorijos FOKUSAS (ne vienodas šablonas visiems).
Naudok TIK faktus iš Pass-1 JSON / OCR / vartotojo teksto.
Siekis — visas aprašymo tekstas ir specifikacijų etiketės TIK švaria, taisyklinga lietuvių kalba.
Techninius JSON raktus (bodyType, powerKw, fuelType, mileageKm ir pan.) versk į lietuviškas etiketes (Kėbulas, Galia, Kuras, Rida).
Prekių ženklus ir modelius (pvz. Lucid Air, iPhone) palik kaip yra — jie yra pavadinimai, ne neišversti parametrai.
Kai faktų užtenka, struktūruok Markdown pagal kategoriją:
- Elektronika/technika: trumpas hook + • Specifikacijos + būklė/komplektacija (mažiau poezijos)
- Paslaugos: įtaigus hook + • spektras + patirtis/garantijos + terminai/zona
- Mada: vaizdingas hook + dydis/audinys/prigludimas
- Transportas: šiltas pristatymas + • techniniai faktai (rida, būklė, aptarnavimai)
Title: švarus marketplace pavadinimas (brand + model + tipas, kai žinomi).
Pradėk description tiesiai nuo pardavimo teksto (be „Pavadinimas:“ / „Title:“ etikečių).
Jei miesto / kainos / detalės nėra — tiesiog neminėk; nepalik tuščių šablonų.
`.trim();

/** Empty suite — kept for API compatibility; product few-shots intentionally removed. */
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

/** Pass-1: factual directive only. */
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

/** Pass-2: warm natural sales copy (no product few-shots). */
export function buildHandbookGenerationFewShots(
  _prompterId?: HandbookPrompterId
): string {
  return `
═══════════════════════════════════════════════════════════════
VAUTO — PASS 2 NATURAL SALES COPY
${NATURAL_SALES_COPY_DIRECTIVE}
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
