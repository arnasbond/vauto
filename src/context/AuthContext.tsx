"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { ANONYMOUS_USER } from "@/data/mockListings";
import { ADMIN_EMAIL } from "@/lib/reports";
import {
  apiFetchAuthSession,
  apiSocialLogin,
  apiVerifyOtp,
  isAuthApiAvailable,
  mapApiUserToProfile,
} from "@/lib/auth/api";
import {
  clearAuthSessionFull,
  loadAccessToken,
  persistAuthSession,
} from "@/lib/auth/session";
import {
  clearAuthSession,
  loadAuthSession,
  loadUser,
  saveUser,
} from "@/lib/storage";
import { resolveStableUserId } from "@/lib/user-id";
import type {
  AuthProvider as AuthProviderType,
  ProBusinessType,
  UserProfile,
  UserRole,
} from "@/lib/types";
import { GlobalAuthModal } from "@/components/auth/GlobalAuthModal";

export interface LoginPayload {
  provider: AuthProviderType;
  phone?: string;
  role: UserRole;
  businessType?: ProBusinessType;
  email?: string;
  otp?: string;
  city?: string;
  idToken?: string;
  companyName?: string;
  companyCode?: string;
  vatCode?: string;
  serviceBaseCity?: string;
  serviceRadiusKm?: number;
  serviceNationwide?: boolean;
  serviceSpecialties?: string[];
}

