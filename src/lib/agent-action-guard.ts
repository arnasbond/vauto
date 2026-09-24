/**
 * S0 — validate/sanitize agent actions before applying to React state.
 * No zod dependency; lightweight runtime guards.
 */
import type { VautoAgentAction } from "@/lib/vauto-agent-client";
import { safeDraftAttributes } from "@/lib/agent-message-safe";

export type SanitizeAgentActionResult =
  | { ok: true; action: VautoAgentAction }
  | { ok: false; message: string };

export type TurnOriginContext = {
  fromSearchBar?: boolean;
  view?: string;
};

/**
 * Entry-point ownership decision helper.
 * Enforces single-authority rule: an executable Core v2 turn action (e.g. search, empty_search, listing_draft)
 * MUST be applied to canonical frontend state regardless of whether the user initiated the turn
 * from the global search bar (`fromSearchBar: true`) or another entry point.
 */
export function shouldApplyAgentTurnAction(
  action: VautoAgentAction | null | undefined,
  _originContext?: TurnOriginContext
): boolean {
  if (!action) return false;
  if (action.type === "none") return false;
  return true;
}

export type LiveInterventionOriginContext = {
  /** True when a Core v2 AI turn is in-flight or busy. */
  agentBusy?: boolean;
  /** Non-null array indicates an authoritative Core v2 turn owns the search results state. */
  agentPinnedListingIds?: string[] | null;
  /** True when the agent chat window/strip is already active. */
  chatOpen?: boolean;
  /** Kind of intervention being evaluated. */
  interventionKind?: "no_match" | "bargaining" | "user_nudge" | "business_nudge";
};

/**
 * Structural Authority Guard:
 * Determines whether LiveInterventionHost is permitted to trigger a proactive intervention.
 * 
 * Core v2 Single Authority:
 * When an authoritative Core v2 AI turn is active (agentBusy === true) or owns the
 * search result lifecycle (agentPinnedListingIds !== null), legacy frontend client-side
 * no-match interventions (search_empty / grid_empty) MUST NOT generate competing
 * assistant messages.
 */
export function isLiveInterventionAllowed(
  ctx: LiveInterventionOriginContext
): boolean {
  // 1. Core v2 in-flight turn owns the lifecycle — suppress all client proactive interventions.
  if (ctx.agentBusy) return false;

  // 2. Client-side zero-result no-match interventions ("no_match") are redundant with Core v2 reasoning authority.
  // When an AI turn is active or pinned results exist, no-match interventions are strictly prohibited.
  if (ctx.interventionKind === "no_match") {
    if (ctx.agentPinnedListingIds !== null && ctx.agentPinnedListingIds !== undefined) {
      return false;
    }
    // Conversational no-match assistant messages are owned by Core v2 — disable client-side no_match.
    return false;
  }

  // 3. Proactive greetings are suppressed when chat is already open.
  if (ctx.chatOpen && ctx.interventionKind === "bargaining") {
    return false;
  }

  return true;
}

function asString(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value;
  if (value == null) return fallback;
  return String(value);
}

function asNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => asString(v)).filter(Boolean);
}

