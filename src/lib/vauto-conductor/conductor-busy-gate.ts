/** In-flight gate — one conductor execute at a time; busy routes fall back to legacy. */
let inFlight = 0;
let agentBusy = false;

/** Mirror VautoAgent busy state so conductor does not race agent fetches. */
export function conductorSetAgentBusy(busy: boolean): void {
  agentBusy = busy;
}

export function conductorTryAcquire(): boolean {
  if (inFlight > 0 || agentBusy) return false;
  inFlight = 1;
  return true;
}

export function conductorRelease(): void {
  inFlight = Math.max(0, inFlight - 1);
}

export function conductorIsBusy(): boolean {
  return inFlight > 0;
}
