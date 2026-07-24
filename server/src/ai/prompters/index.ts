import { AUTO_PROMPTER } from "./auto-prompter.js";
import { MUSIC_PROMPTER } from "./music-prompter.js";
import { REALESTATE_PROMPTER } from "./realestate-prompter.js";
import { GENERAL_PROMPTER } from "./general-prompter.js";
import { getHandbookSliceForPrompter } from "./system-handbook.js";

export { AUTO_PROMPTER } from "./auto-prompter.js";
export { MUSIC_PROMPTER } from "./music-prompter.js";
export { REALESTATE_PROMPTER } from "./realestate-prompter.js";
export { GENERAL_PROMPTER } from "./general-prompter.js";
export {
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

export type CategoryPrompterId = "auto" | "music" | "realestate" | "general";

/**
 * Strict category → prompter router.
 * Returns specialized prompt + matching Employee Handbook few-shot slice.
 */
export function getCategoryPrompter(category: string): {
  id: CategoryPrompterId;
  prompt: string;
} {
  const key = String(category ?? "")
    .toUpperCase()
    .trim();

  let id: CategoryPrompterId = "general";
  let base = GENERAL_PROMPTER;

  if (
    key === "AUTOMOBILIAI" ||
    key === "VEHICLES" ||
    key === "AUTO" ||
    key === "VEHICLE"
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
  }

  return {
    id,
    prompt: `${base}\n\n${getHandbookSliceForPrompter(id)}`,
  };
}
