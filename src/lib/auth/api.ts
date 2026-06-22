import type { AuthProvider, ProBusinessType, UserProfile, UserRole } from "@/lib/types";
import { getDataApiBaseUrl, isDataApiEnabled } from "@/lib/api/config";
import type { ApiResult } from "@/lib/api/client";

export interface AuthApiSession {
  token: string;
  expiresAt: string;
  user: {
    id: string;
    name: string;
    phone: string;
    city: string;
    avatar: string;
    email?: string;
    walletBalance?: number;
    soldCount?: number;
    role?: UserRole;
    businessType?: ProBusinessType;
    companyName?: string;
    companyCode?: string;
    vatCode?: string;
    billingPlan?: "free" | "starter" | "pro";
    billingModel?: "ppc" | "subscription";
    serviceBaseCity?: string;
    serviceRadiusKm?: number;
    serviceNationwide?: boolean;
    serviceSpecialties?: string[];
    averageResponseMinutes?: number;
  };
  role: UserRole;
  provider: AuthProvider;
}

async function authFetch<T>(
  path: string,
  opts?: RequestInit
): Promise<ApiResult<T>> {
  const base = getDataApiBaseUrl();
  if (!base) return { ok: false, error: "API not configured" };

  try {
    const res = await fetch(`${base}${path}`, {
      ...opts,
      headers: {
        "Content-Type": "application/json",
        ...(opts?.headers as Record<string, string>),
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      let message = text || res.statusText;
      try {
        const parsed = JSON.parse(text) as { error?: string };
        if (parsed.error) message = parsed.error;
      } catch {
        /* use raw */
      }
      return { ok: false, error: message, status: res.status };
    }
    return { ok: true, data: (await res.json()) as T };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export function isAuthApiAvailable(): boolean {
  return isDataApiEnabled();
}

export async function apiSendOtp(phone: string): Promise<ApiResult<{ ok: boolean }>> {
  return authFetch("/api/auth/otp/send", {
    method: "POST",
    body: JSON.stringify({ phone }),
  });
}

export async function apiVerifyOtp(params: {
  phone: string;
  code: string;
  role: UserRole;
  businessType?: ProBusinessType;
  city?: string;
  companyName?: string;
  companyCode?: string;
  vatCode?: string;
  serviceBaseCity?: string;
  serviceRadiusKm?: number;
  serviceNationwide?: boolean;
  serviceSpecialties?: string[];
}): Promise<ApiResult<AuthApiSession>> {
  return authFetch<AuthApiSession>("/api/auth/otp/verify", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export async function apiSocialLogin(params: {
  provider: AuthProvider;
  role: UserRole;
  businessType?: ProBusinessType;
  email?: string;
  city?: string;
  idToken?: string;
  companyName?: string;
  companyCode?: string;
  vatCode?: string;
  serviceBaseCity?: string;
  serviceRadiusKm?: number;
  serviceNationwide?: boolean;
  serviceSpecialties?: string[];
}): Promise<ApiResult<AuthApiSession>> {
  return authFetch<AuthApiSession>("/api/auth/social", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export async function apiFetchAuthSession(
  token: string
): Promise<ApiResult<{ user: AuthApiSession["user"]; role: UserRole }>> {
  return authFetch("/api/auth/session", {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function mapApiUserToProfile(
  apiUser: AuthApiSession["user"],
  meta: {
    role: UserRole;
    provider: AuthProvider;
    businessType?: ProBusinessType;
    walletBalance?: number;
  }
): UserProfile {
  return {
    id: apiUser.id,
    name: apiUser.name,
    phone: apiUser.phone,
    city: apiUser.city,
    email: apiUser.email,
    avatar: apiUser.avatar,
    authProvider: meta.provider,
    role: meta.role,
    businessType: meta.businessType ?? apiUser.businessType,
    companyName: apiUser.companyName,
    companyCode: apiUser.companyCode,
    vatCode: apiUser.vatCode,
    billingPlan: apiUser.billingPlan,
    billingModel: apiUser.billingModel,
    serviceBaseCity: apiUser.serviceBaseCity,
    serviceRadiusKm: apiUser.serviceRadiusKm,
    serviceNationwide: apiUser.serviceNationwide,
    serviceSpecialties: apiUser.serviceSpecialties,
    averageResponseMinutes: apiUser.averageResponseMinutes,
    walletBalance:
      apiUser.walletBalance ??
      meta.walletBalance ??
      (meta.role === "pro" ? 25 : 0),
    memberSince: new Date().toISOString(),
    soldCount: apiUser.soldCount ?? 0,
  };
}
