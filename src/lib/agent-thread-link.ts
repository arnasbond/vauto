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

export function persistAgentThreadLink(link: AgentThreadLink, source = "unspecified"): void {
  if (!storageAvailable()) return;
  try {
    const existing = readAgentThreadLink();
    const anonSessionToken =
      link.anonSessionToken ??
      (existing?.threadId === link.threadId ? existing.anonSessionToken : undefined);
    const stored: AgentThreadLink = {
      threadId: link.threadId,
      version: link.version,
      ...(anonSessionToken ? { anonSessionToken } : {}),
    };
    console.warn("[thread-diag] persistAgentThreadLink", {
      source,
      prevThreadId: existing?.threadId ?? null,
      nextThreadId: stored.threadId,
      prevTokenPresent: Boolean(existing?.anonSessionToken),
      nextTokenPresent: Boolean(stored.anonSessionToken),
      version: stored.version,
    });
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch {
    /* storage full — thread simply re-created next turn */
  }
}

export function clearAgentThreadId(reason = "unspecified"): void {
  if (!storageAvailable()) return;
  try {
    const existing = readAgentThreadLink();
    console.warn("[thread-diag] clearAgentThreadId", {
      reason,
      prevThreadId: existing?.threadId ?? null,
      tokenPresent: Boolean(existing?.anonSessionToken),
    });
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
