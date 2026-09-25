import { Router } from "express";
import type { VautoAgentResponse } from "../agent-core/agent-types.js";
import { normalizeAgentRouteError } from "../ai/agent-errors.js";
import { MAX_ADMIN_PROJECT_CONTEXT_CHARS } from "../ai/agent-system-instruction.js";
import type { AuthedRequest } from "../middleware/auth.js";
import { optionalAuth, requireAuth, userIsAdmin } from "../middleware/auth.js";
import { getAdminAgentContext } from "../repository.js";
import { trimVautoAgentRequest } from "../ai/agent-request-trim.js";
import { hasAgentAiKey } from "../load-env.js";
import { resolveAuthenticatedAgentContext } from "../ai/user-agent-context.js";
import { isGenericListingDraftTitle } from "../shared/listing-organism.js";
import {
  claimThreadForUser,
  discoverActiveDraftThreads,
  runThreadTurn,
  syncListingDraft,
} from "../agent-core/thread-service.js";

export const vautoAgentRouter = Router();

/**
 * FC-1 — authenticated active-draft discovery (cross-browser/device recovery).
 * GET /api/vauto-agent/draft — returns the caller's OWN draft threads (most
 * recent first), server-verified by JWT userId. No client pointer required;
 * intentionally separate drafts are returned as a LIST and never merged.
 */
vautoAgentRouter.get("/draft", requireAuth, async (req: AuthedRequest, res) => {
  const userId = req.authUserId;
  if (!userId) {
    res.status(401).json({ ok: false, code: "auth_required" });
    return;
  }
  try {
    const drafts = await discoverActiveDraftThreads(userId);
    res.json({ ok: true, drafts });
  } catch (e) {
    const err = normalizeAgentRouteError(e);
    res.status(err.status).json({ ok: false, code: err.code, error: err.message });
  }
});

/**
 * FC-1 — authenticated draft synchronization (client → canonical server).
 * POST /api/vauto-agent/draft/sync — merges a client-proposed delta into the
 * caller's OWN canonical draft with OCC (`expectedVersion`). A stale client
 * cannot silently overwrite a newer draft (409 stale_version). The browser
 * proposes; the server owns, whitelists and validates canonical state.
 */
vautoAgentRouter.post("/draft/sync", requireAuth, async (req: AuthedRequest, res) => {
  const userId = req.authUserId;
  if (!userId) {
    res.status(401).json({ ok: false, code: "auth_required" });
    return;
  }
  const body = req.body as {
    threadId?: unknown;
    expectedVersion?: unknown;
    delta?: unknown;
  };
  const threadId = typeof body?.threadId === "string" ? body.threadId.trim() : "";
  const delta =
    body?.delta && typeof body.delta === "object" && !Array.isArray(body.delta)
      ? (body.delta as Record<string, unknown>)
      : null;
  const expectedVersion =
    typeof body?.expectedVersion === "number" ? body.expectedVersion : undefined;
  if (!threadId || !delta) {
    res.status(400).json({ ok: false, code: "invalid_request" });
    return;
  }
  try {
    const result = await syncListingDraft({ userId, threadId, expectedVersion, delta });
    if (!result.ok) {
      const status =
        result.reason === "stale_version" ? 409 : result.reason === "not_found" ? 404 : 403;
      res.status(status).json({ ok: false, code: result.reason });
      return;
    }
    res.json({ ok: true, draft: result.draft, version: result.version });
  } catch (e) {
    const err = normalizeAgentRouteError(e);
    res.status(err.status).json({ ok: false, code: err.code, error: err.message });
  }
});

