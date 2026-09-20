/**
 * VAUTO AI Core v2 — structured-state patch descriptor.
 *
 * A StatePatch is a single, provenance-carrying mutation to the interpreted
 * marketplace state. It lives in the state layer (not the reasoning layer)
 * so both state transitions and the reasoning contract can share it without
 * an inverted dependency.
 */
import type { CanonicalHardConstraintKey, Provenance } from "./marketplace-state.js";

export type StatePatch =
  | { op: "setHard"; key: CanonicalHardConstraintKey; value: string | number; provenance: Provenance; evidence?: string }
  | { op: "removeHard"; key: CanonicalHardConstraintKey }
  | { op: "setSearchSubject"; subject: string; provenance: Provenance; evidence?: string }
  | { op: "removeSearchSubject" }
  | { op: "addSoft"; label: string; provenance: Provenance }
  | { op: "removeSoft"; label: string }
  | { op: "addExclusion"; label: string; provenance: Provenance; evidence?: string }
  | { op: "removeExclusion"; label: string }
  | { op: "setGoal"; goal: string }
  | { op: "setVertical"; vertical: string }
  | { op: "addUnresolved"; question: string }
  | { op: "resolveUnresolved"; question: string };
