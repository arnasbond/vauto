/**
 * VAUTO AI Core v2 — pure state transition semantics.
 *
 * These encode the conversational update doctrine WITHOUT any language
 * interpretation. The reasoning layer decides WHICH transition to apply;
 * these functions only enforce the mechanics:
 *
 *   A. new constraint       → add
 *   B. changed constraint   → replace old value (never accumulate)
 *   C. removed constraint   → remove
 *   D. unspecified          → preserve
 *   E/F/G. provenance       → attached; never silently re-sourced
 *   H. pending action       → explicit, cleared only explicitly
 */
import type {
  CanonicalHardConstraintKey,
  HardConstraints,
  MarketplaceState,
  PendingAction,
  Provenance,
  SoftPreference,
} from "./marketplace-state.js";
import type { StatePatch } from "./state-patch.js";

export type HardConstraintKey = CanonicalHardConstraintKey;

/** Typed error for a malformed/unknown state patch — classified by the shadow harness. */
export class StateTransitionError extends Error {
  readonly code = "state_transition_error";
  constructor(message: string) {
    super(message);
    this.name = "StateTransitionError";
  }
}

export function setHardConstraint(
  state: MarketplaceState,
  key: HardConstraintKey,
  value: string | number,
  p: Provenance
): MarketplaceState {
  return {
    ...state,
    hardConstraints: { ...state.hardConstraints, [key]: value },
    hardConstraintProvenance: {
      ...state.hardConstraintProvenance,
      [key]: p,
    },
  };
}

export function removeHardConstraint(
  state: MarketplaceState,
  key: HardConstraintKey
): MarketplaceState {
  const next: HardConstraints = { ...state.hardConstraints };
  delete next[key];
  const nextProv = { ...state.hardConstraintProvenance };
  delete nextProv[key];
  return { ...state, hardConstraints: next, hardConstraintProvenance: nextProv };
}

export function addSoftPreference(
  state: MarketplaceState,
  label: string,
  p: Provenance
): MarketplaceState {
  const existing = state.softPreferences.some((s) => s.label === label);
  if (existing) {
    // Re-stated preference: update provenance, do not duplicate.
    return {
      ...state,
      softPreferences: state.softPreferences.map((s) =>
        s.label === label ? ({ label, provenance: p } satisfies SoftPreference) : s
      ),
    };
  }
  return {
    ...state,
    softPreferences: [...state.softPreferences, { label, provenance: p }],
  };
}

export function removeSoftPreference(
  state: MarketplaceState,
  label: string
): MarketplaceState {
  return {
    ...state,
    softPreferences: state.softPreferences.filter((s) => s.label !== label),
  };
}

export function addExclusion(
  state: MarketplaceState,
  label: string,
  p: Provenance
): MarketplaceState {
  const existing = state.exclusions.some((e) => e.label === label);
  if (existing) {
    return {
      ...state,
      exclusions: state.exclusions.map((e) =>
        e.label === label ? { label, provenance: p } : e
      ),
    };
  }
  return { ...state, exclusions: [...state.exclusions, { label, provenance: p }] };
}

export function removeExclusion(
  state: MarketplaceState,
  label: string
): MarketplaceState {
  return { ...state, exclusions: state.exclusions.filter((e) => e.label !== label) };
}

export function setGoal(state: MarketplaceState, goal: string): MarketplaceState {
  return { ...state, goal };
}

export function setVertical(state: MarketplaceState, vertical: string): MarketplaceState {
  return { ...state, vertical };
}

export function setSearchSubject(
  state: MarketplaceState,
  subject: string,
  p: Provenance
): MarketplaceState {
  return { ...state, searchSubject: subject, searchSubjectProvenance: p };
}

export function removeSearchSubject(state: MarketplaceState): MarketplaceState {
  const next = { ...state };
  delete next.searchSubject;
  delete next.searchSubjectProvenance;
  return next;
}

export function addUnresolved(state: MarketplaceState, question: string): MarketplaceState {
  if (state.unresolved.includes(question)) return state;
  return { ...state, unresolved: [...state.unresolved, question] };
}

export function resolveUnresolved(state: MarketplaceState, question: string): MarketplaceState {
  return { ...state, unresolved: state.unresolved.filter((q) => q !== question) };
}

export function setSelectedListings(
  state: MarketplaceState,
  ids: string[]
): MarketplaceState {
  return { ...state, selectedListingIds: [...ids] };
}

export function setPendingAction(
  state: MarketplaceState,
  action: PendingAction
): MarketplaceState {
  return { ...state, pendingAction: action };
}

export function clearPendingAction(state: MarketplaceState): MarketplaceState {
  const next = { ...state };
  delete next.pendingAction;
  return next;
}

/**
 * Apply a composable reasoning decision's state patches onto a state COPY.
 * Pure and deterministic; throws on an unknown op so a malformed patch is
 * classified (never silently ignored, never partially applied).
 */
export function applyStatePatches(
  state: MarketplaceState,
  patches: StatePatch[]
): MarketplaceState {
  let s = state;
  for (const patch of patches) {
    switch (patch.op) {
      case "setHard":
        s = setHardConstraint(s, patch.key as HardConstraintKey, patch.value, patch.provenance);
        break;
      case "removeHard":
        s = removeHardConstraint(s, patch.key as HardConstraintKey);
        break;
      case "addSoft":
        s = addSoftPreference(s, patch.label, patch.provenance);
        break;
      case "removeSoft":
        s = removeSoftPreference(s, patch.label);
        break;
      case "addExclusion":
        s = addExclusion(s, patch.label, patch.provenance);
        break;
      case "removeExclusion":
        s = removeExclusion(s, patch.label);
        break;
      case "setGoal":
        s = setGoal(s, patch.goal);
        break;
      case "setVertical":
        s = setVertical(s, patch.vertical);
        break;
      case "setSearchSubject":
        s = setSearchSubject(s, patch.subject, patch.provenance);
        break;
      case "removeSearchSubject":
        s = removeSearchSubject(s);
        break;
      case "addUnresolved":
        s = addUnresolved(s, patch.question);
        break;
      case "resolveUnresolved":
        s = resolveUnresolved(s, patch.question);
        break;
      default:
        throw new StateTransitionError(
          `unknown state patch op: ${(patch as { op?: unknown }).op}`
        );
    }
  }
  return s;
}
