const VINTED_HOST_RE =
  /vinted\.(lt|com|fr|de|pl|it|es|nl|be|at|cz|sk|hu|ro|gr|hr|fi|dk|se|no|co\.uk|com\.ua)$/i;

const MEMBER_PATH_RE = /\/member(s)?\//i;
const INVITE_PATH_RE = /\/invite\//i;

const FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (compatible; VautoWardrobeImporter/1.0; +https://vauto.app)",
  Accept: "text/html,application/xhtml+xml",
};

export function isVintedHostname(hostname: string): boolean {
  return VINTED_HOST_RE.test(hostname);
}

/** Accepts Vinted /member(s)/ and /invite/ profile entry URLs. */
export function isWardrobeProfileUrl(url: string): boolean {
  try {
    const u = new URL(url.trim());
    if (!isVintedHostname(u.hostname)) return false;
    return MEMBER_PATH_RE.test(u.pathname) || INVITE_PATH_RE.test(u.pathname);
  } catch {
    return false;
  }
}

function extractMemberUrlFromHtml(html: string, fallbackHost: string): string | null {
  const absolute = html.match(
    /https?:\/\/[^"'\s<>]+\/members?\/[^"'\s<>]+/i
  );
  if (absolute?.[0]) return absolute[0];

  const relative = html.match(/href="(\/?members?\/[^"]+)"/i);
  if (relative?.[1]) {
    const path = relative[1].startsWith("/") ? relative[1] : `/${relative[1]}`;
    return `https://${fallbackHost}${path}`;
  }
  return null;
}

/** Follow invite redirects and resolve the canonical member profile URL when possible. */
export async function resolveVintedProfileUrl(url: string): Promise<string> {
  const trimmed = url.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return trimmed;
  }

  if (MEMBER_PATH_RE.test(parsed.pathname)) return trimmed;
  if (!INVITE_PATH_RE.test(parsed.pathname)) return trimmed;

  try {
    const res = await fetch(trimmed, {
      redirect: "follow",
      headers: FETCH_HEADERS,
      signal: AbortSignal.timeout(12_000),
    });

    try {
      const finalParsed = new URL(res.url);
      if (
        isVintedHostname(finalParsed.hostname) &&
        MEMBER_PATH_RE.test(finalParsed.pathname)
      ) {
        return res.url;
      }
    } catch {
      /* ignore malformed redirect target */
    }

    if (res.ok) {
      const html = await res.text();
      const extracted = extractMemberUrlFromHtml(html, parsed.hostname);
      if (extracted) return extracted;
    }
  } catch {
    /* keep original URL — import may still work from invite page HTML */
  }

  return trimmed;
}
