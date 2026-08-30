/**
 * VAUTO AI Maturity — Phase 2C Round 4: server-registered VIN review challenge.
 *
 *   POST /api/vin-review/register — registers a pending review challenge for a
 *       manual PrePublish candidate (optional listingId with ownership check).
 *   POST /api/vin-review/confirm  — requires the server-owned challengeId; only
 *       a verified challenge mints the confirmation receipt.
 *   POST /api/vin-review/reject   — invalidates the pending challenge.
 *
 * The LLM has no tool for this boundary; plain chat text and quick-reply labels
 * never reach it; only the trusted client UI submits challenge-bound actions.
 */

import { Router } from "express";
import type { AuthedRequest } from "../middleware/auth.js";
import { isPlausibleVin, normalizeVin } from "../shared/vin-utils.js";
import {
  consumeVinChallenge,
  mintVinDraftScope,
  registerVinChallenge,
  rejectVinChallenge,
  verifyVinDraftScope,
  type VinChallengeOutcome,
} from "../vehicle/vin-challenge.js";
import { buildConfirmedVinAttributesPatch } from "../vehicle/vin-confirmation.js";
import { getListingForEmbedding } from "../repository.js";

export const vinReviewRouter = Router();

type OwnershipCheck = (listingId: string, userId: string) => Promise<boolean>;

let ownershipCheck: OwnershipCheck = async (listingId, userId) => {
  const listing = await getListingForEmbedding(listingId);
  return Boolean(listing && listing.sellerId === userId);
};

/** Test seam — replace the listing ownership verification (DB-free tests). */
export function setVinReviewOwnershipCheckForTests(fn: OwnershipCheck | null): void {
  if (fn) ownershipCheck = fn;
  else {
    ownershipCheck = async (listingId, userId) => {
      const listing = await getListingForEmbedding(listingId);
      return Boolean(listing && listing.sellerId === userId);
    };
  }
}

const OUTCOME_MESSAGE_LT: Record<VinChallengeOutcome | "registered", string> = {
  registered: "VIN kandidatas užregistruotas.",
  confirmed: "VIN kodas patvirtintas.",
  already_confirmed: "VIN kodas jau buvo patvirtintas.",
  challenge_not_found: "VIN peržiūros užklausa nerasta — patvirtinkite iš naujo.",
  challenge_expired: "VIN peržiūros užklausa nebegalioja — patvirtinkite iš naujo.",
  wrong_user: "VIN peržiūros užklausa priklauso kitam vartotojui.",
  wrong_listing: "VIN peržiūros užklausa neatitinka šio skelbimo.",
  wrong_scope: "VIN peržiūros užklausa neatitinka šio juodraščio.",
  wrong_vin: "Patvirtinamas VIN neatitinka serverio užregistruoto kandidato.",
  choice_not_allowed: "Pasirinktas VIN neįtrauktas į serverio leidžiamų pasirinkimų sąrašą.",
  stale_generation: "VIN kandidatas pasikeitė — patvirtinkite naujausią variantą.",
  rejected: "VIN kodas atmestas.",
  store_full: "Per daug VIN užklausų — palaukite ir bandykite dar kartą.",
};

function confirmedAttributesPatch(input: {
  vin: string;
  reviewId: string;
  listingId?: string;
  draftScope?: string;
  userId: string;
  challengeId: string;
}): Record<string, string> | null {
  return buildConfirmedVinAttributesPatch(input);
}

const CLEARED_PATCH: Record<string, string> = {
  vinCandidate: "",
  vinCandidateSource: "",
  vinCandidateConfidence: "",
  vinConflictValue: "",
  vinConflictSource: "",
  vinConflict: "",
  vinUncertain: "",
  vinReviewId: "",
  vinChallenge: "",
  vinConfirmed: "",
  vinConfirmedSource: "",
  vinConfirmedReviewId: "",
};

