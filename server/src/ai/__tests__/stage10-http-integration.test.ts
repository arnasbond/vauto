/**
 * Stage 10K — HTTP + Auth integration (supertest).
 * Proves 401, IDOR 403/404, and C-01 server-authoritative rejection.
 */

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import express from "express";
import request from "supertest";
import { signAccessToken } from "../../auth/tokens.js";
import { stage10Router } from "../../routes/stage10.js";
import {
  resetStage10DataPorts,
  setStage10DataPortsForTests,
} from "../stage10/authoritative-loaders.js";
import type { ApiListing } from "../../types.js";

function makeListing(patch: Partial<ApiListing> = {}): ApiListing {
  return {
    id: "L-pub-1",
    title: "BMW 320",
    price: 15000,
    location: "Vilnius",
    distanceKm: 10,
    image: "https://cdn.example.com/a.jpg",
    category: "vehicles",
    tags: [],
    sellerId: "seller-1",
    createdAt: "2026-08-01T00:00:00.000Z",
    status: "active",
    banned: false,
    requiresReview: false,
    attributes: { brand: "BMW", model: "320", year: "2018" },
    ...patch,
  };
}

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/stage10", stage10Router);
  return app;
}

describe("10K Stage10 HTTP + Auth integration", () => {
  const app = createTestApp();
  const tokenA = signAccessToken({ sub: "user-a", role: "user" });
  const tokenB = signAccessToken({ sub: "user-b", role: "user" });

  before(() => {
    const publicListing = makeListing();
    const banned = makeListing({
      id: "L-banned",
      banned: true,
      sellerId: "seller-other",
    });
    const privateOwned = makeListing({
      id: "L-private-a",
      sellerId: "user-a",
      status: "hidden",
      requiresReview: true,
    });
    const byId = new Map<string, ApiListing>([
      [publicListing.id, publicListing],
      [banned.id, banned],
      [privateOwned.id, privateOwned],
      [
        "L-comp-1",
        makeListing({
          id: "L-comp-1",
          price: 14800,
          sellerId: "seller-2",
        }),
      ],
    ]);

    setStage10DataPortsForTests({
      getListing: async (id) => byId.get(id) ?? null,
      getListings: async () => [...byId.values()],
      getUser: async (id) =>
        id
          ? {
              id,
              name: "T",
              phone: "",
              city: "Vilnius",
              avatar: "",
              soldCount: 2,
            }
          : null,
      queryListingEvents: async () => [],
    });
  });

  after(() => {
    resetStage10DataPorts();
  });

  it("rejects unauthenticated requests with 401", async () => {
    const res = await request(app)
      .post("/api/stage10/market/valuation")
      .send({ listingId: "L-pub-1" });
    assert.equal(res.status, 401);
  });

  it("rejects client observations / seller injection (C-01)", async () => {
    const res = await request(app)
      .post("/api/stage10/market/valuation")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        listingId: "L-pub-1",
        observations: [{ id: "fake", price: 1, category: "vehicles" }],
      });
    assert.equal(res.status, 400);
    assert.equal(res.body.error, "server_authoritative_only");

    const score = await request(app)
      .post("/api/stage10/score")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        listingId: "L-pub-1",
        seller: { identityVerified: true, completedTransactions: 999 },
        askingPrice: 1,
      });
    assert.equal(score.status, 400);
    assert.equal(score.body.error, "server_authoritative_only");
  });

  it("valuates with listingId only (server DB)", async () => {
    const res = await request(app)
      .post("/api/stage10/market/valuation")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ listingId: "L-pub-1" });
    assert.equal(res.status, 200);
    assert.equal(res.body.listingId, "L-pub-1");
    assert.equal(res.body.source, "server_db");
    assert.ok(res.body.status);
  });

  it("scores with listingId only (server DB)", async () => {
    const res = await request(app)
      .post("/api/stage10/score")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ listingId: "L-pub-1" });
    assert.equal(res.status, 200);
    assert.equal(res.body.listingId, "L-pub-1");
    assert.equal(res.body.source, "server_db");
  });

  it("hides banned listing from non-owner (404 IDOR)", async () => {
    const res = await request(app)
      .post("/api/stage10/score")
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ listingId: "L-banned" });
    assert.equal(res.status, 404);
  });

  it("forbids non-owner access to hidden/review listing (403)", async () => {
    const res = await request(app)
      .post("/api/stage10/market/valuation")
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ listingId: "L-private-a" });
    assert.equal(res.status, 403);
  });

  it("allows owner to access own non-public listing", async () => {
    const res = await request(app)
      .post("/api/stage10/market/valuation")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ listingId: "L-private-a" });
    assert.equal(res.status, 200);
    assert.equal(res.body.listingId, "L-private-a");
  });

  it("health requires auth and reports 10K", async () => {
    const anon = await request(app).get("/api/stage10/health");
    assert.equal(anon.status, 401);
    const ok = await request(app)
      .get("/api/stage10/health")
      .set("Authorization", `Bearer ${tokenA}`);
    assert.equal(ok.status, 200);
    assert.equal(ok.body.stage, "10K");
    assert.equal(ok.body.serverAuthoritative, true);
  });
});
