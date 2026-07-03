import { Router } from "express";
import { runVautoAgent } from "../ai/vauto-agent.js";
import type { VautoAgentResponse } from "../ai/vauto-agent.js";
import { normalizeAgentRouteError } from "../ai/agent-errors.js";
import { MAX_ADMIN_PROJECT_CONTEXT_CHARS } from "../ai/agent-system-instruction.js";
import type { AuthedRequest } from "../middleware/auth.js";
import { userIsAdmin } from "../middleware/auth.js";
import { getAdminAgentContext } from "../repository.js";
import { trimVautoAgentRequest } from "../ai/agent-request-trim.js";
import { hasAgentAiKey } from "../load-env.js";
import { resolveAuthenticatedAgentContext } from "../ai/user-agent-context.js";

export const vautoAgentRouter = Router();

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
          status: 403,
          body: {
            ok: false,
            code: "admin_required",
            error: "Admin access required",
          },
        },
      } as const;
    }
    if (!req.authUserId) {
      return {
        error: {
          status: 401,
          body: {
            ok: false,
            code: "auth_required",
            error: "Authentication required",
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
          status: 403,
          body: {
            ok: false,
            code: "admin_required",
            error: "Admin access required",
          },
        },
      } as const;
    }
    adminProjectContext = String(rawAdminContext)
      .trim()
      .slice(0, MAX_ADMIN_PROJECT_CONTEXT_CHARS);
  }

  const clientContext = context ?? {};
  const userCtx = await resolveAuthenticatedAgentContext(req.authUserId, {
    userName: clientContext.userName,
    accountType: clientContext.accountType,
    userCity: clientContext.userCity,
    contact: clientContext.contact,
    userRole: clientContext.userRole,
    isAuthenticated: clientContext.isAuthenticated,
    myListings: clientContext.myListings,
    myListingsSummary: clientContext.myListingsSummary,
  });

  return {
    request: trimVautoAgentRequest({
      messages,
      authUserId: req.authUserId,
      context: {
        ...clientContext,
        ...userCtx,
        isAuthenticated: userCtx.isAuthenticated,
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

    const result = await runVautoAgent(built.request);
    res.json(result);
  } catch (e) {
    const err = normalizeAgentRouteError(e);
    res.status(err.status).json({
      ok: false,
      code: err.code,
      error: err.message,
    });
  }
});

vautoAgentRouter.post("/stream", async (req: AuthedRequest, res) => {
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const writeEvent = (payload: unknown) => {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  try {
    const built = await buildAgentRequest(req);
    if ("error" in built && built.error) {
      return res.status(built.error.status).json(built.error.body);
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    if (typeof res.flushHeaders === "function") res.flushHeaders();

    heartbeat = setInterval(() => {
      try {
        res.write(": ping\n\n");
      } catch {
        if (heartbeat) clearInterval(heartbeat);
      }
    }, 20_000);

    const result = await runVautoAgent(built.request, {
      onEvent: (event) => writeEvent(event),
    });

    writeEvent({ type: "final", result } satisfies {
      type: "final";
      result: VautoAgentResponse;
    });
    res.end();
  } catch (e) {
    const err = normalizeAgentRouteError(e);
    try {
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
