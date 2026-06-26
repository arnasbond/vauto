#!/usr/bin/env node
/**
 * One-time iOS TestFlight / ad-hoc signing setup for GitHub Actions.
 *
 * Usage:
 *   node scripts/setup-ios-testflight.mjs --check
 *   node scripts/setup-ios-testflight.mjs --encode-p8 path/to/AuthKey_XXXX.p8
 *   node scripts/setup-ios-testflight.mjs --encode-p12 path/to/distribution.p12
 *   node scripts/setup-ios-testflight.mjs --encode-profile path/to/Vauto.mobileprovision
 *
 * After encoding, add secrets to GitHub:
 *   Settings → Secrets and variables → Actions
 *
 * Required for TestFlight (autonomous CI):
 *   APPSTORE_KEY_ID, APPSTORE_ISSUER_ID, APPSTORE_PRIVATE_KEY (base64)
 *   APPLE_TEAM_ID, BUILD_CERTIFICATE_BASE64, P12_PASSWORD
 *   BUILD_PROVISION_PROFILE_BASE64, IOS_PROVISIONING_PROFILE_NAME
 *
 * Optional for ad-hoc sideload (registered UDIDs only):
 *   IOS_ADHOC_PROFILE_BASE64, IOS_ADHOC_PROFILE_NAME
 *
 * Optional frontend (after first TestFlight external group):
 *   NEXT_PUBLIC_IOS_TESTFLIGHT_URL=https://testflight.apple.com/join/XXXXXX
 */

import { readFileSync, existsSync } from "node:fs";
import { basename, resolve } from "node:path";
import { execSync } from "node:child_process";

const SECRETS = [
  "APPSTORE_KEY_ID",
  "APPSTORE_ISSUER_ID",
  "APPSTORE_PRIVATE_KEY",
  "APPLE_TEAM_ID",
  "BUILD_CERTIFICATE_BASE64",
  "P12_PASSWORD",
  "BUILD_PROVISION_PROFILE_BASE64",
  "IOS_PROVISIONING_PROFILE_NAME",
];

const ADHOC_SECRETS = ["IOS_ADHOC_PROFILE_BASE64", "IOS_ADHOC_PROFILE_NAME"];

function encodeFile(path) {
  const abs = resolve(path);
  if (!existsSync(abs)) {
    console.error(`Failas nerastas: ${abs}`);
    process.exit(1);
  }
  const b64 = readFileSync(abs).toString("base64");
  console.log(`\n# ${basename(abs)} → base64 (${b64.length} chars)`);
  console.log(b64.slice(0, 80) + "...");
  console.log("\nPilnas base64 (nukopijuokite į GitHub Secret):\n");
  console.log(b64);
}

function checkGhSecrets() {
  try {
    execSync("gh --version", { stdio: "ignore" });
  } catch {
    console.log("Įdiekite GitHub CLI (gh) ir prisijunkite: gh auth login\n");
    printManualChecklist();
    return;
  }

  console.log("Tikrinami GitHub Secrets (arnasbond/vauto)...\n");
  let testflightReady = true;
  let adhocReady = true;

  for (const name of SECRETS) {
    try {
      execSync(`gh secret list | findstr /i "${name}"`, { stdio: "ignore", shell: true });
      console.log(`  ✓ ${name}`);
    } catch {
      console.log(`  ✗ ${name} — trūksta`);
      testflightReady = false;
    }
  }

  console.log("\nAd-hoc (pasirenkama):");
  for (const name of ADHOC_SECRETS) {
    try {
      execSync(`gh secret list | findstr /i "${name}"`, { stdio: "ignore", shell: true });
      console.log(`  ✓ ${name}`);
    } catch {
      console.log(`  ○ ${name} — nenustatyta`);
      adhocReady = false;
    }
  }

  console.log("");
  if (testflightReady) {
    console.log("✅ TestFlight CI paruoštas — push į master paleis automatinį įkėlimą.");
    console.log("   Stebėkite: https://github.com/arnasbond/vauto/actions/workflows/ios-build.yml");
  } else {
    console.log("⏳ TestFlight dar neaktyvus — užpildykite trūkstamus secrets (žr. žemiau).");
  }

  if (adhocReady) {
    console.log("✅ Ad-hoc OTA sideload paruoštas — ios-adhoc-latest release.");
  }

  printManualChecklist();
}

function printManualChecklist() {
  console.log(`
─── Vienkartinis Apple Developer setup ───

1. Apple Developer Program ($99/m.) → https://developer.apple.com/programs/
2. App Store Connect → sukurkite programėlę „Vauto“ (Bundle ID: com.vauto.app)
3. App Store Connect → Users and Access → Keys → sukurkite API raktą (.p8)
   - APPSTORE_KEY_ID = Key ID
   - APPSTORE_ISSUER_ID = Issuer ID (App Store Connect viršuje)
   - APPSTORE_PRIVATE_KEY = base64(.p8 failas):
     node scripts/setup-ios-testflight.mjs --encode-p8 AuthKey_XXXX.p8

4. Xcode (Mac arba cloud Mac) → Certificates → Apple Distribution
   - Eksportuokite .p12 → BUILD_CERTIFICATE_BASE64 + P12_PASSWORD:
     node scripts/setup-ios-testflight.mjs --encode-p12 distribution.p12

5. Profiles → App Store profile „Vauto App Store“
   - BUILD_PROVISION_PROFILE_BASE64:
     node scripts/setup-ios-testflight.mjs --encode-profile Vauto.mobileprovision
   - IOS_PROVISIONING_PROFILE_NAME = tikslus profilio pavadinimas

6. APPLE_TEAM_ID = 10 simbolių Team ID (developer.apple.com/account)

7. GitHub → Settings → Secrets → Actions → įklijuokite visas reikšmes

8. Po pirmo sėkmingo build → TestFlight → External Testing → Public Link
   - Pridėkite Vercel env: NEXT_PUBLIC_IOS_TESTFLIGHT_URL=https://testflight.apple.com/join/XXXXXX

─── Ad-hoc sideload (be TestFlight, tik registruoti UDID) ───

1. developer.apple.com → Devices → pridėkite kiekvieno iPhone UDID
2. Sukurkite Ad Hoc provisioning profile
3. IOS_ADHOC_PROFILE_BASE64 + IOS_ADHOC_PROFILE_NAME secrets
4. Vartotojai atidaro: https://vauto-chi.vercel.app/ios/install.html

─── AltStore / Xcode (rankinis, ne CI) ───

AltStore reikalauja AltServer kompiuteryje + asmeninio Apple ID.
Tai NEGALI būti pilnai autonomiška iš GitHub — naudokite TestFlight arba ad-hoc OTA.
`);
}

const args = process.argv.slice(2);
if (args.includes("--check") || args.length === 0) {
  checkGhSecrets();
} else if (args[0] === "--encode-p8" && args[1]) {
  encodeFile(args[1]);
} else if (args[0] === "--encode-p12" && args[1]) {
  encodeFile(args[1]);
} else if (args[0] === "--encode-profile" && args[1]) {
  encodeFile(args[1]);
} else {
  console.log(`Naudojimas:
  node scripts/setup-ios-testflight.mjs --check
  node scripts/setup-ios-testflight.mjs --encode-p8 AuthKey.p8
  node scripts/setup-ios-testflight.mjs --encode-p12 cert.p12
  node scripts/setup-ios-testflight.mjs --encode-profile Vauto.mobileprovision`);
}
