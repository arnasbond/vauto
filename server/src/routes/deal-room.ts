/**
 * Stage 11E — Deal Room HTTP (read model + requireAuth).
 * No privileged /deal-room/action endpoint.
 */

import { Router } from "express";
import { ZodError } from "zod";
import type { AuthedRequest } from "../middleware/auth.js";
import { requireAuth } from "../middleware/auth.js";
import { sendInternalError } from "../lib/http-errors.js";
import { getUser } from "../repository.js";
import {
  createDealRoomService,
  DealRoomAuthError,
  DealRoomNotFoundError,
  DealRoomVersionConflictError,
  DealRoomValidationError,
  DEAL_ROOM_VERSION,
} from "../deal-room/index.js";
import { createPoolTxQueryable } from "../transaction/index.js";

export const dealRoomRouter = Router();

function mapError(res: import("express").Response, e: unknown): boolean {
  if (e instanceof ZodError || e instanceof DealRoomValidationError) {
    res.status(400).json({
      error: "validation_error",
      message: e instanceof Error ? e.message : "invalid",
      dealRoomVersion: DEAL_ROOM_VERSION,
    });
    return true;
  }
  if (
    e instanceof DealRoomNotFoundError ||
    e instanceof DealRoomAuthError
  ) {
    // IDOR: identical 404
    res.status(404).json({ error: "not_found", message: "Not found" });
    return true;
  }
  if (e instanceof DealRoomVersionConflictError) {
    res.status(409).json({ error: e.code, message: e.message });
    return true;
  }
  return false;
}

dealRoomRouter.get(
  "/transactions/:id/deal-room",
  requireAuth,
  async (req: AuthedRequest, res) => {
    try {
      const svc = createDealRoomService(createPoolTxQueryable(), {
        participants: {
          async loadParticipant(userId) {
            let u: Awaited<ReturnType<typeof getUser>> = null;
            try {
              u = await getUser(userId);
            } catch {
              return null;
            }
            if (!u) return null;
            const displayName =
              String(u.nickname ?? "").trim() ||
              String(u.name ?? "").trim() ||
              "Narys";
            return {
              displayName: displayName.slice(0, 80),
              avatarUrl: u.avatar ? String(u.avatar) : null,
              verified: Boolean(
                (u as { isVerified?: boolean }).isVerified ??
                  u.role === "verified"
              ),
            };
          },
        },
      });
      const room = await svc.getDealRoom({
        transactionId: req.params.id,
        actorUserId: req.authUserId!,
        query: req.query,
      });
      res.json(room);
    } catch (e) {
      if (mapError(res, e)) return;
      sendInternalError(res, e);
    }
  }
);