async function buildAgentRequest(req: AuthedRequest) {
  const {
    messages,
    context,
    adminProjectContext: rawAdminContext,
    includeAdminContext,
  } = req.body ?? {};

  if (!Array.isArray(messages) || !messages.length) {
    return {
      error: {
        status: 400,
        body: {
          ok: false,
          code: "invalid_request",
          error: "messages array is required",
        },
      },
    } as const;
  }

  if (!hasAgentAiKey()) {
    return {
      error: {
        status: 503,
        body: {
          ok: false,
          code: "agent_unavailable",
          error: "AI agent unavailable (set GEMINI_API_KEY on the server)",
        },
      },
    } as const;
  }

  let adminProjectContext: string | undefined;

  if (includeAdminContext === true) {
    const isAdmin = await userIsAdmin(req);
    if (!isAdmin) {
      return {
        error: {
          status: 404,
          body: {
            ok: false,
            error: "Not found",
          },
        },
      } as const;
    }
    if (!req.authUserId) {
      return {
        error: {
          status: 404,
          body: {
            ok: false,
            error: "Not found",
          },
        },
      } as const;
    }
    try {
      const fromDb = await getAdminAgentContext(req.authUserId);
      if (fromDb.trim()) {
        adminProjectContext = fromDb.trim().slice(0, MAX_ADMIN_PROJECT_CONTEXT_CHARS);
      }
    } catch (e) {
      const err = normalizeAgentRouteError(e);
      return {
        error: {
          status: err.status,
          body: { ok: false, code: err.code, error: err.message },
        },
      } as const;
    }
  } else if (rawAdminContext != null && String(rawAdminContext).trim()) {
    const isAdmin = await userIsAdmin(req);
    if (!isAdmin) {
      return {
        error: {
          status: 404,
          body: {
            ok: false,
            error: "Not found",
          },
        },
      } as const;
    }
    adminProjectContext = String(rawAdminContext)
      .trim()
      .slice(0, MAX_ADMIN_PROJECT_CONTEXT_CHARS);
  }

  const clientContext = context ?? {};
  const omitPrior =
    Boolean(clientContext.omitPriorListingDraft) ||
    Boolean(clientContext.freshListingSession);
  const priorTitle = String(clientContext.listingDraft?.title ?? "").trim();
  // P0 — a generic seed title is UI-only state. The route boundary never
  // re-synthesizes a price-carrier draft from it: the generic draft is
  // dropped entirely and the turn runs through fresh-create extraction
  // (the current user text is the single fact authority).
  const priorTitleIsGeneric = isGenericListingDraftTitle(priorTitle);
  const userCtx = await resolveAuthenticatedAgentContext(req.authUserId, {
    userName: clientContext.userName,
    accountType: clientContext.accountType,
    userCity: clientContext.userCity,
    contact: clientContext.contact,
    userRole: clientContext.userRole,
    isAuthenticated: clientContext.isAuthenticated,
    myListings: omitPrior ? [] : clientContext.myListings,
    myListingsSummary: omitPrior ? "" : clientContext.myListingsSummary,
    omitPriorListingDraft: omitPrior || undefined,
    freshListingSession: clientContext.freshListingSession || undefined,
  });

  return {
    request: trimVautoAgentRequest({
      messages,
      authUserId: req.authUserId,
      context: {
        ...clientContext,
        ...userCtx,
        isAuthenticated: userCtx.isAuthenticated,
        ...(omitPrior
          ? {
              listings: [],
              myListings: [],
              myListingsSummary: "",
              // Keep a real Vision draft; strip only stale/generic titles —
              // never fabricate a price-carrier draft from a generic seed.
              listingDraft: priorTitleIsGeneric
                ? undefined
                : clientContext.listingDraft,
              omitPriorListingDraft: true,
              freshListingSession:
                Boolean(clientContext.freshListingSession) || omitPrior || undefined,
            }
          : {}),
      },
      adminProjectContext,
    }),
  } as const;
}

vautoAgentRouter.post("/", async (req: AuthedRequest, res) => {
  try {
    const built = await buildAgentRequest(req);
    if ("error" in built && built.error) {
      return res.status(built.error.status).json(built.error.body);
    }

    const pendingImages =
      (Array.isArray(built.request.context?.pendingImageUrls)
        ? built.request.context.pendingImageUrls.filter(Boolean).length
        : 0) ||
      Number(built.request.context?.pendingImageCount ?? 0) ||
      (Array.isArray(req.body?.pendingImageUrls)
        ? req.body.pendingImageUrls.filter(Boolean).length
        : 0);
    // Guest search OK; Vision / photo listing pipeline still requires login (cost + abuse).
    if (!req.authUserId && pendingImages > 0) {
      return res.status(401).json({
        ok: false,
        code: "auth_required",
        error: "Norėdami siųsti nuotraukas AI asistentui, prisijunkite.",
      });
    }

    // E1.1 — SINGLE entry point: the legacy JSON endpoint delegates to the
    // SAME ThreadService as /stream. There is no path that bypasses the
    // server-authoritative thread boundary.
    const threadId = String(req.body?.threadId ?? "").trim() || null;
    const anonSessionToken = String(req.body?.anonSessionToken ?? "").trim() || null;
    const turnId = String(req.body?.turnId ?? "").trim() || null;
    const threadTurn = await runThreadTurn({
      threadId,
      anonSessionToken,
      turnId,
      authUserId: req.authUserId ?? null,
      clientMessages: (req.body?.messages ?? []) as Array<{
        role?: string;
        text?: string;
      }>,
      context: built.request.context as Record<string, unknown>,
    });
    res.json({ ...threadTurn.response, thread: threadTurn.thread });
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    if (/thread_ownership_violation/.test(raw)) {
      res.status(403).json({ ok: false, code: "thread_ownership_violation", error: raw });
      return;
    }
    if (/turn_in_progress/.test(raw)) {
      res.status(409).json({ ok: false, code: "turn_in_progress", error: raw });
      return;
    }
    if (/turn_indeterminate/.test(raw)) {
      res.status(409).json({ ok: false, code: "turn_indeterminate", error: raw });
      return;
    }
    if (/turn_ledger_conflict/.test(raw)) {
      res.status(500).json({ ok: false, code: "turn_ledger_conflict", error: raw });
      return;
    }
    if (/core_v2_empty_visible_response/.test(raw)) {
      res.status(500).json({ ok: false, code: "core_v2_empty_visible_response", error: raw });
      return;
    }
    if (/thread_update_contention/.test(raw)) {
      res.status(409).json({ ok: false, code: "thread_update_contention", error: raw });
      return;
    }
    const err = normalizeAgentRouteError(e);
    res.status(err.status).json({
      ok: false,
      code: err.code,
      error: err.message,
    });
  }
});

