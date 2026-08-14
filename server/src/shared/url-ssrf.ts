/**
 * Shared SSRF URL hardening — DNS resolution + redirect-to-private-IP protection.
 */

import dns from "node:dns/promises";
import net from "node:net";
import { isIP } from "node:net";

const BLOCKED_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "metadata.google.internal",
  "metadata",
  "metadata.google.com",
  "instance-data",
]);

/** Max redirects followed by safeOutboundFetch. */
export const SSRF_MAX_REDIRECTS = 3;

export function isBlockedSsrfHostname(hostname: string): boolean {
  const h = String(hostname ?? "").toLowerCase().replace(/\.$/, "");
  if (!h) return true;
  if (BLOCKED_HOSTS.has(h)) return true;
  if (h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) {
    return true;
  }
  if (isBlockedIpLiteral(h)) return true;
  return false;
}

/** True for loopback / RFC1918 / link-local / CGNAT / unique-local IPv6. */
export function isBlockedIpLiteral(ipOrHost: string): boolean {
  const raw = String(ipOrHost ?? "")
    .toLowerCase()
    .replace(/^\[|\]$/g, "");
  if (!raw) return true;
  if (raw === "::1" || raw === "0.0.0.0") return true;

  const version = isIP(raw);
  if (version === 4) {
    if (/^10\.\d+\.\d+\.\d+$/.test(raw)) return true;
    if (/^192\.168\.\d+\.\d+$/.test(raw)) return true;
    if (/^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/.test(raw)) return true;
    if (/^169\.254\.\d+\.\d+$/.test(raw)) return true;
    if (/^127\.\d+\.\d+\.\d+$/.test(raw)) return true;
    if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d+\.\d+$/.test(raw)) return true;
    if (/^0\.\d+\.\d+\.\d+$/.test(raw)) return true;
    return false;
  }
  if (version === 6) {
    // Unique local fc00::/7, link-local fe80::/10, loopback ::1
    if (raw === "::1") return true;
    if (raw.startsWith("fc") || raw.startsWith("fd")) return true;
    if (raw.startsWith("fe8") || raw.startsWith("fe9") || raw.startsWith("fea") || raw.startsWith("feb")) {
      return true;
    }
    return false;
  }

  // Hostname patterns that look like IPv4 (already handled above if isIP)
  if (/^10\.\d+\.\d+\.\d+$/.test(raw)) return true;
  if (/^192\.168\.\d+\.\d+$/.test(raw)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/.test(raw)) return true;
  if (/^169\.254\.\d+\.\d+$/.test(raw)) return true;
  if (/^127\.\d+\.\d+\.\d+$/.test(raw)) return true;
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d+\.\d+$/.test(raw)) return true;
  return false;
}

export type UrlHardeningResult = {
  ok: boolean;
  reason?: string;
  resolvedAddresses?: string[];
};

/**
 * Fail-closed static URL check (no DNS). Used for fast pre-validation.
 */
export function hardenOutboundUrl(url: string): UrlHardeningResult {
  const u = String(url ?? "").trim();
  if (!u) return { ok: false, reason: "empty_url" };
  if (u.startsWith("data:")) {
    if (!/^data:image\/(jpeg|png|webp|gif);base64,/i.test(u)) {
      return { ok: false, reason: "data_url_mime_not_allowed" };
    }
    const b64 = u.split(",")[1] ?? "";
    if (b64.length > 16_000_000) return { ok: false, reason: "data_url_too_large" };
    return { ok: true };
  }
  let parsed: URL;
  try {
    parsed = new URL(u);
  } catch {
    return { ok: false, reason: "invalid_url" };
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { ok: false, reason: "protocol_not_allowed" };
  }
  if (parsed.username || parsed.password) {
    return { ok: false, reason: "url_credentials_blocked" };
  }
  if (isBlockedSsrfHostname(parsed.hostname)) {
    return { ok: false, reason: "ssrf_blocked_host" };
  }
  return { ok: true };
}

/**
 * Resolve hostname and reject if any A/AAAA is private / metadata.
 * Mitigates DNS rebinding to 127.0.0.1 / RFC1918 / 169.254.169.254.
 */
