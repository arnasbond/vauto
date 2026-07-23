/**
 * Leading+trailing throttle for high-frequency UI updates (SSE status labels).
 * Invokes immediately, then at most once per `waitMs` with the latest args.
 */
export function createThrottleLeading<TArgs extends unknown[]>(
  fn: (...args: TArgs) => void,
  waitMs: number
): ((...args: TArgs) => void) & { flush: () => void; cancel: () => void } {
  let lastInvoke = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: TArgs | null = null;

  const invoke = (args: TArgs) => {
    lastInvoke = Date.now();
    pending = null;
    fn(...args);
  };

  const throttled = ((...args: TArgs) => {
    const now = Date.now();
    const elapsed = now - lastInvoke;
    pending = args;
    if (elapsed >= waitMs) {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      invoke(args);
      return;
    }
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      if (pending) invoke(pending);
    }, waitMs - elapsed);
  }) as ((...args: TArgs) => void) & { flush: () => void; cancel: () => void };

  throttled.flush = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (pending) invoke(pending);
  };

  throttled.cancel = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    pending = null;
  };

  return throttled;
}
