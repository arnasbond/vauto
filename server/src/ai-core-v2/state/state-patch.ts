/**
 * VAUTO AI Core v2 — structured-state patch descriptor.
 *
 * A StatePatch is a single, provenance-carrying mutation to the interpreted
 * marketplace state. It lives in the state layer (not the reasoning layer)
 * so both state transitions and the reasoning contract can share it without
 * an inverted dependency.
 */
import type { Provenance } from "./marketplace-state.js";

export type StatePatch =
  | { op: "setHard"; key: string; value: string | number; provenance: Provenance }
  | { op: "removeHard"; key: string }
  | { op: "setSearchSubject"; subject: string; provenance: Provenance }
  | { op: "removeSearchSubject" }
  | { op: "addSoft"; label: string; provenance: Provenance }
  | { op: "removeSoft"; label: string }
  | { op: "setGoal"; goal: string }
  | { op: "setVertical"; vertical: string }
  | { op: "addUnresolved"; question: string }
  | { op: "resolveUnresolved"; question: string };
