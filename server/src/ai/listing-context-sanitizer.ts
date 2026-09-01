/**
 * F1.1 — centralized sanitizer for untrusted LISTING text entering model context.
 *
 * Every marketplace vertical (transport, real estate, electronics, clothing,
 * goods, services, jobs) routes DB listing rows through the same funnels
 * (`toAgentListingSummary`, search/browse tool results, inbound context
 * listings). This module is the single, vertical-agnostic boundary that:
 *
 *   1. neutralizes attempts to impersonate system/tool/supervisor authority
 *      (`<system>…</system>`, `[SYSTEM]`, `system: …`, `role:"system"`,
 *      `<tool_call>…</tool_call>`, fake `<untrusted_*>` tags, JSON/XML
 *      boundary splicing and system-rule claims);
 *   2. scrubs known prompt-injection spans (shared detector) plus
 *      phrase-scoped Lithuanian instruction commands;
 *   3. enforces a strict per-listing character budget with safe truncation.
 *
 * Fail-safe contract (AI DOWN ≠ VAUTO DOWN): this module NEVER throws. Invalid
 * input degrades to an empty string; a sanitization failure can only remove
 * model-visible text, never block classic search or manual listing flows.
 *
 * PROVENANCE ≠ AUTHORITY: sanitization neutralizes instructions and
 * impersonation markers; it does NOT turn persisted listing fields into
 * verified facts, and it must not be used to overwrite user-confirmed values.
 */
import {
  sanitizePromptUserInput,
} from "../shared/prompt-injection.js";
import { truncateTextSafely } from "../shared/text-truncation.js";

/** Per-listing context budget — bounded text in model context. */
export const LISTING_CONTEXT_BUDGET = {
  title: 120,
  description: 160,
  location: 60,
  category: 40,
} as const;

/**
 * Role-prefix impersonation: a field line starting with "SYSTEM:" (EN or LT)
 * pretends to be a system message — the whole line is dropped.
 */
const ROLE_LINE_WIPE_RE =
  /(?:^|[\n\r])\s*(SYSTEM|ASSISTANT|DEVELOPER|SUPERVISOR|SISTEMA|ASISTENTAS|system|assistant|developer|supervisor|sistema|asistentas)\s*:[^\n\r]*/gi;

