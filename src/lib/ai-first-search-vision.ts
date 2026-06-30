/**
 * P7c-full — AI-First paieškos vizija ir refino mechanika.
 *
 * STRATEGIJA:
 * - Gilus kategorijų meniu pašalintas (MarketplaceCategoryGrid, CategoryAttributeFilterPanel).
 * - Vartotojas rašo laisvą frazę FlowAgentComposer / SearchBar.
 * - Agentas semantiškai pritaiko filtrus (updateUIFilters / searchListings).
 * - Search Refinement: per daug arba 0 rezultatų → agentas proaktyviai įsijungia.
 */

export type SearchRefinementKind = "too_many" | "no_results" | "none";

export interface SearchRefinementContext {
  query: string;
  resultCount: number;
  category?: string;
  wardrobeMode?: boolean;
}

export interface SearchRefinementPlan {
  kind: SearchRefinementKind;
  proactiveMessage: string;
  quickReplies: string[];
  suggestBroaden?: boolean;
  suggestRegisterWanted?: boolean;
}

const TOO_MANY_THRESHOLD = 24;

export function evaluateSearchRefinement(
  ctx: SearchRefinementContext
): SearchRefinementPlan {
  const q = ctx.query.trim();
  if (!q) {
    return { kind: "none", proactiveMessage: "", quickReplies: [] };
  }

  if (ctx.resultCount === 0) {
    return {
      kind: "no_results",
      proactiveMessage: buildNoResultsRefinementMessage(q, ctx.wardrobeMode),
      quickReplies: [
        "Platesnė paieška",
        "Pranešk kai atsiras",
        "Sukurti skelbimą",
        "Kita frazė",
      ],
      suggestBroaden: true,
      suggestRegisterWanted: true,
    };
  }

  if (ctx.resultCount >= TOO_MANY_THRESHOLD) {
    return {
      kind: "too_many",
      proactiveMessage: buildTooManyResultsRefinementMessage(q, ctx.resultCount),
      quickReplies: ["Iki 500 €", "Tik nauji", "Tik mano mieste", "Kita frazė"],
      suggestBroaden: false,
    };
  }

  return { kind: "none", proactiveMessage: "", quickReplies: [] };
}

export function buildTooManyResultsRefinementMessage(
  query: string,
  count: number
): string {
  const subject = query.length > 40 ? `${query.slice(0, 37)}…` : query;
  return `Matau ${count} skelbimų pagal „${subject}" — gana daug! Gal patikslinam modelį, kainą ar miestą, kad rastumėte tinkamiausią?`;
}

export function buildNoResultsRefinementMessage(
  query: string,
  wardrobeMode?: boolean
): string {
  const subject = query.length > 40 ? `${query.slice(0, 37)}…` : query;
  if (wardrobeMode) {
    return `Šiuo metu spintoje neradau „${subject}". Galiu išplėsti paiešką arba pranešti, kai kas nors įkels — tęsiame?`;
  }
  return `Šiuo metu „${subject}" rinkoje neradau. Ar norite, kad užfiksuočiau paiešką ir praneščiau, kai atsiras? Arba pabandykime platesnę frazę.`;
}

export const AI_FIRST_SEARCH_PLACEHOLDER =
  "Rašykite laisvai — pvz. „ieškau iPhone 15“ arba „parduodu Volvo V70“";

export const AI_FIRST_SEARCH_EXAMPLES = [
  "noriu matyti visus skelbimus su mobiliais telefonais",
  "reikia citroen generatoriaus",
  "moteriški batai 38 dydžio iki 50 €",
] as const;
