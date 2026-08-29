/**
 * VAUTO AI Maturity — Phase 2A: Chat-Level Human Control Verification.
 *
 * Extracted, framework-free single-slot confirm-dialog controller.
 *
 * `VautoContext`'s `showConfirm()` is a general-purpose "ask the human"
 * primitive used both by direct UI buttons (dashboard delete/archive) and by
 * the AI chat consequential-action flow (`markListingSold` / `blockListing`
 * proposals in `VautoAgentContext.tsx`). Only ONE confirm dialog can be on
 * screen at a time.
 *
 * Required scenario 7 (intent pivot): if the user pivots to a second
 * consequential proposal (e.g. asks to block listing B) while an earlier
 * proposal's dialog (e.g. mark listing A sold) is still awaiting an answer,
 * the SECOND `show()` call must never silently strand the first promise
 * forever. Before this module existed, `VautoContext` held a single
 * `useRef` resolver that a second `showConfirm()` call overwrote outright —
 * the first promise never settled, so its caller's `if (!confirmed) {
 * apiCancelConsequentialAction(...) }` branch (see
 * `VautoAgentContext.tsx`) never ran, leaving the first proposal's pending
 * action to only ever be reclaimed by server-side TTL expiry instead of an
 * immediate, explicit cancel.
 *
 * This controller makes that supersede case deterministic: showing a new
 * dialog while one is outstanding resolves the outstanding one `false`
 * FIRST (exactly like the user clicking "cancel"), so every existing
 * call-site's already-correct `if (!confirmed)` cancellation logic fires
 * immediately instead of the proposal being silently orphaned.
 */

export interface ConfirmDialogController<T> {
  /**
   * Show a confirm prompt and resolve when it is dismissed.
   * If a previous prompt from this controller is still outstanding, it is
   * resolved `false` (superseded) before this one is shown.
   */
  show(opts: T): Promise<boolean>;
  /** Resolve the currently visible prompt. No-op if none is pending. */
  dismiss(confirmed: boolean): void;
  /** The prompt currently visible, or `null`. */
  current(): T | null;
}

export function createConfirmDialogController<T>(
  onSupersede?: (superseded: T) => void
): ConfirmDialogController<T> {
  let currentOpts: T | null = null;
  let currentResolve: ((value: boolean) => void) | null = null;

  function settleCurrent(confirmed: boolean): T | null {
    const opts = currentOpts;
    const resolve = currentResolve;
    currentOpts = null;
    currentResolve = null;
    resolve?.(confirmed);
    return opts;
  }

  return {
    show(opts: T) {
      if (currentResolve) {
        const superseded = settleCurrent(false);
        if (superseded !== null) onSupersede?.(superseded);
      }
      return new Promise<boolean>((resolve) => {
        currentOpts = opts;
        currentResolve = resolve;
      });
    },
    dismiss(confirmed: boolean) {
      settleCurrent(confirmed);
    },
    current() {
      return currentOpts;
    },
  };
}
