/**
 * F6 Final — import parser adversarial tests.
 * Strict UTF-8, deterministic delimiters, formula injection, quote handling,
 * XML DTD/entity/XXE rejection, budgets. No network anywhere by design.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  IMPORT_MAX_BYTES,
  IMPORT_MAX_ROWS,
  isFormulaInjectionCell,
  parseCsv,
  parseXml,
} from "../import-parsers.js";
import {
  buildImportPreview,
  extractXmlRow,
  mapColumn,
  parsePrice,
} from "../import-validate.js";

const CSV_OK = [
  "title,price,category,location",
  "Volvo V70,10900,vehicles,Vilnius",
  "\"Butas, centras\",150000,real_estate,Kaunas",
].join("\r\n");

describe("F6 Final — CSV parser", () => {
  it("parses a valid file with header + rows (comma delimiter)", () => {
    const r = parseCsv(CSV_OK);
    assert.ok(!("error" in r));
    if (!("error" in r)) {
      assert.deepEqual(r.headers, ["title", "price", "category", "location"]);
      assert.equal(r.delimiter, ",");
      assert.equal(r.rows.length, 2);
      assert.equal(r.rows[1]![0], "Butas, centras");
    }
  });

  it("deterministic semicolon fallback", () => {
    const r = parseCsv("title;price\nVolvo;10900");
    assert.ok(!("error" in r));
    if (!("error" in r)) {
      assert.equal(r.delimiter, ";");
      assert.equal(r.rows[0]![1], "10900");
    }
  });

  it("rejects a file with no recognizable delimiter", () => {
    const r = parseCsv("title|price\nVolvo|10900");
    assert.ok("error" in r);
  });

  it("strips a UTF-8 BOM exactly once", () => {
    const r = parseCsv("\uFEFFtitle,price\nVolvo,10900");
    assert.ok(!("error" in r));
    if (!("error" in r)) assert.equal(r.headers[0], "title");
  });

  it("rejects non-UTF-8 bytes (fatal decoding)", () => {
    const r = parseCsv(Buffer.from([0xff, 0xfe, 0x41]));
    assert.ok("error" in r);
    if ("error" in r) assert.match(r.error, /UTF-8/);
  });

  it("rejects NUL bytes", () => {
    const r = parseCsv("title,price\nVol\x00vo,10");
    assert.ok("error" in r);
  });

  it("rejects unbalanced quotes", () => {
    const r = parseCsv('title,price\n"Volvo,10900');
    assert.ok("error" in r);
    if ("error" in r) assert.match(r.error, /kabutės/);
  });

  it("rejects ragged rows (column count mismatch)", () => {
    const r = parseCsv("title,price,category\nVolvo,10900");
    assert.ok("error" in r);
    if ("error" in r) assert.match(r.error, /stulpelių skaičius/);
  });

  it("rejects duplicate headers (case-insensitive)", () => {
    const r = parseCsv("title,Title,price\nVolvo,x,10");
    assert.ok("error" in r);
    if ("error" in r) assert.match(r.error, /pasikartojančių/);
  });

  it("rejects CSV formula injection (=, +, -, @, tab)", () => {
    for (const p of ["=SUM(A1)", "+1+1", "-2+3", "@cmd", "\tdata"]) {
      const r = parseCsv(`title,price\n${p},10`);
      assert.ok("error" in r, `prefix ${JSON.stringify(p)} must be rejected`);
      if ("error" in r) assert.match(r.error, /pavojingu simboliu/);
    }
    assert.equal(isFormulaInjectionCell("safe value"), false);
  });

  it("rejects too many rows", () => {
    const lines = ["title,price"];
    for (let i = 0; i <= IMPORT_MAX_ROWS; i += 1) lines.push(`listing-${i},10`);
    const r = parseCsv(lines.join("\n"));
    assert.ok("error" in r);
    if ("error" in r) assert.match(r.error, /Per daug eilučių/);
  });

  it("escaped double quotes inside quoted fields survive", () => {
    const r = parseCsv('title,price\n"Volvo ""S60""",10');
    assert.ok(!("error" in r));
    if (!("error" in r)) assert.equal(r.rows[0]![0], 'Volvo "S60"');
  });
});

describe("F6 Final — XML parser", () => {
  const VALID_XML = `<?xml version="1.0" encoding="UTF-8"?>
<listings>
  <listing>
    <title>VW Golf 2019</title>
    <price>10900</price>
    <category>vehicles</category>
    <location>Vilnius</location>
    <attributes>
      <make>Volkswagen</make>
      <year>2019</year>
    </attributes>
  </listing>
</listings>`;

  it("parses listing elements into rows", () => {
    const r = parseXml(VALID_XML);
    assert.ok(!("error" in r));
    if (!("error" in r)) {
      assert.equal(r.listingNodes.length, 1);
      const extracted = extractXmlRow(r.listingNodes[0]!);
      assert.equal(extracted.fields.title, "VW Golf 2019");
      assert.equal(extracted.fields.price, "10900");
      assert.equal(extracted.attributes.make, "Volkswagen");
      assert.equal(extracted.attributes.year, "2019");
    }
  });

  it("rejects DOCTYPE (DTD)", () => {
    const r = parseXml('<!DOCTYPE foo [<!ENTITY x "y">]><listing><title>a</title></listing>');
    assert.ok("error" in r);
    if ("error" in r) assert.match(r.error, /DOCTYPE|DTD|deklaraciniai/);
  });

  it("rejects ENTITY declarations (classic XXE vector)", () => {
    const r = parseXml('<?xml version="1.0"?><!DOCTYPE listing [<!ENTITY ext SYSTEM "file:///etc/passwd">]><listing><title>&ext;</title></listing>');
    assert.ok("error" in r);
  });

  it("rejects external entity references even without a DTD", () => {
    const r = parseXml("<listing><title>&xxe;</title></listing>");
    assert.ok("error" in r);
    if ("error" in r) assert.match(r.error, /esybė|entity/i);
  });

  it("rejects numeric character references (strict subset)", () => {
    const r = parseXml("<listing><title>&#x41;</title></listing>");
    assert.ok("error" in r);
  });

  it("accepts the five predefined entities only", () => {
    const r = parseXml("<listing><title>A &amp; B &lt; C</title></listing>");
    assert.ok(!("error" in r));
    if (!("error" in r)) {
      const extracted = extractXmlRow(r.listingNodes[0]!);
      assert.equal(extracted.fields.title, "A & B < C");
    }
  });

  it("rejects entity-expansion bombs via deep nesting budget", () => {
    let doc = "<listing><title>";
    for (let i = 0; i < 40; i += 1) doc += "<a>";
    doc += "x";
    for (let i = 0; i < 40; i += 1) doc += "</a>";
    doc += "</title></listing>";
    const r = parseXml(doc);
    assert.ok("error" in r, "deep nesting must hit the depth budget");
    if ("error" in r) assert.match(r.error, /gylis|mazg/i);
  });

  it("rejects trailing content after the root element", () => {
    const r = parseXml("<listing><title>a</title></listing><listing><title>b</title></listing>");
    assert.ok("error" in r);
  });

  it("rejects processing instructions and misc declarations", () => {
    const r = parseXml("<?xml-stylesheet href=\"x\"?><listing><title>a</title></listing>");
    assert.ok("error" in r);
  });

  it("rejects mismatched closing tags", () => {
    const r = parseXml("<listing><title>a</description></listing>");
    assert.ok("error" in r);
  });

  it("supports CDATA text content", () => {
    const r = parseXml("<listing><title><![CDATA[Butas 3k. & Žalia <gatvė>]]></title></listing>");
    assert.ok(!("error" in r));
    if (!("error" in r)) {
      const extracted = extractXmlRow(r.listingNodes[0]!);
      assert.equal(extracted.fields.title, "Butas 3k. & Žalia <gatvė>");
    }
  });
});

describe("F6 Final — mapping and validation", () => {
  it("maps aliases deterministically and ignores unknown columns", () => {
    assert.deepEqual(mapColumn("Kaina"), { field: "price", ignored: false });
    assert.deepEqual(mapColumn("attr:make"), { field: "attribute:make", ignored: false });
    assert.deepEqual(mapColumn("hacker_col"), { field: null, ignored: true });
  });

  it("parses lt-LT prices", () => {
    assert.equal(parsePrice("10900"), 10900);
    assert.equal(parsePrice("10 900,50 €"), 10900.5);
    assert.equal(parsePrice("abc"), null);
    assert.equal(parsePrice("-5"), null);
    assert.equal(parsePrice(null), null);
  });

  it("builds a full preview with category fallback to other + report text", () => {
    const preview = buildImportPreview({
      source: "csv",
      columns: ["title", "price", "category", "location", "unknown_col"],
      rows: [
        {
          line: 2,
          fields: { title: "Volvo", price: "10900", category: "vehicles", location: "Vilnius" },
          images: [],
          tags: [],
          attributes: {},
          ignored: ["unknown_col"],
        },
        {
          line: 3,
          fields: { title: "Paslauga", price: "50", category: "", location: "Kaunas" },
          images: [],
          tags: [],
          attributes: {},
          ignored: [],
        },
        {
          line: 4,
          fields: { title: "", price: "bad", category: "xyz", location: "" },
          images: [],
          tags: [],
          attributes: {},
          ignored: [],
        },
      ],
    });
    assert.equal(preview.summary.total, 3);
    assert.equal(preview.summary.ok, 2);
    assert.equal(preview.summary.warnings, 0);
    assert.equal(preview.summary.errors, 1);
    assert.equal(preview.rows[1]!.category, "other", "empty category → explicit other");
    assert.equal(preview.rows[1]!.verdict, "ok");
    assert.deepEqual(preview.rows[1]!.warnings, []);
    assert.equal(preview.rows[2]!.category, "other", "unknown category coerced to other with warning");
    assert.equal(preview.rows[2]!.verdict, "error");
    assert.ok(preview.rows[2]!.warnings.length >= 1);
    assert.ok(preview.reportText.includes("Santrauka"));
    assert.ok(preview.reportText.includes("unknown_col"));
  });

  it("validates per-vertical attributes canonically (JOBS salary order)", () => {
    const preview = buildImportPreview({
      source: "csv",
      columns: ["title", "price", "category", "location", "attr:salaryMin", "attr:salaryMax"],
      rows: [
        {
          line: 2,
          fields: {
            title: "Vairuotojas",
            price: "1800",
            category: "jobs",
            location: "Vilnius",
          },
          images: [],
          tags: [],
          attributes: { salaryMin: "2000", salaryMax: "1500" },
          ignored: [],
        },
      ],
    });
    assert.equal(preview.summary.warnings, 1, "salaryMin > salaryMax flagged by canonical validator");
  });

  it("7-vertical parity: every vertical category resolves", () => {
    const preview = buildImportPreview({
      source: "csv",
      columns: ["title", "price", "category", "location"],
      rows: [
        ["vehicles", "real_estate", "electronics", "clothing", "home", "services", "jobs"].map(
          (cat, i) => ({
            line: i + 2,
            fields: { title: `x${i}`, price: "10", category: cat, location: "Vilnius" },
            images: [],
            tags: [],
            attributes: {},
            ignored: [],
          })
        ),
      ].flat(),
    });
    assert.equal(preview.summary.ok, 7);
    assert.deepEqual(Object.keys(preview.summary.byCategory).sort(), [
      "clothing",
      "electronics",
      "home",
      "jobs",
      "real_estate",
      "services",
      "vehicles",
    ]);
  });
});

describe("F6 Final — size budget", () => {
  it("IMPORT_MAX_BYTES rejects oversized input", () => {
    const big = Buffer.alloc(IMPORT_MAX_BYTES + 1, 0x41);
    const r = parseCsv(big);
    assert.ok("error" in r);
    if ("error" in r) assert.match(r.error, /per didelis/);
  });
});