/**
 * E1 — anonymous → authenticated thread attach. Only the session that holds
 * the server-issued anon token can bind the thread; an already-bound thread
 * can never be hijacked.
 */
vautoAgentRouter.post("/threads/:threadId/claim", optionalAuth, async (req: AuthedRequest, res) => {
  try {
    if (!req.authUserId) {
      res.status(401).json({ ok: false, code: "auth_required", error: "Prisijunkite." });
      return;
    }
    const anonSessionToken = String(req.body?.anonSessionToken ?? "").trim();
    if (!anonSessionToken) {
      res.status(400).json({ ok: false, code: "invalid_request", error: "anonSessionToken is required" });
      return;
    }
    const result = await claimThreadForUser(
      req.params.threadId,
      req.authUserId,
      anonSessionToken
    );
    if (!result.ok) {
      const status = result.reason === "not_found" ? 404 : 403;
      res.status(status).json({ ok: false, code: result.reason });
      return;
    }
    res.json({ ok: true, threadId: result.threadId, version: result.version });
  } catch (e) {
    const err = normalizeAgentRouteError(e);
    res.status(err.status).json({ ok: false, code: err.code, error: err.message });
  }
});

export function mapAgentErrorToStreamCode(threadErr: unknown): string {
  const message = threadErr instanceof Error ? threadErr.message : String(threadErr ?? "");
  const rawCode = (threadErr as { code?: string })?.code;
  return rawCode === "malformed_json" || /malformed_json/.test(message)
    ? "malformed_json"
    : rawCode === "schema_invalid" || /schema_invalid/.test(message)
      ? "schema_invalid"
      : rawCode === "turn_budget_exceeded" || /turn_budget_exceeded/.test(message)
        ? "turn_budget_exceeded"
        : rawCode === "provider_unavailable" || /provider_unavailable/.test(message)
          ? "provider_unavailable"
          : rawCode === "timeout" || /timeout/.test(message)
            ? "timeout"
            : /ownership/.test(message)
              ? "thread_ownership_violation"
              : /empty_user_turn/.test(message)
                ? "invalid_request"
                : /turn_in_progress/.test(message)
                  ? "turn_in_progress"
                  : /turn_indeterminate/.test(message)
                    ? "turn_indeterminate"
                    : /turn_ledger_conflict/.test(message)
                      ? "turn_ledger_conflict"
                      : /core_v2_empty_visible_response/.test(message)
                        ? "core_v2_empty_visible_response"
                        : /thread_update_contention/.test(message)
                          ? "thread_update_contention"
                          : "agent_error";
}

/** SSE comment + status keep-alive so Vercel/Render idle proxies never cut Vision OCR. */
const STREAM_HEARTBEAT_MS = 10_000;

