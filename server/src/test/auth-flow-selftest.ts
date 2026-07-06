import { pool } from "../db.js";
import {
  E2E_TEST_OTP,
  E2E_TEST_PHONE,
  encodeE2eAppleToken,
  encodeE2eGoogleToken,
  isE2eMockAuthEnabled,
} from "../auth/e2e-mock-auth.js";
import { getUser } from "../repository.js";

export interface AuthFlowCheck {
  ok: boolean;
  detail?: string;
}

export interface AuthFlowSelfTestResult {
  ok: boolean;
  enabled: boolean;
  google: AuthFlowCheck;
  apple: AuthFlowCheck;
  sms: AuthFlowCheck;
  cleanup: AuthFlowCheck;
  hygiene: {
    authUsersRemaining: number;
    staleTestUsers: number;
  };
}

function stableUserId(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return `user-${Math.abs(hash)}`;
}

function apiBase(): string {
  const port = process.env.PORT ?? "4000";
  return `http://127.0.0.1:${port}`;
}

async function postJson<T>(path: string, body: unknown): Promise<{ status: number; data: T }> {
  const res = await fetch(`${apiBase()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T;
  return { status: res.status, data };
}

async function countStaleTestUsers(): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM users
     WHERE id LIKE 'user-%'
       AND id != 'user-1'
       AND (email LIKE '%@vauto.lt' OR email LIKE 'e2e-%')`
  );
  return Number(rows[0]?.count ?? 0);
}

async function deleteUserIfExists(userId: string): Promise<void> {
  await pool.query(
    `DELETE FROM support_reports
     WHERE reporter_id = $1 OR reported_user_id = $1`,
    [userId]
  );
  await pool.query(`DELETE FROM negotiation_audit_log WHERE seller_user_id = $1`, [
    userId,
  ]);
  await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
}

/** Server-side auth flow self-test — requires VAUTO_E2E_AUTH=1 and running API. */
export async function runAuthFlowSelfTest(): Promise<AuthFlowSelfTestResult> {
  const disabled: AuthFlowSelfTestResult = {
    ok: false,
    enabled: false,
    google: { ok: false, detail: "VAUTO_E2E_AUTH disabled" },
    apple: { ok: false, detail: "VAUTO_E2E_AUTH disabled" },
    sms: { ok: false, detail: "VAUTO_E2E_AUTH disabled" },
    cleanup: { ok: false, detail: "VAUTO_E2E_AUTH disabled" },
    hygiene: { authUsersRemaining: 0, staleTestUsers: 0 },
  };

  if (!isE2eMockAuthEnabled()) return disabled;

  const createdIds: string[] = [];
  let google: AuthFlowCheck = { ok: false };
  let apple: AuthFlowCheck = { ok: false };
  let sms: AuthFlowCheck = { ok: false };
  let cleanup: AuthFlowCheck = { ok: false };

  try {
    const googleSub = `e2e-google-${Date.now()}`;
    const googleUserId = stableUserId(`google:${googleSub}`);
    createdIds.push(googleUserId);

    const googleToken = encodeE2eGoogleToken({
      sub: googleSub,
      email: "e2e-google@vauto.lt",
      name: "E2E Google User",
      picture: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop",
    });

    const googleRes = await postJson<{
      user?: { email?: string; name?: string; avatar?: string };
      token?: string;
      error?: string;
    }>("/api/auth/social", {
      provider: "google",
      role: "private",
      idToken: googleToken,
    });

    if (googleRes.status !== 200 || !googleRes.data.token) {
      google = {
        ok: false,
        detail: googleRes.data.error ?? `HTTP ${googleRes.status}`,
      };
    } else {
      const row = await getUser(googleUserId);
      google = {
        ok: Boolean(
          row?.email === "e2e-google@vauto.lt" &&
            row?.name === "E2E Google User" &&
            row?.avatar?.includes("unsplash")
        ),
        detail: row
          ? `email=${row.email}, name=${row.name}`
          : "user row missing after Google login",
      };
    }

    const appleSub = `e2e-apple-${Date.now()}`;
    const appleUserId = stableUserId(`apple:${appleSub}`);
    createdIds.push(appleUserId);

    const appleToken = encodeE2eAppleToken({
      sub: appleSub,
      email: "e2e-apple@vauto.lt",
      name: "E2E Apple User",
    });

    const appleRes = await postJson<{
      user?: { email?: string };
      token?: string;
      error?: string;
    }>("/api/auth/social", {
      provider: "apple",
      role: "private",
      idToken: appleToken,
      name: "E2E Apple User",
    });

    if (appleRes.status !== 200 || !appleRes.data.token) {
      apple = {
        ok: false,
        detail: appleRes.data.error ?? `HTTP ${appleRes.status}`,
      };
    } else {
      const row = await getUser(appleUserId);
      apple = {
        ok: Boolean(row?.email === "e2e-apple@vauto.lt"),
        detail: row ? `email=${row.email}` : "user row missing after Apple login",
      };
    }

    const phoneUserId = stableUserId(`phone:${E2E_TEST_PHONE.replace(/\D/g, "")}`);
    createdIds.push(phoneUserId);

    const otpSend = await postJson<{ ok?: boolean; error?: string }>(
      "/api/auth/otp/send",
      { phone: E2E_TEST_PHONE }
    );
    if (otpSend.status !== 200) {
      sms = { ok: false, detail: otpSend.data.error ?? `send HTTP ${otpSend.status}` };
    } else {
      const otpVerify = await postJson<{
        token?: string;
        error?: string;
      }>("/api/auth/otp/verify", {
        phone: E2E_TEST_PHONE,
        code: E2E_TEST_OTP,
        role: "private",
      });
      if (otpVerify.status !== 200 || !otpVerify.data.token) {
        sms = {
          ok: false,
          detail: otpVerify.data.error ?? `verify HTTP ${otpVerify.status}`,
        };
      } else {
        const row = await getUser(phoneUserId);
        sms = {
          ok: Boolean(row?.phone?.replace(/\D/g, "") === E2E_TEST_PHONE.replace(/\D/g, "")),
          detail: row ? `phone=${row.phone}` : "user row missing after OTP",
        };
      }
    }
  } finally {
    try {
      for (const id of createdIds) {
        await deleteUserIfExists(id);
      }
      let allGone = true;
      for (const id of createdIds) {
        if (await getUser(id)) allGone = false;
      }
      cleanup = {
        ok: allGone,
        detail: `removed ${createdIds.length} test user(s)`,
      };
    } catch (e) {
      cleanup = { ok: false, detail: String(e) };
    }
  }

  const staleTestUsers = await countStaleTestUsers();
  const authUsers = await pool.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM users
     WHERE auth_provider IS NOT NULL OR id LIKE 'user-%' OR id = 'admin-1'`
  );

  const ok = google.ok && apple.ok && sms.ok && cleanup.ok && staleTestUsers === 0;

  return {
    ok,
    enabled: true,
    google,
    apple,
    sms,
    cleanup,
    hygiene: {
      authUsersRemaining: Number(authUsers.rows[0]?.count ?? 0),
      staleTestUsers,
    },
  };
}
