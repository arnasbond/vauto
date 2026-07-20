import type { PastomatasFlowState } from "./pastomatas-chat-flow.js";

const sessions = new Map<string, PastomatasFlowState>();

export function getPastomatasSession(key: string): PastomatasFlowState | null {
  return sessions.get(key) ?? null;
}

export function setPastomatasSession(key: string, state: PastomatasFlowState): void {
  sessions.set(key, state);
}

export function clearPastomatasSession(key: string): void {
  sessions.delete(key);
}
