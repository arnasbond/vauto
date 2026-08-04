/**
 * Registers the VAUTO shell service worker and applies updates without a
 * manual Safari refresh. New workers call skipWaiting(); we reload once the
 * controlling SW changes after an update (not on first install).
 */

const UPDATE_POLL_MS = 5 * 60 * 1000;

export function registerVautoServiceWorker(): () => void {
  if (typeof window === "undefined") return () => {};
  if (!("serviceWorker" in navigator)) return () => {};

  let cancelled = false;
  let pollTimer: number | undefined;
  let hadController = Boolean(navigator.serviceWorker.controller);

  const onControllerChange = () => {
    // First claim (no prior controller) — do not force a full reload.
    if (!hadController) {
      hadController = true;
      return;
    }
    window.location.reload();
  };

  navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

  void navigator.serviceWorker
    .register("/sw.js")
    .then((reg) => {
      if (cancelled) return;

      const askUpdate = () => {
        void reg.update().catch(() => {
          /* offline / blocked */
        });
      };

      askUpdate();
      pollTimer = window.setInterval(askUpdate, UPDATE_POLL_MS);

      reg.addEventListener("updatefound", () => {
        const installing = reg.installing;
        if (!installing) return;
        installing.addEventListener("statechange", () => {
          if (installing.state !== "installed") return;
          // With skipWaiting the new worker activates; controllerchange reloads.
          // If a waiting worker somehow remains, nudge it.
          if (reg.waiting) {
            reg.waiting.postMessage({ type: "SKIP_WAITING" });
          }
        });
      });

      if (reg.waiting) {
        reg.waiting.postMessage({ type: "SKIP_WAITING" });
      }
    })
    .catch(() => {
      /* offline shell optional */
    });

  return () => {
    cancelled = true;
    if (pollTimer != null) window.clearInterval(pollTimer);
    navigator.serviceWorker.removeEventListener(
      "controllerchange",
      onControllerChange
    );
  };
}