interface AuthContextValue {
  user: UserProfile;
  isAuthenticated: boolean;
  /** False until localStorage session restore finishes (avoids guest flash on /add). */
  authHydrated: boolean;
  isAdmin: boolean;
  authModalOpen: boolean;
  authRedirectPath: string | null;
  authLoading: boolean;
  authError: string | null;
  clearAuthError: () => void;
  updateUser: (patch: Partial<UserProfile>) => void;
  login: (data: LoginPayload) => Promise<void>;
  logout: () => void;
  openAuthModal: (redirectPath?: string) => void;
  closeAuthModal: () => void;
  clearAuthRedirect: () => void;
  requireAuthForListing: (redirectPath?: string) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile>(ANONYMOUS_USER);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authRedirectPath, setAuthRedirectPath] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const isAdmin =
    user.role === "admin" || user.email?.toLowerCase() === ADMIN_EMAIL;

  useEffect(() => {
    async function restore() {
      const auth = loadAuthSession();
      const storedUser = loadUser();
      const token = loadAccessToken();

      if (auth?.isAuthenticated && storedUser) {
        setUser(storedUser);
        setIsAuthenticated(true);

        if (token && isAuthApiAvailable()) {
          const session = await apiFetchAuthSession(token);
          if (session.ok) {
            setUser((prev) => ({
              ...prev,
              ...session.data.user,
              role: session.data.role ?? prev.role,
            }));
          } else if (session.status === 401) {
            clearAuthSessionFull();
            setIsAuthenticated(false);
            setUser(ANONYMOUS_USER);
          }
        }
      }
      setHydrated(true);
    }
    void restore();
  }, []);

  useEffect(() => {
    if (!hydrated || !isAuthenticated) return;
    saveUser(user);
  }, [user, hydrated, isAuthenticated]);

  const clearAuthError = useCallback(() => setAuthError(null), []);

  const updateUser = useCallback((patch: Partial<UserProfile>) => {
    setUser((prev) => ({ ...prev, ...patch }));
  }, []);

  const openAuthModal = useCallback((redirectPath = "/add") => {
    setAuthRedirectPath(redirectPath);
    setAuthModalOpen(true);
  }, []);

  const closeAuthModal = useCallback(() => setAuthModalOpen(false), []);

  const clearAuthRedirect = useCallback(() => setAuthRedirectPath(null), []);

  const requireAuthForListing = useCallback(
    (redirectPath = "/add") => {
      if (isAuthenticated) return true;
      openAuthModal(redirectPath);
      return false;
    },
    [isAuthenticated, openAuthModal]
  );

  const loginLocal = useCallback((data: LoginPayload): UserProfile => {
    if (data.email === ADMIN_EMAIL || data.role === "admin") {
      return {
        id: "admin-1",
        name: "Vauto Admin",
        email: ADMIN_EMAIL,
        avatar:
          "https://images.unsplash.com/photo-1560250097-0b93528c311a?w=100&h=100&fit=crop",
        phone: "+370 600 00001",
        city: "Vilnius",
        authProvider: data.provider,
        role: "admin",
        walletBalance: 0,
      };
    }

    const names: Record<AuthProviderType, string> = {
      google: "Google vartotojas",
      apple: "Apple vartotojas",
      phone: "Mobilus vartotojas",
    };

    return {
      id: resolveStableUserId({
        provider: data.provider,
        phone: data.phone,
        email: data.email,
      }),
      name: names[data.provider],
      phone: data.phone ?? "",
      city: data.city || user.city || "Vilnius",
      authProvider: data.provider,
      role: data.role,
      businessType: data.businessType,
      companyName: data.companyName,
      companyCode: data.companyCode,
      vatCode: data.vatCode,
      serviceBaseCity: data.serviceBaseCity,
      serviceRadiusKm: data.serviceRadiusKm,
      serviceNationwide: data.serviceNationwide,
      serviceSpecialties: data.serviceSpecialties,
      averageResponseMinutes: data.role === "pro" ? 12 : undefined,
      billingPlan: data.role === "pro" ? "starter" : "free",
      billingModel: data.role === "pro" ? "ppc" : undefined,
      walletBalance: data.role === "pro" ? 25 : 0,
      memberSince: new Date().toISOString(),
      soldCount: 0,
      avatar:
        data.provider === "apple"
          ? "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop"
          : "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop",
      email: data.email,
    };
  }, [user.city]);

  const login = useCallback(
    async (data: LoginPayload) => {
      setAuthLoading(true);
      setAuthError(null);
      try {
        if (isAuthApiAvailable()) {
          const apiResult =
            data.provider === "phone" && data.phone && data.otp
              ? await apiVerifyOtp({
                  phone: data.phone,
                  code: data.otp,
                  role: data.role,
                  businessType: data.businessType,
                  city: data.city ?? user.city,
                  companyName: data.companyName,
                  companyCode: data.companyCode,
                  vatCode: data.vatCode,
                  serviceBaseCity: data.serviceBaseCity,
                  serviceRadiusKm: data.serviceRadiusKm,
                  serviceNationwide: data.serviceNationwide,
                  serviceSpecialties: data.serviceSpecialties,
                })
              : await apiSocialLogin({
                  provider: data.provider,
                  role: data.role,
                  businessType: data.businessType,
                  email: data.email,
                  city: data.city ?? user.city,
                  idToken: data.idToken,
                  companyName: data.companyName,
                  companyCode: data.companyCode,
                  vatCode: data.vatCode,
                  serviceBaseCity: data.serviceBaseCity,
                  serviceRadiusKm: data.serviceRadiusKm,
                  serviceNationwide: data.serviceNationwide,
                  serviceSpecialties: data.serviceSpecialties,
                });

          if (!apiResult.ok) {
            setAuthError(apiResult.error);
            return;
          }

          const profile = mapApiUserToProfile(apiResult.data.user, {
            role: apiResult.data.role as UserRole,
            provider: apiResult.data.provider as AuthProviderType,
            businessType: data.businessType,
          });

          persistAuthSession({
            isAuthenticated: true,
            provider: data.provider,
            loggedInAt: new Date().toISOString(),
            accessToken: apiResult.data.token,
            expiresAt: apiResult.data.expiresAt,
          });

          setUser(profile);
          setIsAuthenticated(true);
          return;
        }

        const profile = loginLocal(data);
        persistAuthSession({
          isAuthenticated: true,
          provider: data.provider,
          loggedInAt: new Date().toISOString(),
        });
        setUser(profile);
        setIsAuthenticated(true);
      } finally {
        setAuthLoading(false);
      }
    },
    [loginLocal, user.city]
  );

  const logout = useCallback(() => {
    setIsAuthenticated(false);
    clearAuthSession();
    clearAuthSessionFull();
    setUser(ANONYMOUS_USER);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated,
      authHydrated: hydrated,
      isAdmin,
      authModalOpen,
      authRedirectPath,
      authLoading,
      authError,
      clearAuthError,
      updateUser,
      login,
      logout,
      openAuthModal,
      closeAuthModal,
      clearAuthRedirect,
      requireAuthForListing,
    }),
    [
      user,
      isAuthenticated,
      hydrated,
      isAdmin,
      authModalOpen,
      authRedirectPath,
      authLoading,
      authError,
      clearAuthError,
      updateUser,
      login,
      logout,
      openAuthModal,
      closeAuthModal,
      clearAuthRedirect,
      requireAuthForListing,
    ]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
      <GlobalAuthModal />
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