/** A field that starts as a JSON role assignment is an attack — drop it. */
const ROLE_FIELD_WIPE_RE =
  /^\s*role\s*[:=]\s*["']?\s*(system|assistant|developer|tool|user)\s*["']?[^\n\r]*/i;

/** Mid-text JSON role assignments: `"role":"system"` (value included). */
const JSON_ROLE_VALUE_RE =
  /["']?\s*role\s*["']?\s*[:=]\s*["']\s*(system|assistant|developer)\s*["']/gi;

/** JSON message keys of role objects: `"content":"…"` opening. */
const JSON_CONTENT_KEY_RE =
  /["']\s*content\s*["']\s*[:=]\s*["']/gi;

/** Full `<tool_call>…</tool_call>` spans and bare system/tool tags. */
const TOOL_TAG_WIPE_RE =
  /<\s*(system|assistant|developer|tool_calls?|instructions?|supervisor)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>|<\s*\/?\s*(system|assistant|developer|tool_calls?|instructions?|supervisor)\b[^>]*>/gi;

/** Fake `<untrusted_*>` boundary spans and bare tags. */
const UNTRUSTED_TAG_WIPE_RE =
  /<\s*untrusted_[a-z0-9_]+\b[^>]*>[\s\S]*?<\s*\/\s*untrusted_[a-z0-9_]+\s*>|<\s*\/?\s*untrusted_[a-z0-9_]+\b[^>]*>/gi;

/** Square-bracket authority markers: [SYSTEM], [TOOL_CALL], [SUPERVISOR]… */
const SQUARE_MARKER_RE =
  /\[\s*(SYSTEM|SISTEMA|ASSISTANT|DEVELOPER|TOOL_CALL|SUPERVISOR)\s*\]/gi;

/** JSON/XML boundary splicing used to break out of serialized tool results. */
const JSON_XML_BOUNDARY_RE =
  /\}\s*\{|["']\s*\][\s,]*["']|<\/?\s*(json|xml)\s*>/gi;

/** Phrases that claim system-verified authority for untrusted text. */
const SYSTEM_RULE_IMPERSONATION_RE =
  /\b(sistemos\s+(taisykl|nurodym|pranešim|komand)\w*|server[- ]verified|patvirtinta\s+sistem\w*|system\s+(message|command|rule)s?)\b/gi;

/**
 * Instruction PHRASES (verb + object) the shared detector does not cover:
 * LT "ignoruok ankstesnius nurodymus", "publikuok viską", EN "publish all".
 * Phrase-scoped so legal listing wording ("montavimo nurodymai pridedami")
 * is preserved.
 */
const INSTRUCTION_PHRASE_RE =
  /\b(ignoruok\w*|ignoruoti|pamirš(?:k|ti|kite))\s+[\w\s-]{0,40}?(?:instrukcij\w*|taisyk\w*|nurodym\w*)\b|\b(publikuok\w*|vykdyk\w*|perrašyk\w*|publish\w*)\s+(?:visk\w*ą?|šiuos|šias|nurodym\w*|everything\b|all\b)/gi;

/** Control characters must never survive into prompt slots. */
const CONTROL_CHARS_RE = /[\u0000-\u001f\u007f]/g;

/**
 * Sanitize one free-text listing field for model context:
 * control-char strip → whitespace collapse → injection scrub → impersonation
 * neutralization → safe truncation. Never throws; empty input, non-text input
 * or a payload that is purely an attack yields "".
 */
export function sanitizeListingTextField(value: unknown, maxLen: number): string {
  try {
    if (value == null) return "";
    let text: string;
    if (typeof value === "string") text = value;
    else if (typeof value === "number" || typeof value === "boolean") {
      text = String(value);
    } else {
      return "";
    }
    if (!text) return "";
    text = text.replace(CONTROL_CHARS_RE, " ").replace(/\s+/g, " ").trim();
    if (!text) return "";

    const { text: scrubbed, blocked } = sanitizePromptUserInput(text);
    if (blocked) return "";
    text = (scrubbed || "")
      .replace(TOOL_TAG_WIPE_RE, " ")
      .replace(UNTRUSTED_TAG_WIPE_RE, " ")
      .replace(ROLE_LINE_WIPE_RE, " ")
      .replace(ROLE_FIELD_WIPE_RE, " ")
      .replace(JSON_ROLE_VALUE_RE, " ")
      .replace(JSON_CONTENT_KEY_RE, " ")
      .replace(SQUARE_MARKER_RE, " ")
      .replace(JSON_XML_BOUNDARY_RE, " ")
      .replace(SYSTEM_RULE_IMPERSONATION_RE, " ")
      .replace(INSTRUCTION_PHRASE_RE, " ")
      .replace(/\s{2,}/g, " ")
      .trim();
    if (!text) return "";
    return truncateTextSafely(text, maxLen);
  } catch {
    // Fail-safe: never let a sanitizer error crash search/agent paths.
    return "";
  }
}

export function sanitizeListingTitle(value: unknown): string {
  return sanitizeListingTextField(value, LISTING_CONTEXT_BUDGET.title);
}

export function sanitizeListingDescription(value: unknown): string {
  return sanitizeListingTextField(value, LISTING_CONTEXT_BUDGET.description);
}

export function sanitizeListingLocation(value: unknown): string {
  return sanitizeListingTextField(value, LISTING_CONTEXT_BUDGET.location);
}

export function sanitizeListingCategory(value: unknown): string {
  return sanitizeListingTextField(value, LISTING_CONTEXT_BUDGET.category);
}
