/**
 * VAUTO AI Core v2.3 — grounding: MODEL OUTPUT CANNOT SELF-GRANT EXECUTION
 * AUTHORITY.
 *
 * For each model-proposed USER_STATED hard constraint / search subject, a
 * structurally-separate AUTHORITY VERIFIER judges whether the normalized
 * value is actually entailed by its evidence. Only VERIFIED_USER_INTENT stays
 * execution-eligible; CONTRADICTED/AMBIGUOUS/UNSUPPORTED are demoted to
 * MODEL_INFERENCE (non-executable). The default verifier is deterministic and
 * conservative (continuity only); a narrow model verifier may be injected for
 * semantic entailment. No substring authority, no linguistic parser.
 */
import type { MarketplaceState } from "../state/marketplace-state.js";
import { provenance, isExecutionEligible } from "../state/marketplace-state.js";
import type { StatePatch } from "../state/state-patch.js";
import {
  claimFromPatch,
  continuityVerifier,
  type AuthorityVerifier,
} from "./authority-verifier.js";

function isUserStated(p: StatePatch): boolean {
  return (
    (p.op === "setHard" || p.op === "setSearchSubject" || p.op === "addExclusion") &&
    p.provenance?.source === "USER_STATED"
  );
}

/** Removal/retraction ops that can target authoritative (execution-relevant) state. */
function isRemoval(p: StatePatch): boolean {
  return p.op === "removeHard" || p.op === "removeSearchSubject" || p.op === "removeExclusion";
}

/**
 * Does this removal target previously VERIFIED (USER_STATED) authoritative
 * state? Removing/weakening authoritative user state requires the SAME
 * verified authority as the mutation that created it.
 */
function removesAuthoritativeState(state: MarketplaceState, patch: StatePatch): boolean {
  if (patch.op === "removeHard") {
    return isExecutionEligible(state.hardConstraintProvenance[patch.key]);
  }
  if (patch.op === "removeSearchSubject") {
    return isExecutionEligible(state.searchSubjectProvenance);
  }
  if (patch.op === "removeExclusion") {
    return state.exclusions.some(
      (e) => e.label === patch.label && isExecutionEligible(e.provenance)
    );
  }
  return false;
}

function demote(patch: StatePatch): StatePatch {
  if (patch.op === "setHard") return { ...patch, provenance: provenance("MODEL_INFERRED") };
  if (patch.op === "setSearchSubject") return { ...patch, provenance: provenance("MODEL_INFERRED") };
  if (patch.op === "addExclusion") return { ...patch, provenance: provenance("MODEL_INFERRED") };
  return patch;
}

export interface GroundedPatches {
  accepted: StatePatch[];
  rejectedAuthority: Array<{ patch: StatePatch; reason: string }>;
}

export async function groundStatePatches(
  state: MarketplaceState,
  patches: StatePatch[],
  userTurn: string,
  verifier: AuthorityVerifier = continuityVerifier
): Promise<GroundedPatches> {
  const accepted: StatePatch[] = [];
  const rejectedAuthority: GroundedPatches["rejectedAuthority"] = [];
  for (const patch of patches) {
    // Removal/retraction of AUTHORITATIVE state must be authority-verified.
    if (isRemoval(patch)) {
      if (removesAuthoritativeState(state, patch)) {
        const claim = claimFromPatch(patch);
        const verdict = claim ? await verifier(claim, { userTurn, priorState: state }) : "UNSUPPORTED";
        if (verdict === "VERIFIED_USER_INTENT") {
          accepted.push(patch);
        } else {
          // Fail closed: unsupported/ambiguous/contradicted removal does NOT erase
          // verified user intent.
          rejectedAuthority.push({ patch, reason: `authority verdict: ${verdict}` });
        }
      } else {
        // Removing non-authoritative (model-inferred / grounded-fact / absent)
        // state does not weaken user intent → no authority required.
        accepted.push(patch);
      }
      continue;
    }

    if (!isUserStated(patch)) {
      accepted.push(patch);
      continue;
    }
    const claim = claimFromPatch(patch);
    const verdict = claim ? await verifier(claim, { userTurn, priorState: state }) : "UNSUPPORTED";
    if (verdict === "VERIFIED_USER_INTENT") {
      accepted.push(patch);
    } else {
      accepted.push(demote(patch));
      rejectedAuthority.push({ patch, reason: `authority verdict: ${verdict}` });
    }
  }
  return { accepted, rejectedAuthority };
}
