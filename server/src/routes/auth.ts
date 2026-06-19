import { Router } from "express";
import crypto from "node:crypto";
import { issueOtp, verifyOtp } from "../auth/otp-store.js";
import { getTokenTtlMs, signAccessToken } from "../auth/tokens.js";
import { getUser, upsertUser } from "../repository.js";
import type { ApiUser } from "../types.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";

export const authRouter = Router();

function stableUserId(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return `user-${Math.abs(hash)}`;
}

function defaultAvatar(provider: string): string {
  return provider === "apple"
    ? "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop"
    : "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop";
}

function providerName(provider: string): string {
  if (provider === "google") return "Google vartotojas";
  if (provider === "apple") return "Apple vartotojas";
  return "Mobilus vartotojas";
}

async function buildSession(
  userId: string,
  profile: Partial<ApiUser> & { id: string },
  meta: { role: string; provider: string }
) {
  const existing = await getUser(userId);
  const user: ApiUser = {
    id: userId,
    name: profile.name ?? existing?.name ?? providerName(meta.provider),
    phone: profile.phone ?? existing?.phone ?? "+370",
    city: profile.city ?? existing?.city ?? "Panevėžys",
    avatar: profile.avatar ?? existing?.avatar ?? defaultAvatar(meta.provider),
    email: profile.email ?? existing?.email,
    warned: existing?.warned ?? false,
  };
  await upsertUser(user);
  const token = signAccessToken({
    sub: userId,
    role: meta.role,
    provider: meta.provider,
  });
  return {
    token,
    expiresAt: new Date(Date.now() + getTokenTtlMs()).toISOString(),
    user,
    role: meta.role,
    provider: meta.provider,
  };
}

authRouter.post("/otp/send", (req, res) => {
  const phone = String(req.body?.phone ?? "").trim();
  if (phone.replace(/\D/g, "").length < 8) {
    res.status(400).json({ error: "Invalid phone number" });
    return;
  }
  const { code, expiresAt } = issueOtp(phone);
  if (process.env.NODE_ENV !== "production") {
    console.log(`[Vauto Auth] OTP for ${phone}: ${code}`);
  }
  res.json({
    ok: true,
    expiresAt: new Date(expiresAt).toISOString(),
    ...(process.env.NODE_ENV !== "production" ? { devHint: "Demo OTP: 123456" } : {}),
  });
});

authRouter.post("/otp/verify", async (req, res) => {
  try {
    const phone = String(req.body?.phone ?? "").trim();
    const code = String(req.body?.code ?? "").trim();
    const role = String(req.body?.role ?? "private");
    const city = String(req.body?.city ?? "Panevėžys");

    if (!verifyOtp(phone, code)) {
      res.status(401).json({ error: "Neteisingas arba pasibaigęs kodas" });
      return;
    }

    const userId = stableUserId(`phone:${phone.replace(/\D/g, "")}`);
    const session = await buildSession(
      userId,
      { id: userId, phone, city, name: providerName("phone") },
      { role, provider: "phone" }
    );
    res.json(session);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

authRouter.post("/social", async (req, res) => {
  try {
    const provider = String(req.body?.provider ?? "google");
    const role = String(req.body?.role ?? "private");
    const email = req.body?.email ? String(req.body.email) : undefined;
    const city = String(req.body?.city ?? "Panevėžys");

    if (role === "admin") {
      const adminEmail = process.env.ADMIN_EMAIL ?? "admin@vauto.com";
      if (email?.toLowerCase() !== adminEmail.toLowerCase()) {
        res.status(403).json({ error: "Admin access denied" });
        return;
      }
      const session = await buildSession(
        "admin-1",
        {
          id: "admin-1",
          name: "Vauto Admin",
          phone: "+370 600 00001",
          city: "Vilnius",
          email: adminEmail,
          avatar:
            "https://images.unsplash.com/photo-1560250097-0b93528c311a?w=100&h=100&fit=crop",
        },
        { role: "admin", provider }
      );
      res.json(session);
      return;
    }

    const seed = email ?? `${provider}:${crypto.randomUUID()}`;
    const userId = stableUserId(seed);
    const session = await buildSession(
      userId,
      {
        id: userId,
        email,
        city,
        name: providerName(provider),
      },
      { role, provider }
    );
    res.json(session);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

authRouter.get("/session", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const user = await getUser(req.authUserId!);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json({
      user,
      role: req.authRole ?? "private",
      userId: req.authUserId,
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

authRouter.post("/logout", (_req, res) => {
  res.json({ ok: true });
});
