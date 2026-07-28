import { AUTO_PROMPTER } from "./auto-prompter.js";
import { MUSIC_PROMPTER } from "./music-prompter.js";
import { REALESTATE_PROMPTER } from "./realestate-prompter.js";
import { GENERAL_PROMPTER } from "./general-prompter.js";
import { ELECTRONICS_PROMPTER } from "./electronics-prompter.js";
import { CLOTHING_PROMPTER } from "./clothing-prompter.js";
import { JOBS_PROMPTER } from "./jobs-prompter.js";
import { SERVICES_PROMPTER } from "./services-prompter.js";
import { getHandbookSliceForPrompter } from "./system-handbook.js";

export { AUTO_PROMPTER } from "./auto-prompter.js";
export { MUSIC_PROMPTER } from "./music-prompter.js";
export { REALESTATE_PROMPTER } from "./realestate-prompter.js";
export { GENERAL_PROMPTER } from "./general-prompter.js";
export { ELECTRONICS_PROMPTER } from "./electronics-prompter.js";
export { CLOTHING_PROMPTER } from "./clothing-prompter.js";
export { JOBS_PROMPTER } from "./jobs-prompter.js";
export { SERVICES_PROMPTER } from "./services-prompter.js";
export {
  FACTUAL_EXTRACTION_DIRECTIVE,
  NATURAL_SALES_COPY_DIRECTIVE,
  VAUTO_SYSTEM_HANDBOOK,
  BENCHMARK_ELECTRONICS_PEIKO,
  BENCHMARK_AUTO_REGITRA,
  BENCHMARK_MUSIC_HOHNER,
  BENCHMARK_ART_PAINTING,
  BENCHMARK_REALESTATE_NT,
  BENCHMARK_SERVICES,
  BENCHMARK_JOBS,
  BENCHMARK_DIRECT_PUBLISH,
  buildHandbookExtractionFewShots,
  buildHandbookGenerationFewShots,
  getHandbookSliceForPrompter,
  buildFullSystemHandbook,
} from "./system-handbook.js";

export type CategoryPrompterId =
  | "auto"
  | "music"
  | "realestate"
  | "general"
  | "electronics"
  | "clothing"
  | "jobs"
  | "services";

/**
 * Category → prompter router.
 * Injects a short positive factual directive (no product few-shots).
 */
export function getCategoryPrompter(category: string): {
  id: CategoryPrompterId;
  prompt: string;
} {
  const key = String(category ?? "")
    .toUpperCase()
    .trim()
    .replace(/-/g, "_");

  let id: CategoryPrompterId = "general";
  let base = GENERAL_PROMPTER;

  if (
    key === "ELEKTRONIKA" ||
    key === "ELECTRONICS" ||
    key === "ELECTRONIC" ||
    key === "TOOLS" ||
    key === "TOOL" ||
    key === "DALYS" ||
    key === "PARTS" ||
    key === "AUTODALYS"
  ) {
    // Tech / parts / tools — specs-first (never AUTO_PROMPTER VIN/rida voice).
    id = "electronics";
    base = ELECTRONICS_PROMPTER;
  } else if (
    key === "APRANGA" ||
    key === "CLOTHING" ||
    key === "FASHION" ||
    key === "MADA"
  ) {
    id = "clothing";
    base = CLOTHING_PROMPTER;
  } else if (
    key === "AUTOMOBILIAI" ||
    key === "VEHICLES" ||
    key === "AUTO" ||
    key === "VEHICLE" ||
    key === "TRANSPORTAS" ||
    key === "TRANSPORT"
  ) {
    id = "auto";
    base = AUTO_PROMPTER;
  } else if (
    key === "MUZIKA" ||
    key === "MUSIC" ||
    key === "INSTRUMENTS" ||
    key === "MUSICAL"
  ) {
    id = "music";
    base = MUSIC_PROMPTER;
  } else if (
    key === "NT" ||
    key === "REAL_ESTATE" ||
    key === "REALESTATE" ||
    key === "PROPERTY"
  ) {
    id = "realestate";
    base = REALESTATE_PROMPTER;
  } else if (key === "DARBAS" || key === "JOBS" || key === "JOB") {
    id = "jobs";
    base = JOBS_PROMPTER;
  } else if (
    key === "PASLAUGOS" ||
    key === "SERVICES" ||
    key === "SERVICE"
  ) {
    id = "services";
    base = SERVICES_PROMPTER;
  }

  return {
    id,
    prompt: `${base}\n\n${getHandbookSliceForPrompter(id)}`,
  };
}
