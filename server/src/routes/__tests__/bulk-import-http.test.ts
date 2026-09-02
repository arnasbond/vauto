/**
 * F6 Final — bulk import HTTP boundary.
 *
 * Real Express router with real auth middleware: role gate, strict body
 * parsing, adversarial XML/CSV inputs, size limits, 7-vertical parity,
 * zero-persistence guarantees (confirm is always disabled), report text.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import express from "express";
import request from "supertest";
import { signAccessToken } from "../../auth/tokens.js";
import { optionalAuth, requireAuth } from "../../middleware/auth.js";
import bulkImportRouter from "../bulk-import.js";
import { IMPORT_MAX_BYTES } from "../../bulk-import/import-parsers.js";

const ACTOR = "seller-pro-1";

function createApp() {
  const app = express();
  app.use(
    express.raw({
      type: ["text/csv", "application/xml", "text/xml", "text/plain"],
      limit: IMPORT_MAX_BYTES,
    })
  );
  app.use(optionalAuth);
  app.use("/api/bulk-import", requireAuth, bulkImportRouter);
  return app;
}

function authHeader(userId: string, role = "pro") {
  return `Bearer ${signAccessToken({ sub: userId, role, provider: "phone" })}`;
}

const app = createApp();

const VALID_CSV = [
  "title,price,category,location",
  "Volvo V70,10900,vehicles,Vilnius",
  "Butas,150000,real_estate,Kaunas",
  "iPhone 13,700,electronics,Vilnius",
  "Nike kedai,80,clothing,Vilnius",
  "Sofa kampinė,450,home,Kaunas",
  "Santechnika,60,services,Klaipėda",
  "Vairuotojas,1800,jobs,Vilnius",
].join("\n");

const VALID_XML = `<?xml version="1.0" encoding="UTF-8"?>
<listings>
  <listing>
    <title>VW Golf 2019</title>
    <price>10900</price>
    <category>vehicles</category>
    <location>Vilnius</location>
  </listing>
  <listing>
    <title>Butas Kaune</title>
    <price>95000</price>
    <category>real_estate</category>
    <location>Kaunas</location>
  </listing>
</listings>`;

describe("F6 Final — bulk import HTTP", () => {
  it("requires authentication", async () => {
    const res = await request(app)
      .post("/api/bulk-import/preview")
      .set("Content-Type", "text/csv")
      .send("title,price\nx,1");
    assert.equal(res.status, 401);
  });

  it("rejects non-business roles (private/buyer) — seller cannot import on another's behalf", async () => {
    for (const role of ["buyer", "private"]) {
      const res = await request(app)
        .post("/api/bulk-import/preview")
        .set("Authorization", authHeader(ACTOR, role))
        .set("Content-Type", "text/csv")
        .send("title,price\nx,1");
      assert.equal(res.status, 403, `role ${role} must be rejected`);
      assert.equal(res.body.code, "unauthorized");
    }
  });

  it("previews a valid CSV with mapping, rows and summary", async () => {
    const res = await request(app)
      .post("/api/bulk-import/preview")
      .set("Authorization", authHeader(ACTOR))
      .set("Content-Type", "text/csv")
      .send(VALID_CSV);
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.source, "csv");
    assert.equal(res.body.summary.total, 7);
    assert.equal(res.body.summary.ok, 7);
    assert.deepEqual(
      res.body.mapping.map((m: { field: string | null }) => m.field),
      ["title", "price", "category", "location"]
    );
    assert.ok(res.body.reportText.includes("Santrauka"));
    assert.match(res.body.note, /tik patikrintas/, "disabled import never claims drafts are created");
  });

  it("rejects INVALID UTF-8 bytes through the real Express route (original bytes, no pre-decoding)", async () => {
    const invalid = Buffer.concat([
      Buffer.from("title,price\nVolvo,", "utf8"),
      Buffer.from([0xff, 0xfe, 0x41]),
    ]);
    const res = await request(app)
      .post("/api/bulk-import/preview")
      .set("Authorization", authHeader(ACTOR))
      .set("Content-Type", "text/csv")
      .send(invalid);
    assert.equal(res.status, 200, "preview answers with the parse error");
    assert.ok(res.body.error, "invalid UTF-8 must be rejected");
    assert.match(res.body.error, /UTF-8/);
    assert.equal(res.body.importEnabled, false);
  });

  it("maps camelCase attribute columns end-to-end (attr:FuelType → fuelType)", async () => {
    const csv = [
      "title,price,category,location,attr:FuelType,attr:screenSize",
      "Volvo,10900,vehicles,Vilnius,diesel,6.5",
    ].join("\n");
    const res = await request(app)
      .post("/api/bulk-import/preview")
      .set("Authorization", authHeader(ACTOR))
      .set("Content-Type", "text/csv")
      .send(csv);
    assert.equal(res.status, 200);
    assert.deepEqual(
      res.body.mapping.filter((m: { field: string | null }) => m.field?.startsWith("attribute:")),
      [
        { column: "attr:FuelType", field: "attribute:fuelType", ignored: false },
        { column: "attr:screenSize", field: "attribute:screenSize", ignored: false },
      ],
      "canonical camelCase output keys preserved"
    );
    assert.deepEqual(res.body.rows[0].attributes, {
      fuelType: "diesel",
      screenSize: "6.5",
    });
  });

  it("rejects case-equivalent duplicate XML attributes at the boundary", async () => {
    const xml = '<listing title="T" fuelType="diesel" fueltype="petrol"/>';
    const res = await request(app)
      .post("/api/bulk-import/preview")
      .set("Authorization", authHeader(ACTOR))
      .set("Content-Type", "application/xml")
      .send(xml);
    assert.equal(res.status, 200);
    assert.match(res.body.error, /Pasikartojantis atributas/);
  });

  it("previews a valid XML with per-vertical attributes", async () => {
    const res = await request(app)
      .post("/api/bulk-import/preview")
      .set("Authorization", authHeader(ACTOR))
      .set("Content-Type", "application/xml")
      .send(VALID_XML);
    assert.equal(res.status, 200);
    assert.equal(res.body.source, "xml");
    assert.equal(res.body.summary.ok, 2);
  });

  it("rejects XXE / DTD payloads at the boundary", async () => {
    const xxe = `<?xml version="1.0"?><!DOCTYPE listing [<!ENTITY ext SYSTEM "file:///etc/passwd">]><listing><title>&ext;</title></listing>`;
    const res = await request(app)
      .post("/api/bulk-import/preview")
      .set("Authorization", authHeader(ACTOR))
      .set("Content-Type", "application/xml")
      .send(xxe);
    assert.equal(res.status, 200, "preview answers but reports the parse error");
    assert.ok(res.body.error, "hard parse error is surfaced");
    assert.equal(res.body.importEnabled, false);
  });

  it("rejects CSV formula injection", async () => {
    const res = await request(app)
      .post("/api/bulk-import/preview")
      .set("Authorization", authHeader(ACTOR))
      .set("Content-Type", "text/csv")
      .send("title,price\n=HYPERLINK(\"http://evil\",\"x\"),10");
    assert.equal(res.status, 200);
    assert.ok(res.body.error, "formula-injection payload is rejected");
  });

  it("rejects oversized bodies with 413", async () => {
    const big = "t".repeat(IMPORT_MAX_BYTES + 1);
    const res = await request(app)
      .post("/api/bulk-import/preview")
      .set("Authorization", authHeader(ACTOR))
      .set("Content-Type", "text/csv")
      .send(big);
    assert.equal(res.status, 413);
  });

  it("7-vertical parity: every vertical resolves through the same path", async () => {
    const csv = [
      "title,price,category,location",
      ...["vehicles", "real_estate", "electronics", "clothing", "home", "services", "jobs"].map(
        (c, i) => `T${i},10,${c},Vilnius`
      ),
    ].join("\n");
    const res = await request(app)
      .post("/api/bulk-import/preview")
      .set("Authorization", authHeader(ACTOR))
      .set("Content-Type", "text/csv")
      .send(csv);
    assert.equal(res.status, 200);
    assert.equal(res.body.summary.ok, 7);
    assert.deepEqual(Object.keys(res.body.summary.byCategory).sort(), [
      "clothing",
      "electronics",
      "home",
      "jobs",
      "real_estate",
      "services",
      "vehicles",
    ]);
  });

  it("confirm is ALWAYS disabled: zero persistence, no fake completion", async () => {
    const res = await request(app)
      .post("/api/bulk-import/confirm")
      .set("Authorization", authHeader(ACTOR))
      .send({});
    assert.equal(res.status, 403);
    assert.equal(res.body.ok, false);
    assert.equal(res.body.code, "disabled");
    assert.match(res.body.error, /juodraščių/);
  });

  it("empty body is rejected", async () => {
    const res = await request(app)
      .post("/api/bulk-import/preview")
      .set("Authorization", authHeader(ACTOR))
      .set("Content-Type", "text/csv")
      .send("   ");
    assert.equal(res.status, 400);
  });
});