export function sanitizeAgentAction(raw: unknown): SanitizeAgentActionResult {
  if (!raw || typeof raw !== "object") {
    return { ok: false, message: "AI atsakymas netinkamo formato — bandykite dar kartą." };
  }

  const action = raw as Record<string, unknown>;
  const type = asString(action.type, "none");

  if (type === "none" || !type) {
    return { ok: true, action: { type: "none" } };
  }

  try {
    switch (type) {
      case "search":
        return {
          ok: true,
          action: {
            type: "search",
            searchQuery: asString(action.searchQuery),
            listingIds: asStringArray(action.listingIds),
            filters:
              action.filters && typeof action.filters === "object"
                ? (action.filters as VautoAgentAction & { type: "search" })["filters"]
                : undefined,
            filtersReset: Boolean(action.filtersReset),
            proactiveMessage: action.proactiveMessage
              ? asString(action.proactiveMessage)
              : undefined,
          },
        };

      case "empty_search":
        return {
          ok: true,
          action: {
            type: "empty_search",
            searchQuery: asString(action.searchQuery),
            filters:
              action.filters && typeof action.filters === "object"
                ? (action.filters as VautoAgentAction & { type: "empty_search" })["filters"]
                : undefined,
          },
        };

      case "browse_all":
        return {
          ok: true,
          action: {
            type: "browse_all",
            replyMessage: asString(action.replyMessage, "Štai visi naujausi skelbimai. Galbūt ieškote kažko specifinio?"),
            listingCount:
              action.listingCount != null ? asNumber(action.listingCount, 0) : undefined,
          },
        };

      case "listing_draft": {
        const draft = action.listingDraft;
        if (!draft || typeof draft !== "object") {
          return {
            ok: false,
            message: "Nepavyko paruošti skelbimo juodraščio — pabandykite aprašyti kitaip.",
          };
        }
        const d = draft as Record<string, unknown>;
        const category = asString(d.category, "other");
        const description = asString(d.description).trim();
        let title = asString(d.title).trim();
        if (title.length < 1) {
          title =
            description.slice(0, 72) ||
            (category === "clothing" ? "Naujas drabužio skelbimas" : "Naujas skelbimas");
        }
        const imageUrls = Array.isArray(action.imageUrls)
          ? action.imageUrls
              .map((u) => asString(u))
              .filter(Boolean)
              .slice(0, 6)
          : undefined;
        const flowRaw = asString(d.listingFlowState);
        const listingFlowState =
          flowRaw === "DRAFTING_TEXT" ||
          flowRaw === "AWAITING_PHOTOS" ||
          flowRaw === "DRAFT_READY" ||
          flowRaw === "AWAITING_CONFIRMATION"
            ? flowRaw
            : undefined;
        return {
          ok: true,
          action: {
            type: "listing_draft",
            listingDraft: {
              title,
              description: description || undefined,
              price: asNumber(d.price, 0),
              location: asString(d.location),
              contact: asString(d.contact, ""),
              category: asString(d.category, "other"),
              confidence: asNumber(d.confidence, 0.5),
              attributes: safeDraftAttributes(d.attributes),
              ...(listingFlowState ? { listingFlowState } : {}),
            },
            imageUrl:
              (imageUrls?.[0] ? imageUrls[0] : undefined) ||
              (action.imageUrl ? asString(action.imageUrl) : undefined),
            ...(imageUrls?.length ? { imageUrls } : {}),
          },
        };
      }

      case "wardrobe_bulk": {
        const items = Array.isArray(action.items) ? action.items : [];
        if (!items.length) {
          return {
            ok: false,
            message: "Drabužių sąrašas tuščias — įkelkite nuotraukas arba aprašykite prekes.",
          };
        }
        const safeItems = items.slice(0, 8).map((entry, idx) => {
          const o =
            entry && typeof entry === "object"
              ? (entry as Record<string, unknown>)
              : {};
          const title = asString(o.title).trim() || `Drabužis ${idx + 1}`;
          return {
            id: asString(o.id, `wardrobe-${idx + 1}`),
            title,
            categoryGroup: asString(o.categoryGroup, "Moterims"),
            categorySub: asString(o.categorySub, "Kita"),
            size: asString(o.size, "M"),
            color: asString(o.color, "Mišri"),
            brand: asString(o.brand, "Be ženklo"),
            condition: asString(o.condition, "Labai gera"),
            suggestedPrice: Math.max(1, asNumber(o.suggestedPrice, 15)),
            description: asString(o.description, title),
            descriptionVariants:
              o.descriptionVariants && typeof o.descriptionVariants === "object"
                ? (o.descriptionVariants as Record<string, string>)
                : undefined,
          };
        });
        return {
          ok: true,
          action: {
            type: "wardrobe_bulk",
            items: safeItems,
            imageUrl: action.imageUrl ? asString(action.imageUrl) : undefined,
            voiceAnnouncement: action.voiceAnnouncement
              ? asString(action.voiceAnnouncement)
              : undefined,
          },
        };
      }

      case "register_wanted":
        return {
          ok: true,
          action: {
            type: "register_wanted",
            query: asString(action.query),
          },
        };

      case "navigate":
        return {
          ok: true,
          action: {
            type: "navigate",
            view: asString(action.view) as import("@/lib/app-views").AppView,
            params:
              action.params && typeof action.params === "object"
                ? Object.fromEntries(
                    Object.entries(action.params as Record<string, unknown>).map(
                      ([k, v]) => [k, asString(v)]
                    )
                  )
                : undefined,
          },
        };

      default:
        return { ok: true, action: raw as VautoAgentAction };
    }
  } catch {
    return {
      ok: false,
      message: "Nepavyko saugiai apdoroti AI veiksmo — bandykite dar kartą.",
    };
  }
}
