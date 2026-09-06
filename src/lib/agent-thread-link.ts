/**
 * E1.1 — client-side thread LINK (memory only, not authority).
 *
 * The server owns the conversation. The client keeps ONLY:
 *  - threadId + version (attach to the server thread);
 *  - anonSessionToken — ONLY while the thread is anonymous; it is the
 *    ownership proof for anonymous continuation and for the
 *    POST /threads/:id/claim handoff after login. The token is never shown
 *    in the UI and never logged. After a successful claim it is removed.
 */

const STORAGE_KEY = "vauto_agent_thread_v1";

export interface AgentThreadLink {
  threadId: string;
  version: number;
  anonSessionToken?: string;
}

function storageAvailable(): boolean {
  try {
    return typeof window !== "undefined" && Boolean(window.localStorage);
  } catch {
    return false;
  }
}

export function readAgentThreadLink(): AgentThreadLink | null {
  if (!storageAvailable()) return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AgentThreadLink;
    if (!parsed.threadId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function persistAgentThreadLink(link: AgentThreadLink): void {
  if (!storageAvailable()) return;
  try {
    const stored: AgentThreadLink = {
      threadId: link.threadId,
      version: link.version,
      ...(link.anonSessionToken ? { anonSessionToken: link.anonSessionToken } : {}),
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch {
    /* storage full — thread simply re-created next turn */
  }
}

export function clearAgentThreadId(): void {
  if (!storageAvailable()) return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
