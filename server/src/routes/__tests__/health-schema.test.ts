/**
 * Stage 16R.1 — /api/health DB vs schema observability semantics.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import express from "express";
import request from "supertest";
import { toPublicSchemaStatus } from "../../migrate.js";

describe("16R.1 /api/health schema semantics", () => {
  it("DB disconnected is HTTP 503 unhealthy, not schema-current", async () => {
    const app = express();
    app.get("/api/health", (_req, res) => {
      res.status(503).json({
        ok: false,
        db: "unavailable",
        schema: toPublicSchemaStatus({
          state: "unavailable",
          upToDate: false,
          expectedCount: 0,
          appliedCount: 0,
          latestApplied: null,
          pending: [],
        }),
      });
    });
    const res = await request(app).get("/api/health");
    assert.equal(res.status, 503);
    assert.equal(res.body.ok, false);
    assert.equal(res.body.db, "unavailable");
    assert.equal(res.body.schema.state, "unavailable");
    assert.equal(res.body.schema.upToDate, false);
  });

  it("schema unavailable is an explicit observability state, not release-ready", () => {
    const schema = toPublicSchemaStatus({
      state: "unavailable",
      upToDate: true,
      expectedCount: 64,
      appliedCount: 64,
      latestApplied: "062.sql",
      pending: [],
    });
    assert.equal(schema.state, "unavailable");
    assert.equal(schema.upToDate, false);
  });

  it("pending migrations report upToDate=false", () => {
    const schema = toPublicSchemaStatus({
      state: "pending",
      upToDate: false,
      expectedCount: 64,
      appliedCount: 60,
      latestApplied: "058.sql",
      pending: ["059.sql", "060.sql"],
    });
    assert.equal(schema.state, "pending");
    assert.equal(schema.upToDate, false);
    assert.equal(schema.pendingCount, 2);
  });

  it("current migrations report upToDate=true only with state=current", () => {
    const schema = toPublicSchemaStatus({
      state: "current",
      upToDate: true,
      expectedCount: 64,
      appliedCount: 64,
      latestApplied: "062.sql",
      pending: [],
    });
    assert.equal(schema.state, "current");
    assert.equal(schema.upToDate, true);
  });
});
