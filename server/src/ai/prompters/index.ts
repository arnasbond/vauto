import { AUTO_PROMPTER } from "./auto-prompter.js";
import { MUSIC_PROMPTER } from "./music-prompter.js";
import { REALESTATE_PROMPTER } from "./realestate-prompter.js";
import { GENERAL_PROMPTER } from "./general-prompter.js";

export { AUTO_PROMPTER } from "./auto-prompter.js";
export { MUSIC_PROMPTER } from "./music-prompter.js";
export { REALESTATE_PROMPTER } from "./realestate-prompter.js";
export { GENERAL_PROMPTER } from "./general-prompter.js";

export type CategoryPrompterId = "auto" | "music" | "realestate" | "general";

/**
 * Strict category → prompter router.
 * Injects ONLY the relevant specialized prompt — no cross-category pollution.
 */
export function getCategoryPrompter(category: string): {
  id: CategoryPrompterId;
  prompt: string;
} {
  const key = String(category ?? "")
    .toUpperCase()
    .trim();

  if (
    key === "AUTOMOBILIAI" ||
    key === "VEHICLES" ||
    key === "AUTO" ||
    key === "VEHICLE"
  ) {
    return { id: "auto", prompt: AUTO_PROMPTER };
  }

  if (
    key === "MUZIKA" ||
    key === "MUSIC" ||
    key === "INSTRUMENTS" ||
    key === "MUSICAL"
  ) {
    return { id: "music", prompt: MUSIC_PROMPTER };
  }

  if (
    key === "NT" ||
    key === "REAL_ESTATE" ||
    key === "REALESTATE" ||
    key === "PROPERTY"
  ) {
    return { id: "realestate", prompt: REALESTATE_PROMPTER };
  }

  return { id: "general", prompt: GENERAL_PROMPTER };
}
