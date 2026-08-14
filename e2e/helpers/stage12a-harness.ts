import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import type { Page } from "@playwright/test";
import { seedAuthSession, stubOnboardingComplete } from "./seed-demo-user";

export const STAGE12A_JWT_SECRET = "vauto-dev-secret-change-in-production";

export type Stage12aHarness = {
  port: number;
  apiUrl: string;
  child: ChildProcess;
  stop: () => Promise<void>;
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function startStage12aHarness(
  port = Number(process.env.STAGE12A_HARNESS_PORT ?? 4011)
): Promise<Stage12aHarness> {
  const serverDir = path.join(process.cwd(), "server");
  const child = spawn("npx", ["tsx", "src/test/stage12a-http-app.ts"], {
    cwd: serverDir,
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: "test",
      JWT_SECRET: process.env.JWT_SECRET?.trim() || STAGE12A_JWT_SECRET,
      STAGE12A_HARNESS: "1",
    },
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let ready = false;
  let stderr = "";
  child.stdout?.on("data", (buf: Buffer) => {
    const s = buf.toString("utf8");
    if (s.includes("STAGE12A_HARNESS_READY")) ready = true;
  });
  child.stderr?.on("data", (buf: Buffer) => {
    stderr += buf.toString("utf8");
  });

  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (child.exitCode != null) {
      throw new Error(
        `Stage 12A harness exited ${child.exitCode}. stderr:\n${stderr}`
      );
    }
    if (ready) break;
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (res.ok) {
        ready = true;
        break;
      }
    } catch {
      /* still booting */
    }
    await sleep(250);
  }
  if (!ready) {
    child.kill();
    throw new Error(`Stage 12A harness did not start on :${port}. ${stderr}`);
  }

  const apiUrl = `http://127.0.0.1:${port}`;
  return {
    port,
    apiUrl,
    child,
    stop: async () => {
      if (child.pid && process.platform === "win32") {
        spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
          stdio: "ignore",
          shell: true,
        });
      } else if (child.pid) {
        child.kill("SIGTERM");
      }
      await sleep(300);
    },
  };
}

export async function harnessJson(
  apiUrl: string,
  pathAndQuery: string,
  opts?: {
    token?: string;
    method?: string;
    body?: unknown;
  }
): Promise<{ status: number; json: Record<string, unknown> | null; text: string }> {
  const headers: Record<string, string> = {};
  if (opts?.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts?.token) headers.Authorization = `Bearer ${opts.token}`;
  const res = await fetch(`${apiUrl}${pathAndQuery}`, {
    method: opts?.method ?? "GET",
    headers,
    body: opts?.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let json: Record<string, unknown> | null = null;
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : null;
  } catch {
    json = null;
  }
  return { status: res.status, json, text };
}

export async function mintHarnessToken(
  apiUrl: string,
  userId: string,
  role = "private"
): Promise<string> {
  const res = await harnessJson(apiUrl, "/api/test/token", {
    method: "POST",
    body: { userId, role },
  });
  const token = res.json && typeof res.json.token === "string" ? res.json.token : "";
  if (!token) {
    throw new Error(`mint token failed ${res.status} ${res.text}`);
  }
  return token;
}

export async function attachHarnessToPage(page: Page, apiUrl: string) {
  await page.route("**/runtime-config.json", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ apiUrl, conductorEnabled: false }),
    });
  });

  await page.route("**/api/**", async (route) => {
    const req = route.request();
    const incoming = new URL(req.url());
    if (incoming.origin === apiUrl) {
      await route.continue();
      return;
    }
    const target = `${apiUrl}${incoming.pathname}${incoming.search}`;
    const headers = { ...req.headers() };
    delete headers.host;
    delete headers["content-length"];
    const method = req.method();
    const hasBody = !["GET", "HEAD"].includes(method);
    const res = await fetch(target, {
      method,
      headers,
      body: hasBody ? req.postData() ?? undefined : undefined,
    });
    const buf = Buffer.from(await res.arrayBuffer());
    const outHeaders: Record<string, string> = {};
    res.headers.forEach((value, key) => {
      if (key.toLowerCase() === "transfer-encoding") return;
      outHeaders[key] = value;
    });
    await route.fulfill({
      status: res.status,
      headers: outHeaders,
      body: buf,
    });
  });
}

const E2E_AVATAR =
  "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop";

export async function seedHarnessUser(
  page: Page,
  opts: { userId: string; name: string; token: string }
) {
  await stubOnboardingComplete(page);
  await seedAuthSession(page, {
    id: opts.userId,
    name: opts.name,
    nickname: opts.name,
    avatar: E2E_AVATAR,
    phone: "+37060000001",
    role: "private",
    profileType: "private",
    walletBalance: 0,
  });
  await page.addInitScript(
    ({ token }) => {
      localStorage.setItem("vauto_access_token_v1", token);
      try {
        const raw = localStorage.getItem("vauto_auth_v1");
        const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
        parsed.accessToken = token;
        parsed.isAuthenticated = true;
        localStorage.setItem("vauto_auth_v1", JSON.stringify(parsed));
      } catch {
        localStorage.setItem(
          "vauto_auth_v1",
          JSON.stringify({
            isAuthenticated: true,
            provider: "phone",
            accessToken: token,
          })
        );
      }
    },
    { token: opts.token }
  );
}

export async function dismissUiChrome(page: Page) {
  const accept = page.getByRole("button", { name: "Sutinku" });
  if (await accept.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await accept.click();
  }
}
