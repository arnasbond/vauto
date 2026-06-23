#!/usr/bin/env node
/** Smoke tests for compiled server validation + VIN utils (no DB). */
import { validateAmount, validateServiceLeadCreate } from "../server/dist/validation.js";
import { isValidVin, normalizeVin } from "../server/dist/vehicle/vin-utils.js";

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
}

const amount = validateAmount({ amount: 25 }, "amount", 1, 500);
assert(amount.ok && amount.value === 25, "validateAmount accepts 25");

const badAmount = validateAmount({ amount: 0 }, "amount", 1, 500);
assert(!badAmount.ok, "validateAmount rejects 0");

const lead = validateServiceLeadCreate({
  title: "Elektrikas Vilniuje",
  city: "Vilnius",
  category: "Elektrikas",
  summary: "Reikia pakeisti rozetę",
  hiddenContact: "+370 6•• •••••",
  contactPhone: "+370 612 34567",
});
assert(lead.ok, "validateServiceLeadCreate accepts minimal lead");

assert(!isValidVin("NOT_A_VIN"), "isValidVin rejects invalid VIN");
assert(normalizeVin(" wvw-zzz ") === "WVWZZZ", "normalizeVin strips noise");

console.log("Server validation smoke: OK");