vinReviewRouter.post("/register", async (req: AuthedRequest, res) => {
  try {
    const userId = String(req.authUserId ?? "").trim();
    if (!userId) {
      res.status(401).json({ ok: false, code: "auth_required", error: "Reikalingas prisijungimas." });
      return;
    }

    const body = (req.body ?? {}) as {
      values?: unknown;
      listingId?: unknown;
      provenance?: unknown;
      draftScope?: unknown;
      supersedesChallengeId?: unknown;
      supersedesReviewId?: unknown;
    };
    const values = Array.isArray(body.values)
      ? body.values.map((v) => normalizeVin(String(v ?? ""))).filter(Boolean)
      : [];
    const plausible = values.filter((v) => isPlausibleVin(v));
    if (!plausible.length || plausible.length > 2) {
      res.status(400).json({
        ok: false,
        code: "invalid_value",
        error: "Įvestas VIN neatpažintas — patikrinkite simbolius (17 ženklų, be I/O/Q).",
      });
      return;
    }

    const listingId =
      typeof body.listingId === "string" && body.listingId.trim()
        ? body.listingId.trim()
        : undefined;
    if (listingId) {
      const owned = await ownershipCheck(listingId, userId);
      if (!owned) {
        res.status(403).json({
          ok: false,
          code: "wrong_listing",
          error: "Skelbimas nerastas arba jis nepriklauso šiam vartotojui.",
        });
        return;
      }
    }

    // Round 5: SERVER-OWNED draft scope. A client-supplied scope is verified
    // against the scope store; an invalid/absent scope is replaced by a freshly
    // minted server scope. The browser can never invent a trusted scope.
    let draftScope =
      typeof body.draftScope === "string" && body.draftScope.trim()
        ? body.draftScope.trim()
        : "";
    if (draftScope && !listingId) {
      const verified = verifyVinDraftScope(userId, draftScope);
      if (!verified.ok) draftScope = "";
    }
    if (!draftScope && !listingId) {
      const minted = mintVinDraftScope(userId);
      if (!minted) {
        res.status(429).json({ ok: false, code: "store_full", error: OUTCOME_MESSAGE_LT.store_full });
        return;
      }
      draftScope = minted.draftScope;
    }

    const registered = registerVinChallenge({
      userId,
      listingId,
      draftScope: draftScope || undefined,
      values: plausible,
      provenance:
        body.provenance === "photo_ocr" || body.provenance === "document_ocr"
          ? body.provenance
          : "user_entered",
      supersedesChallengeId:
        typeof body.supersedesChallengeId === "string" &&
        body.supersedesChallengeId.trim()
          ? body.supersedesChallengeId.trim()
          : undefined,
      supersedesReviewId:
        typeof body.supersedesReviewId === "string" && body.supersedesReviewId.trim()
          ? body.supersedesReviewId.trim()
          : undefined,
    });
    if (!registered) {
      res.status(400).json({ ok: false, code: "invalid_value", error: "VIN nepatvirtintas." });
      return;
    }
    if (registered.outcome === "store_full") {
      res.status(429).json({ ok: false, code: "store_full", error: OUTCOME_MESSAGE_LT.store_full });
      return;
    }

    res.json({
      ok: true,
      outcome: "registered",
      draftScope,
      challenge: {
        challengeId: registered.challenge.challengeId,
        expiresAt: registered.challenge.expiresAt,
      },
      attributes: {
        ...CLEARED_PATCH,
        vin: "",
        vinCandidate: registered.challenge.vin ?? (registered.challenge.choices?.[0] ?? ""),
        vinCandidateSource: registered.challenge.provenance,
        vinUncertain: "true",
        vinReviewId: registered.challenge.reviewId,
        vinChallenge: registered.challenge.challengeId,
        vinDraftScope: registered.challenge.draftScope ?? "",
        ...(registered.challenge.choices
          ? {
              vinConflict: "true",
              vinConflictValue: registered.challenge.choices[1] ?? "",
              vinConflictSource: registered.challenge.provenance,
            }
          : {}),
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[vin-review] register failed:", msg.slice(0, 400));
    res.status(500).json({ ok: false, code: "vin_register_failed", error: "Nepavyko užregistruoti VIN." });
  }
});

vinReviewRouter.post("/confirm", async (req: AuthedRequest, res) => {
  try {
    const userId = String(req.authUserId ?? "").trim();
    if (!userId) {
      res.status(401).json({ ok: false, code: "auth_required", error: "Reikalingas prisijungimas." });
      return;
    }

    const body = (req.body ?? {}) as {
      challengeId?: unknown;
      value?: unknown;
      listingId?: unknown;
      draftScope?: unknown;
    };
    const challengeId = String(body.challengeId ?? "").trim();
    const vin = normalizeVin(String(body.value ?? ""));
    const listingId =
      typeof body.listingId === "string" && body.listingId.trim()
        ? body.listingId.trim()
        : undefined;
    const draftScope =
      typeof body.draftScope === "string" && body.draftScope.trim()
        ? body.draftScope.trim()
        : undefined;

    const result = consumeVinChallenge(
      { challengeId, userId, vin, listingId, draftScope },
      ({ userId: u, vin: v, reviewId: r, listingId: l, draftScope: s, challengeId: c }) =>
        confirmedAttributesPatch({
          vin: v,
          reviewId: r,
          listingId: l,
          draftScope: s,
          userId: u,
          challengeId: c,
        })
    );

    if (!result.ok) {
      const code = result.outcome;
      res.status(400).json({ ok: false, code, error: OUTCOME_MESSAGE_LT[result.outcome] });
      return;
    }

    const attrs = result.attrs ?? {};
    res.json({
      ok: true,
      outcome: result.outcome,
      attributes: attrs,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[vin-review] confirm failed:", msg.slice(0, 400));
    res.status(500).json({ ok: false, code: "vin_confirm_failed", error: "Nepavyko patvirtinti VIN." });
  }
});

vinReviewRouter.post("/reject", async (req: AuthedRequest, res) => {
  try {
    const userId = String(req.authUserId ?? "").trim();
    if (!userId) {
      res.status(401).json({ ok: false, code: "auth_required", error: "Reikalingas prisijungimas." });
      return;
    }
    const challengeId = String((req.body as { challengeId?: unknown })?.challengeId ?? "").trim();
    const result = rejectVinChallenge(challengeId, userId);
    if (!result.ok) {
      res.status(400).json({ ok: false, code: result.outcome, error: OUTCOME_MESSAGE_LT[result.outcome] });
      return;
    }
    res.json({ ok: true, outcome: "rejected", attributes: CLEARED_PATCH });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[vin-review] reject failed:", msg.slice(0, 400));
    res.status(500).json({ ok: false, code: "vin_reject_failed", error: "Nepavyko atmesti VIN." });
  }
});
