import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_MAP_ATTRIBUTION,
  DEFAULT_MAP_TILE_URL,
  resolveMapTileProvider,
} from "../map-provider";

test("22B: default provider resolves to OSM standard with attribution", () => {
  const p = resolveMapTileProvider({});
  assert.equal(p.id, "osm-standard");
  assert.equal(p.url, DEFAULT_MAP_TILE_URL);
  assert.ok(p.attribution.includes("OpenStreetMap"));
});

test("22B: custom tile URL override wins and keeps attribution", () => {
  const p = resolveMapTileProvider({
    NEXT_PUBLIC_MAP_TILE_URL: "https://tiles.example.com/{z}/{x}/{y}.png",
    NEXT_PUBLIC_MAP_ATTRIBUTION: "&copy; Example Tiles",
  });
  assert.equal(p.id, "custom");
  assert.equal(p.url, "https://tiles.example.com/{z}/{x}/{y}.png");
  assert.equal(p.attribution, "&copy; Example Tiles");
});

test("22B: static provider id selection (osm-hot)", () => {
  const p = resolveMapTileProvider({ NEXT_PUBLIC_MAP_PROVIDER: "osm-hot" });
  assert.equal(p.id, "osm-hot");
  assert.ok(p.attribution.includes("OSM France"));
});

test("22B: unknown provider id falls back to default (never crashes)", () => {
  const p = resolveMapTileProvider({ NEXT_PUBLIC_MAP_PROVIDER: "nope" });
  assert.equal(p.id, "osm-standard");
  assert.equal(p.url, DEFAULT_MAP_TILE_URL);
});

test("22B: malformed tile URL falls back to default", () => {
  const p = resolveMapTileProvider({
    NEXT_PUBLIC_MAP_TILE_URL: "javascript:alert(1)",
  });
  assert.equal(p.id, "osm-standard");
});

test("22B: tile URL missing z/x/y placeholders falls back to default", () => {
  const p = resolveMapTileProvider({
    NEXT_PUBLIC_MAP_TILE_URL: "https://tiles.example.com/static.png",
  });
  assert.equal(p.id, "osm-standard");
});

test("22B: custom URL without attribution still gets default attribution", () => {
  const p = resolveMapTileProvider({
    NEXT_PUBLIC_MAP_TILE_URL: "https://tiles.example.com/{z}/{x}/{y}.png",
  });
  assert.equal(p.id, "custom");
  assert.equal(p.attribution, DEFAULT_MAP_ATTRIBUTION);
});
