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
import { provenance } from "../state/marketplace-state.js";
import type { StatePatch } from "../state/state-patch.js";
import {
  claimFromPatch,
  continuityVerifier,
  type AuthorityVerifier,
} from "./authority-verifier.js";

function isUserStated(p: StatePatch): boolean {
  return (
    (p.op === "setHard" || p.op === "setSearchSubject") &&
    p.provenance?.source === "USER_STATED"
  );
}

function demote(patch: StatePatch): StatePatch {
  if (patch.op === "setHard") return { ...patch, provenance: provenance("MODEL_INFERRED") };
  if (patch.op === "setSearchSubject") return { ...patch, provenance: provenance("MODEL_INFERRED") };
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
