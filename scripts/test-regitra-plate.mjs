#!/usr/bin/env node
/**
 * Validate Regitra plate API credentials against CheckLithuania.
 *
 * Usage:
 *   REGITRA_PLATE_API_USERNAME=u REGITRA_PLATE_API_PASSWORD=p node scripts/test-regitra-plate.mjs KAA123
 */
const plate = process.argv[2] ?? "KAA123";
const username = process.env.REGITRA_PLATE_API_USERNAME?.trim();
const password = process.env.REGITRA_PLATE_API_PASSWORD?.trim();
const base =
  process.env.REGITRA_PLATE_API_URL?.trim() ||
  "https://www.numeriozenklaiapi.lt/api/reg.asmx";

if (!username || !password) {
  console.error("Set REGITRA_PLATE_API_USERNAME and REGITRA_PLATE_API_PASSWORD");
  process.exit(1);
}

const compact = plate.replace(/\s+/g, "").toUpperCase();
const url = new URL(`${base.replace(/\/$/, "")}/CheckLithuania`);
url.searchParams.set("RegistrationNumber", compact);
url.searchParams.set("username", username);
url.searchParams.set("password", password);

const res = await fetch(url.toString());
const xml = await res.text();
const jsonMatch = xml.match(/<vehicleJson[^>]*>([\s\S]*?)<\/vehicleJson>/i);
if (!jsonMatch?.[1]) {
  console.error("No vehicleJson in response. HTTP", res.status);
  console.error(xml.slice(0, 500));
  process.exit(1);
}

const decoded = jsonMatch[1]
  .replace(/&quot;/g, '"')
  .replace(/&amp;/g, "&")
  .replace(/&lt;/g, "<")
  .replace(/&gt;/g, ">");

console.log(JSON.stringify(JSON.parse(decoded), null, 2));
