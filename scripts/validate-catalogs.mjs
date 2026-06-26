/** Validates chameleon layer catalogs (locations, vehicles, services). */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
let failed = 0;

function assert(name, ok, detail = "") {
  if (!ok) {
    console.error(`FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
    failed++;
  } else {
    console.log(`OK: ${name}`);
  }
}

function countJsonArrayEntries(src, key) {
  const re = new RegExp(`export const ${key} = \\[([\\s\\S]*?)\\] as const`);
  const m = src.match(re);
  if (!m) return 0;
  return (m[1].match(/"/g)?.length ?? 0) / 2;
}

function main() {
  const locSrc = readFileSync(join(root, "src/data/lithuania-locations.ts"), "utf8");
  const munCount = countJsonArrayEntries(locSrc, "MUNICIPALITIES");
  assert("60 municipalities", munCount === 60, `got ${munCount}`);
  assert("settlements map present", /SETTLEMENTS_BY_MUNICIPALITY/.test(locSrc));

  const vehSrc = readFileSync(join(root, "src/data/vehicle-makes-models.ts"), "utf8");
  const makeCount = countJsonArrayEntries(vehSrc, "VEHICLE_MAKES");
  assert("vehicle makes >= 40", makeCount >= 40, `got ${makeCount}`);
  assert("models map present", /MODELS_BY_MAKE/.test(vehSrc));

  const serviceSrc = readFileSync(join(root, "src/lib/service-catalog.ts"), "utf8");
  assert("service category tree", /SERVICE_CATEGORY_TREE/.test(serviceSrc));
  const treeBlock = serviceSrc.match(/SERVICE_CATEGORY_TREE:[\s\S]*?^};/m)?.[0] ?? "";
  const treeCount = (treeBlock.match(/"/g)?.length ?? 0) / 2;
  assert("service specialties >= 30", treeCount >= 30, `got ${treeCount} in tree`);

  if (failed > 0) process.exit(1);
  console.log("\nAll catalog checks passed.");
}

main();