export async function resolveAndValidateOutboundUrl(
  url: string
): Promise<UrlHardeningResult> {
  const base = hardenOutboundUrl(url);
  if (!base.ok) return base;
  if (String(url).startsWith("data:")) return base;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: "invalid_url" };
  }

  const host = parsed.hostname;
  if (isIP(host)) {
    if (isBlockedIpLiteral(host)) {
      return { ok: false, reason: "ssrf_blocked_ip", resolvedAddresses: [host] };
    }
    return { ok: true, resolvedAddresses: [host] };
  }

  let addresses: string[] = [];
  try {
    const records = await dns.lookup(host, { all: true, verbatim: true });
    addresses = records.map((r) => r.address);
  } catch {
    return { ok: false, reason: "dns_lookup_failed" };
  }
  if (!addresses.length) {
    return { ok: false, reason: "dns_empty" };
  }
  for (const addr of addresses) {
    if (isBlockedIpLiteral(addr)) {
      return {
        ok: false,
        reason: "ssrf_dns_private_ip",
        resolvedAddresses: addresses,
      };
    }
  }
  return { ok: true, resolvedAddresses: addresses };
}

export type SafeFetchResult = {
  ok: boolean;
  reason?: string;
  status?: number;
  headers?: Headers;
  body?: Buffer;
  finalUrl?: string;
};

/**
 * Outbound fetch that:
 * 1) validates URL + DNS before connect
 * 2) refuses redirects to private/metadata IPs
 * 3) caps redirect hops
 */
export async function safeOutboundFetch(
  url: string,
  init?: RequestInit & { maxBytes?: number; maxRedirects?: number }
): Promise<SafeFetchResult> {
  const maxRedirects = init?.maxRedirects ?? SSRF_MAX_REDIRECTS;
  const maxBytes = init?.maxBytes ?? 12 * 1024 * 1024;
  let current = url;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const check = await resolveAndValidateOutboundUrl(current);
    if (!check.ok) {
      return { ok: false, reason: check.reason ?? "ssrf_blocked" };
    }

    let res: Response;
    try {
      res = await fetch(current, {
        ...init,
        redirect: "manual",
        signal: init?.signal,
      });
    } catch {
      return { ok: false, reason: "fetch_failed" };
    }

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) return { ok: false, reason: "redirect_missing_location" };
      let next: URL;
      try {
        next = new URL(loc, current);
      } catch {
        return { ok: false, reason: "redirect_invalid_location" };
      }
      const redirCheck = await resolveAndValidateOutboundUrl(next.toString());
      if (!redirCheck.ok) {
        return {
          ok: false,
          reason: redirCheck.reason ?? "redirect_to_private_ip",
        };
      }
      current = next.toString();
      continue;
    }

    const ab = await res.arrayBuffer();
    if (ab.byteLength > maxBytes) {
      return { ok: false, reason: "response_too_large", status: res.status };
    }
    return {
      ok: res.ok,
      status: res.status,
      headers: res.headers,
      body: Buffer.from(ab),
      finalUrl: current,
      reason: res.ok ? undefined : "http_error",
    };
  }

  return { ok: false, reason: "too_many_redirects" };
}

/** Fake MIME / decompression bomb heuristics for buffers. */
export function inspectUploadBuffer(
  buf: Buffer,
  claimedMime?: string
): { ok: boolean; reason?: string; sniffedMime?: string | null } {
  if (!buf || buf.length === 0) return { ok: false, reason: "empty_buffer" };
  if (buf.length > 12 * 1024 * 1024) return { ok: false, reason: "too_large" };
  if (buf[0] === 0x50 && buf[1] === 0x4b) {
    return { ok: false, reason: "archive_not_allowed" };
  }
  let sniffed: string | null = null;
  if (buf[0] === 0xff && buf[1] === 0xd8) sniffed = "image/jpeg";
  else if (buf[0] === 0x89 && buf[1] === 0x50) sniffed = "image/png";
  else if (buf[0] === 0x47 && buf[1] === 0x49) sniffed = "image/gif";
  else if (buf.toString("ascii", 0, 4) === "RIFF") sniffed = "image/webp";

  if (claimedMime && sniffed && claimedMime !== sniffed) {
    return { ok: false, reason: "mime_mismatch", sniffedMime: sniffed };
  }
  if (!sniffed) return { ok: false, reason: "unknown_magic", sniffedMime: null };
  return { ok: true, sniffedMime: sniffed };
}

/** Test helper — exported for red-team DNS assertions without network. */
export function assertIpFamily(ip: string): number {
  return net.isIP(ip);
}
