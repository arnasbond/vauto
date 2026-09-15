/**
 * REAL-MODEL EVALUATION DATASET — eval-only.
 *
 * This file is ONLY imported by the real-model evaluation runner
 * (`./run.ts` and `./harness-offline.test.ts`). It is NEVER imported by the
 * production runtime and never feeds production prompts. It is deliberately
 * not located under any production import path.
 *
 * Inputs are unseen, realistic Lithuanian. References are conservative
 * (intent/tool/draft-fact/vertical), never phrase-memorisation traps.
 */

export type EvalGroup =
  | "search"
  | "advisory"
  | "multi_turn"
  | "listing_dialogue"
  | "messy";

export interface EvalTurnReference {
  /** Expected planner intent (e.g. "catalog_search", "sell_create", "dialog"). */
  intent?: string;
  /** Expected tool (e.g. "searchListings") or null (no tool expected). */
  expectedTool?: string | null;
  replyMustMention?: string[];
  replyMustNotMention?: string[];
  /** Expected canonical draft fact after this turn. */
  draftFact?: { key: string; value: string };
  /** Expected canonical vertical slug for WRONG_VERTICAL detection. */
  vertical?: string;
  forbiddenEffects?: string[];
  forbiddenTools?: string[];
  /** Naturalness floor — a reply shorter than this is COMMAND_PARSER_BEHAVIOR. */
  minReplyChars?: number;
  /** Expected structured search filters after this turn (continuity assertion). */
  expectedSearchFilters?: {
    query?: string;
    category?: string;
    city?: string;
    maxPrice?: number;
    minPrice?: number;
    categoryAttributes?: Record<string, unknown>;
  };
  /** Expected active task ('search' | 'sell' | intent) after this turn. */
  expectedActiveTask?: string;
}

export interface EvalTurn {
  text: string;
  reference?: EvalTurnReference;
}

export interface EvalCase {
  id: string;
  title: string;
  group: EvalGroup;
  vertical?: string;
  setup?: {
    isAuthenticated?: boolean;
    authUserId?: string;
    myListings?: Array<{ id: string; title: string; status: string }>;
    initialDraft?: Record<string, unknown>;
  };
  turns: EvalTurn[];
}

