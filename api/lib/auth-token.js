const crypto = require("crypto");

const SECRET = process.env.JWT_SECRET ?? "vauto-dev-secret-change-in-production";

function verifyAccessToken(token) {
  const parts = String(token).split(".");
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  const expected = crypto
    .createHmac("sha256", SECRET)
    .update(`${header}.${body}`)
    .digest("base64url");
  if (sig !== expected) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!payload.sub || !payload.exp) return null;
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function isBearerAdmin(req) {
  const header = req.headers?.authorization;
  if (!header?.startsWith("Bearer ")) return false;
  const payload = verifyAccessToken(header.slice(7));
  return payload?.role === "admin";
}

module.exports = { verifyAccessToken, isBearerAdmin };
