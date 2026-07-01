/** In-flight gate — one conductor execute at a time; busy routes fall back to legacy. */
let inFlight = 0;

export function conductorTryAcquire(): boolean {
  if (inFlight > 0) return false;
  inFlight = 1;
  return true;
}

export function conductorRelease(): void {
  inFlight = Math.max(0, inFlight - 1);
}

export function conductorIsBusy(): boolean {
  return inFlight > 0;
}