export const REAL_MODEL_EVAL_CASES: EvalCase[] = [
  // ── SEARCH / ADVISORY — one per canonical vertical ────────────────────────
  {
    id: "SEARCH-TRANSPORT",
    title: "transport search (imperfect wording)",
    group: "search",
    vertical: "vehicles",
    turns: [
      {
        text: "ieskau volvo v70 dyzelio iki 5000 eur",
        reference: {
          intent: "catalog_search",
          expectedTool: "searchListings",
          vertical: "vehicles",
          expectedActiveTask: "search",
          expectedSearchFilters: { maxPrice: 5000 },
          replyMustMention: ["volvo"],
          minReplyChars: 20,
        },
      },
    ],
  },
  {
    id: "SEARCH-REAL-ESTATE",
    title: "real-estate search",
    group: "search",
    vertical: "real_estate",
    turns: [
      {
        text: "ieskau pirkti 3 kambarių butą Antakalnyje iki 180000 eur",
        reference: {
          intent: "catalog_search",
          expectedTool: "searchListings",
          vertical: "real_estate",
          expectedActiveTask: "search",
          expectedSearchFilters: { maxPrice: 180000 },
          replyMustMention: ["but"],
          minReplyChars: 20,
        },
      },
    ],
  },
  {
    id: "SEARCH-ELECTRONICS",
    title: "electronics search",
    group: "search",
    vertical: "electronics",
    turns: [
      {
        text: "reikia iPhone 13 iki 500 eur",
        reference: {
          intent: "catalog_search",
          expectedTool: "searchListings",
          vertical: "electronics",
          expectedActiveTask: "search",
          expectedSearchFilters: { maxPrice: 500 },
          replyMustMention: ["iphone"],
          minReplyChars: 20,
        },
      },
    ],
  },
  {
    id: "SEARCH-CLOTHING",
    title: "clothing search",
    group: "search",
    vertical: "clothing",
    turns: [
      {
        text: "ieskau žieminės striukės vyrui XL juodos",
        reference: {
          intent: "catalog_search",
          expectedTool: "searchListings",
          vertical: "clothing",
          expectedActiveTask: "search",
          replyMustMention: ["striuk"],
          minReplyChars: 20,
        },
      },
    ],
  },
  {
    id: "SEARCH-SERVICES",
    title: "services search",
    group: "search",
    vertical: "services",
    turns: [
      {
        text: "reikia meistro kuris sutvarkytų vandens šildytuvą Kaune",
        reference: {
          intent: "catalog_search",
          expectedTool: "searchListings",
          vertical: "services",
          expectedActiveTask: "search",
          expectedSearchFilters: { city: "Kaunas" },
          minReplyChars: 20,
        },
      },
    ],
  },
  {
    id: "SEARCH-JOBS",
    title: "jobs search",
    group: "search",
    vertical: "jobs",
    turns: [
      {
        text: "ieskau darbo vairuotoju su CE kategorija Vilniuje",
        reference: {
          intent: "catalog_search",
          expectedTool: "searchListings",
          vertical: "jobs",
          expectedActiveTask: "search",
          expectedSearchFilters: { city: "Vilnius" },
          minReplyChars: 20,
        },
      },
    ],
  },
  {
    id: "SEARCH-HOME-GARDEN",
    title: "home/garden search",
    group: "search",
    vertical: "home",
    turns: [
      {
        text: "ieskau medinio stalo virtuvei iki 200 eur",
        reference: {
          intent: "catalog_search",
          expectedTool: "searchListings",
          vertical: "home",
          expectedActiveTask: "search",
          expectedSearchFilters: { maxPrice: 200 },
          minReplyChars: 20,
        },
      },
    ],
  },
  {
    id: "SEARCH-OTHER",
    title: "generic goods search",
    group: "search",
    vertical: "other",
    turns: [
      {
        text: "ieskau stalo žaidimo suaugusiems",
        reference: {
          intent: "catalog_search",
          expectedTool: "searchListings",
          expectedActiveTask: "search",
          minReplyChars: 20,
        },
      },
    ],
  },

  // ── ADVISORY / NON-EXACT INTENT ──────────────────────────────────────────
  {
    id: "ADVISORY-CAR",
    title: "advisory: reliable family car",
    group: "advisory",
    turns: [
      {
        text: "patarkit kokį patikimą šeimos automobilį pirkti iki 15000, svarbu taupumas ir patikimumas",
        reference: {
          intent: "dialog",
          expectedTool: null,
          forbiddenTools: ["searchListings"],
          minReplyChars: 40,
        },
      },
    ],
  },
  {
    id: "ADVISORY-PHONE",
    title: "advisory: phone for elderly",
    group: "advisory",
    turns: [
      {
        text: "nežinau kokį telefoną mamai, paprasta naudoti, biudžetas iki 400",
        reference: {
          intent: "dialog",
          expectedTool: null,
          forbiddenTools: ["searchListings"],
          minReplyChars: 40,
        },
      },
    ],
  },

  // ── MULTI-TURN ───────────────────────────────────────────────────────────
  {
    id: "MULTI-REFINE",
    title: "multi-turn constraint refinement",
    group: "multi_turn",
    vertical: "real_estate",
    turns: [
      {
        text: "ieškau buto Vilniuje",
        reference: {
          intent: "catalog_search",
          expectedTool: "searchListings",
          vertical: "real_estate",
          expectedActiveTask: "search",
          expectedSearchFilters: { city: "Vilnius" },
          minReplyChars: 20,
        },
      },
      {
        text: "gal iki 120000 ir su 3 kambariais",
        reference: {
          intent: "catalog_search",
          expectedTool: "searchListings",
          vertical: "real_estate",
          expectedActiveTask: "search",
          expectedSearchFilters: { city: "Vilnius", maxPrice: 120000 },
          minReplyChars: 20,
        },
      },
    ],
  },
  {
    id: "MULTI-BUDGET",
    title: "multi-turn budget change",
    group: "multi_turn",
    vertical: "vehicles",
    turns: [
      {
        text: "ieškau Volvo iki 10000",
        reference: {
          intent: "catalog_search",
          expectedTool: "searchListings",
          vertical: "vehicles",
          expectedActiveTask: "search",
          expectedSearchFilters: { maxPrice: 10000 },
          minReplyChars: 20,
        },
      },
      {
        text: "gerai, tada iki 12000",
        reference: {
          intent: "catalog_search",
          expectedTool: "searchListings",
          vertical: "vehicles",
          expectedActiveTask: "search",
          expectedSearchFilters: { maxPrice: 12000 },
          minReplyChars: 20,
        },
      },
    ],
  },
  {
    id: "MULTI-CORRECT",
    title: "multi-turn correction of misunderstanding",
    group: "multi_turn",
    vertical: "vehicles",
    turns: [
      {
        text: "ieškau Audi",
        reference: {
          intent: "catalog_search",
          expectedTool: "searchListings",
          vertical: "vehicles",
          expectedActiveTask: "search",
          minReplyChars: 20,
        },
      },
      {
        text: "ne, ne Audi, o BMW",
        reference: {
          intent: "catalog_search",
          expectedTool: "searchListings",
          vertical: "vehicles",
          expectedActiveTask: "search",
          expectedSearchFilters: { query: "BMW" },
          replyMustMention: ["bmw"],
          minReplyChars: 20,
        },
      },
    ],
  },
  {
    id: "MULTI-REFERENT",
    title: "multi-turn referent follow-up",
    group: "multi_turn",
    vertical: "vehicles",
    turns: [
      {
        text: "parodyk automobilius iki 8000",
        reference: {
          intent: "catalog_search",
          expectedTool: "searchListings",
          vertical: "vehicles",
          expectedActiveTask: "search",
          expectedSearchFilters: { maxPrice: 8000 },
          minReplyChars: 20,
        },
      },
      {
        text: "šitas visai patinka, ar yra dar panašių?",
        reference: {
          expectedTool: "searchListings",
          expectedActiveTask: "search",
          minReplyChars: 20,
        },
      },
    ],
  },

  // ── LISTING DIALOGUE ─────────────────────────────────────────────────────
  {
    id: "LIST-ELECTRONICS",
    title: "non-transport text-first listing",
    group: "listing_dialogue",
    vertical: "electronics",
    turns: [
      {
        text: "Parduodu iPhone 13 Pro 256 GB, juodas, 600 eur",
        reference: {
          intent: "sell_create",
          vertical: "electronics",
          expectedActiveTask: "sell",
          forbiddenEffects: ["listing_published"],
          minReplyChars: 20,
        },
      },
    ],
  },
  {
    id: "LIST-CLOTHING",
    title: "non-transport text-first listing (clothing)",
    group: "listing_dialogue",
    vertical: "clothing",
    turns: [
      {
        text: "Parduodu žieminę striukę M dydžio, juoda, 40 eur",
        reference: {
          intent: "sell_create",
          vertical: "clothing",
          expectedActiveTask: "sell",
          forbiddenEffects: ["listing_published"],
          minReplyChars: 20,
        },
      },
    ],
  },
  {
    id: "LIST-ADD-INFO",
    title: "additional info in later turn (same draft)",
    group: "listing_dialogue",
    vertical: "home",
    turns: [
      {
        text: "Parduodu medinį stalą, 150 eur",
        reference: {
          intent: "sell_create",
          vertical: "home",
          expectedActiveTask: "sell",
          forbiddenEffects: ["listing_published"],
          minReplyChars: 20,
        },
      },
      {
        text: "su 4 kėdėmis, ąžuolas",
        reference: {
          intent: "sell_update",
          expectedTool: "updateListingDraft",
          vertical: "home",
          expectedActiveTask: "sell",
          minReplyChars: 20,
        },
      },
    ],
  },
  {
    id: "LIST-CORRECTION",
    title: "user correction authoritative",
    group: "listing_dialogue",
    vertical: "electronics",
    setup: {
      initialDraft: {
        title: "Telefonas",
        category: "electronics",
        price: 500,
        location: "Vilnius",
        attributes: {},
        listingFlowState: "DRAFTING_TEXT",
      },
    },
    turns: [
      {
        text: "ne, kaina 450 eur",
        reference: {
          intent: "sell_update",
          expectedTool: "updateListingDraft",
          draftFact: { key: "price", value: "450" },
          expectedActiveTask: "sell",
          forbiddenEffects: ["listing_published"],
          minReplyChars: 20,
        },
      },
    ],
  },
  {
    id: "LIST-NO-PUBLISH",
    title: "explicit do-not-publish",
    group: "listing_dialogue",
    vertical: "electronics",
    setup: {
      initialDraft: {
        title: "iPhone 13",
        category: "electronics",
        price: 600,
        location: "Vilnius",
        attributes: {},
        listingFlowState: "DRAFT_READY",
      },
    },
    turns: [
      {
        text: "paruošk skelbimą, bet dar nepublikuok",
        reference: {
          expectedActiveTask: "sell",
          forbiddenEffects: ["listing_published"],
          minReplyChars: 20,
        },
      },
    ],
  },

  // ── MESSY LANGUAGE ───────────────────────────────────────────────────────
  {
    id: "MESSY-TYPO",
    title: "typo-heavy Lithuanian",
    group: "messy",
    vertical: "electronics",
    turns: [
      {
        text: "rwikau iphona 12 pro už gera kaina kaune",
        reference: {
          intent: "catalog_search",
          expectedTool: "searchListings",
          vertical: "electronics",
          expectedActiveTask: "search",
          expectedSearchFilters: { city: "Kaunas" },
          minReplyChars: 20,
        },
      },
    ],
  },
  {
    id: "MESSY-MULTI",
    title: "multiple constraints, colloquial",
    group: "messy",
    vertical: "vehicles",
    turns: [
      {
        text: "ieskau masinos, didelė bagažinė, dyzelis, iki 8000, ir kad butu ne labai sena",
        reference: {
          intent: "catalog_search",
          expectedTool: "searchListings",
          vertical: "vehicles",
          expectedActiveTask: "search",
          expectedSearchFilters: { maxPrice: 8000 },
          minReplyChars: 20,
        },
      },
    ],
  },
];

export function countEvalCases(): number {
  return REAL_MODEL_EVAL_CASES.length;
}
