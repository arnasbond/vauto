#!/usr/bin/env node
/**
 * Write public/runtime-config.json from env (no frontend rebuild for Google OAuth).
 *
 * Env:
 *   NEXT_PUBLIC_API_URL | PUBLIC_API_URL
 *   NEXT_PUBLIC_GOOGLE_CLIENT_ID | GOOGLE_CLIENT_ID
 *   NEXT_PUBLIC_VAUTO_CONDUCTOR | VAUTO_CONDUCTOR (1 = enable conductor)
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const apiUrl = (
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.PUBLIC_API_URL ||
  "https://vauto-api.onrender.com"
).replace(/\/$/, "");

const googleClientId =
  process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim() ||
  process.env.GOOGLE_CLIENT_ID?.trim() ||
  "";

const conductorEnabled =
  process.env.NEXT_PUBLIC_VAUTO_CONDUCTOR === "1" || process.env.VAUTO_CONDUCTOR === "1";

const config = { apiUrl, conductorEnabled };
if (googleClientId) config.googleClientId = googleClientId;

const out = resolve("public/runtime-config.json");
writeFileSync(out, `${JSON.stringify(config, null, 2)}\n`, "utf8");
console.log(`Wrote ${out}:`, config);