vautoAgentRouter.post("/stream", async (req: AuthedRequest, res) => {
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let streamOpened = false;

  const writeRaw = (chunk: string) => {
    try {
      res.write(chunk);
      const flushable = res as typeof res & { flush?: () => void };
      flushable.flush?.();
    } catch {
      /* client gone */
    }
  };

  const writeEvent = (payload: unknown) => {
    writeRaw(`data: ${JSON.stringify(payload)}\n\n`);
  };

  const openSse = () => {
    if (streamOpened) return;
    streamOpened = true;
    res.status(200);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    if (typeof res.flushHeaders === "function") res.flushHeaders();
    // Immediate bytes so proxies mark the response as live before Gemini work.
    writeRaw(": connected\n\n");
    writeEvent({ type: "status", message: "Galvoju…" });
    // Comment-only pings keep proxies alive without spamming the chat UI label.
    heartbeat = setInterval(() => {
      writeRaw(": ping\n\n");
    }, STREAM_HEARTBEAT_MS);
  };

  try {
    // Flush SSE headers BEFORE auth/DB/Gemini so idle proxies never wait on prep.
    openSse();

    const built = await buildAgentRequest(req);
    if ("error" in built && built.error) {
      writeEvent({
        type: "error",
        code: built.error.body.code,
        message: built.error.body.error,
      });
      res.end();
      return;
    }

    const pendingVision =
      (Array.isArray(built.request.context?.pendingImageUrls)
        ? built.request.context.pendingImageUrls.filter(Boolean).length
        : 0) ||
      Number(built.request.context?.pendingImageCount ?? 0) ||
      (Array.isArray(req.body?.pendingImageUrls)
        ? req.body.pendingImageUrls.filter(Boolean).length
        : 0);

    if (!req.authUserId && pendingVision > 0) {
      writeEvent({
        type: "error",
        code: "auth_required",
        message: "Norėdami siųsti nuotraukas AI asistentui, prisijunkite.",
      });
      res.end();
      return;
    }

    writeEvent({
      type: "status",
      message:
        pendingVision > 0 ? "Jungiuosi prie Vision…" : "Ieškau kataloge…",
    });

    // E1 — server-authoritative thread boundary: the client supplies the
    // current user message + optional threadId; conversation history and
    // structured state come from the server thread store (assistant turns
    // are written only by the server). Client messages are used ONLY to
    // extract the new user turn — never to reconstruct canonical history.
    const threadId = String(req.body?.threadId ?? "").trim() || null;
    const anonSessionToken = String(req.body?.anonSessionToken ?? "").trim() || null;
    const turnId = String(req.body?.turnId ?? "").trim() || null;
    let threadTurn;
    try {
      threadTurn = await runThreadTurn({
        threadId,
        anonSessionToken,
        turnId,
        authUserId: req.authUserId ?? null,
        clientMessages: (req.body?.messages ?? []) as Array<{
          role?: string;
          text?: string;
        }>,
        context: built.request.context as Record<string, unknown>,
        onEvent: (event) => writeEvent(event),
      });
    } catch (threadErr) {
      const message = threadErr instanceof Error ? threadErr.message : String(threadErr);
      const code = mapAgentErrorToStreamCode(threadErr);
      const error = threadErr instanceof Error ? threadErr : new Error(String(threadErr));
      console.warn("[core-v2-diag] stream_error", {
        threadId: String(req.body?.threadId ?? "").trim() || null,
        turnId: String(req.body?.turnId ?? "").trim() || null,
        errorClass: error.name || "Error",
        errorCode: (error as Error & { code?: unknown }).code ?? null,
        mappedCode: code,
      });
      writeEvent({ type: "error", code, message });
      res.end();
      return;
    }

    console.warn("[core-v2-diag] stream_final", {
      threadId: threadTurn.thread.threadId,
      visibleText: Boolean(String(threadTurn.response.reply ?? "").trim()),
      executableAction: threadTurn.response.actions.type !== "none",
      capabilityResult: threadTurn.response.toolCalls.length > 0,
    });
    writeEvent({
      type: "final",
      result: { ...threadTurn.response, thread: threadTurn.thread },
    } satisfies { type: "final"; result: VautoAgentResponse & { thread: unknown } });
    res.end();
  } catch (e) {
    const err = normalizeAgentRouteError(e);
    const error = e instanceof Error ? e : new Error(String(e));
    console.warn("[core-v2-diag] stream_outer_error", {
      threadId: String(req.body?.threadId ?? "").trim() || null,
      turnId: String(req.body?.turnId ?? "").trim() || null,
      errorClass: error.name || "Error",
      errorCode: (error as Error & { code?: unknown }).code ?? null,
      normalizedCode: err.code,
    });
    try {
      if (!streamOpened) openSse();
      writeEvent({
        type: "error",
        code: err.code,
        message: err.message,
      });
      res.end();
    } catch {
      if (!res.headersSent) {
        res.status(err.status).json({
          ok: false,
          code: err.code,
          error: err.message,
        });
      }
    }
  } finally {
    if (heartbeat) clearInterval(heartbeat);
  }
});
