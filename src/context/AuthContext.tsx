"use client";



import {

  createContext,

  useCallback,

  useContext,

  useEffect,

  useMemo,

  useRef,

  useState,

  type ReactNode,

} from "react";

import { ANONYMOUS_USER } from "@/data/mockListings";

import { ADMIN_EMAIL } from "@/lib/reports";

import { isSuperAdminUser } from "@/lib/admin-access";

import {

  apiFetchAuthSession,

  apiSocialLogin,

  apiUpgradeToPro,

  apiVerifyOtp,

  isAuthApiAvailable,

  mapApiUserToProfile,

} from "@/lib/auth/api";

import { persistAuthBundle } from "@/lib/auth/persistence";

import {
  validateMockPhoneAuth,
} from "@/lib/auth/mock-auth-registry";

import {
  isSessionExpired,
  sessionExpiresAtFromNow,
} from "@/lib/auth/session-constants";

import { maybeRefreshAccessToken } from "@/lib/auth/token-refresh";

import {
  activateUserScope,
  clearUserScope,
} from "@/lib/auth/user-scope";

import {

  clearAuthSessionFull,

  loadAccessToken,

  persistAuthSessionFull,

  restorePersistedAuth,

  saveAccessToken,

} from "@/lib/auth/session";

import {

  clearAuthSession,

  clearUser,

  loadAuthSession,

  saveUser,

} from "@/lib/storage";

import {

  consumePendingReferral,

  grantReferralCredit,

} from "@/lib/referral";

import { resolveStableUserId } from "@/lib/user-id";

import type {

  AuthProvider as AuthProviderType,

  AuthSession,

  ProBusinessType,

  UserProfile,

  UserRole,

} from "@/lib/types";

import { useRouter } from "next/navigation";

import { GlobalAuthModal } from "@/components/auth/GlobalAuthModal";
import { AuthColdStartOverlay } from "@/components/auth/AuthColdStartOverlay";
import { SessionAutoLoginGuard } from "@/components/auth/SessionAutoLoginGuard";

import { consumeOAuthPendingPayload } from "@/lib/auth/oauth-redirect";
import { bootstrapTokenHandoff } from "@/lib/auth/token-handoff";
import { registerNativePush } from "@/lib/native-push";



export type AuthSignupIntent = "private" | "pro" | "wardrobe";

export interface LoginPayload {

  provider: AuthProviderType;

  phone?: string;

  role: UserRole;

  email?: string;

  otp?: string;

  city?: string;

  idToken?: string;

  name?: string;

  signupIntent?: AuthSignupIntent;

  /** Explicit signup — never inferred from empty local mock registry. */
  isRegistration?: boolean;

}



export interface UpgradeToProPayload {

  businessType: ProBusinessType;

  companyName: string;

  companyCode: string;

  vatCode?: string;

  serviceBaseCity?: string;

  serviceRadiusKm?: number;

  serviceNationwide?: boolean;

  serviceSpecialties?: string[];

}



interface AuthContextValue {

  user: UserProfile;

  isAuthenticated: boolean;

  authHydrated: boolean;

  isAdmin: boolean;

  authModalOpen: boolean;

  authRedirectPath: string | null;

  authLoading: boolean;

  authError: string | null;

  clearAuthError: () => void;

  updateUser: (patch: Partial<UserProfile>) => void;

  refreshAuthUser: () => Promise<boolean>;

  login: (data: LoginPayload) => Promise<void>;

  upgradeToPro: (data: UpgradeToProPayload) => Promise<boolean>;

  logout: () => void;

  openAuthModal: (redirectPath?: string) => void;

  closeAuthModal: () => void;

  clearAuthRedirect: () => void;

  requireAuthForListing: (redirectPath?: string) => boolean;

  restoreDemoSession: (profile: UserProfile) => void | Promise<void>;

  consumePendingAuthIntent: () => AuthSignupIntent | null;

}



const AuthContext = createContext<AuthContextValue | null>(null);



export function AuthProvider({ children }: { children: ReactNode }) {

  const router = useRouter();

  const [user, setUser] = useState<UserProfile>(ANONYMOUS_USER);

  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const [authModalOpen, setAuthModalOpen] = useState(false);

  const [authRedirectPath, setAuthRedirectPath] = useState<string | null>(null);

  const [authLoading, setAuthLoading] = useState(false);

  const [authError, setAuthError] = useState<string | null>(null);

  const [hydrated, setHydrated] = useState(false);

  const pendingAuthIntentRef = useRef<AuthSignupIntent | null>(null);

  const applyAuthenticatedUser = useCallback(
    async (profile: UserProfile, session: AuthSession) => {
      activateUserScope(profile.id);
      await persistAuthSessionFull(session, profile);
      setUser(profile);
      setIsAuthenticated(true);
    },
    []
  );



  const isAdmin = isSuperAdminUser(user);

  /** anonser.lt → vauto.anonser.lt JWT handoff (URL param or postMessage). */
  useEffect(() => {
    const applyHandoff = async (token: string) => {
      saveAccessToken(token);
      if (!isAuthApiAvailable()) return;
      const refreshed = await apiFetchAuthSession(token);
      if (!refreshed.ok) return;
      const updated = mapApiUserToProfile(refreshed.data.user, {
        role: refreshed.data.role,
        provider: "phone",
      });
      const session: AuthSession = {
        isAuthenticated: true,
        provider: updated.authProvider ?? "phone",
        loggedInAt: new Date().toISOString(),
        accessToken: token,
      };
      await applyAuthenticatedUser(updated, session);
    };

    return bootstrapTokenHandoff((token) => {
      void applyHandoff(token);
    });
  }, [applyAuthenticatedUser]);

  useEffect(() => {

    async function restore() {

      try {

      const { session: auth, user: storedUser, token } = await restorePersistedAuth();

      const accessToken = token ?? auth?.accessToken ?? loadAccessToken();

      if (accessToken && isAuthApiAvailable()) {

        const refreshed = await apiFetchAuthSession(accessToken);

        if (refreshed.ok) {

          const updated = mapApiUserToProfile(refreshed.data.user, {

            role: refreshed.data.role,

            provider:

              (storedUser?.authProvider as AuthProviderType | undefined) ??

              (auth?.provider as AuthProviderType | undefined) ??

              "phone",

          });

          const session: AuthSession = {

            isAuthenticated: true,

            provider: updated.authProvider ?? "phone",

            loggedInAt: auth?.loggedInAt ?? new Date().toISOString(),

            accessToken,

            expiresAt: auth?.expiresAt,

          };

          activateUserScope(updated.id);

          setUser(updated);

          setIsAuthenticated(true);

          await persistAuthSessionFull(session, updated);

          void maybeRefreshAccessToken(updated);

          return;

        }

        if (refreshed.status === 401) {

          await clearAuthSessionFull();

          clearUser();

          setIsAuthenticated(false);

          setUser(ANONYMOUS_USER);

          return;

        }

        // Network / server errors: keep persisted session for seamless return visits.

        if (auth?.isAuthenticated && storedUser && !isSessionExpired(auth.expiresAt)) {

          activateUserScope(storedUser.id);

          setUser(storedUser);

          setIsAuthenticated(true);

          return;

        }

      }



      if (auth?.isAuthenticated && storedUser) {

        if (isSessionExpired(auth.expiresAt)) {

          await clearAuthSessionFull();

          clearUser();

          return;

        }



        activateUserScope(storedUser.id);

        setUser(storedUser);

        setIsAuthenticated(true);



        if (accessToken && isAuthApiAvailable()) {

          const refreshed = await apiFetchAuthSession(accessToken);

          if (refreshed.ok) {

            const updated = mapApiUserToProfile(refreshed.data.user, {

              role: refreshed.data.role,

              provider: storedUser.authProvider ?? "phone",

            });

            setUser(updated);

            await persistAuthSessionFull(

              { ...auth, accessToken },

              updated

            );

            void maybeRefreshAccessToken(updated);

          } else if (refreshed.status === 401) {

            await clearAuthSessionFull();

            setIsAuthenticated(false);

            setUser(ANONYMOUS_USER);

          }

        }

      }

      } catch (e) {

        console.error("[vauto] auth restore failed — clearing session", e);

        try {

          await clearAuthSessionFull();

        } catch {

          /* ignore */

        }

        setIsAuthenticated(false);

        setUser(ANONYMOUS_USER);

      } finally {

      setHydrated(true);

      }

    }

    void restore();

  }, []);



  useEffect(() => {

    if (!hydrated || !isAuthenticated) return;

    saveUser(user);

    const auth = loadAuthSession();

    if (auth?.isAuthenticated) {

      void persistAuthBundle(auth, user, auth.accessToken ?? loadAccessToken());

    }

  }, [user, hydrated, isAuthenticated]);



  const clearAuthError = useCallback(() => setAuthError(null), []);



  const updateUser = useCallback((patch: Partial<UserProfile>) => {

    setUser((prev) => ({ ...prev, ...patch }));

  }, []);



  const refreshAuthUser = useCallback(async (): Promise<boolean> => {

    const token = loadAccessToken();

    if (!token || !isAuthApiAvailable()) return false;

    const refreshed = await apiFetchAuthSession(token);

    if (!refreshed.ok) return false;

    let synced: UserProfile | null = null;

    setUser((prev) => {

      synced = mapApiUserToProfile(refreshed.data.user, {

        role: refreshed.data.role,

        provider: prev.authProvider ?? "phone",

      });

      return synced;

    });

    const auth = loadAuthSession();

    if (auth?.isAuthenticated && synced) {

      await persistAuthSessionFull({ ...auth, accessToken: token }, synced);

    }

    return true;

  }, []);



  const openAuthModal = useCallback((redirectPath = "/add") => {

    if (hydrated && isAuthenticated) {

      const target = redirectPath.replace(/\/$/, "") || "/";

      const current =

        typeof window !== "undefined"

          ? window.location.pathname.replace(/\/$/, "") || "/"

          : "/";

      if (target !== current) {

        router.replace(redirectPath);

      }

      return;

    }

    setAuthRedirectPath(redirectPath);

    setAuthModalOpen(true);

  }, [hydrated, isAuthenticated, router]);



  const closeAuthModal = useCallback(() => setAuthModalOpen(false), []);



  useEffect(() => {

    if (!hydrated || !isAuthenticated) return;

    setAuthModalOpen(false);

  }, [hydrated, isAuthenticated]);



  useEffect(() => {

    if (!hydrated || !isAuthenticated) return;

    void registerNativePush();

  }, [hydrated, isAuthenticated]);



  const clearAuthRedirect = useCallback(() => setAuthRedirectPath(null), []);



  const applySignupIntentAfterLogin = useCallback((intent?: AuthSignupIntent) => {

    if (!intent || intent === "private") return;

    pendingAuthIntentRef.current = intent;

    setAuthRedirectPath("/profile/");

  }, []);



  const consumePendingAuthIntent = useCallback((): AuthSignupIntent | null => {

    const intent = pendingAuthIntentRef.current;

    pendingAuthIntentRef.current = null;

    return intent;

  }, []);



  const applyReferralOnSignup = useCallback((newUserId: string, referralCode?: string) => {

    if (!referralCode || referralCode === newUserId) return;

    grantReferralCredit(referralCode);

  }, []);



  const requireAuthForListing = useCallback(

    (redirectPath = "/add") => {

      if (!hydrated) return false;

      if (isAuthenticated) return true;

      openAuthModal(redirectPath);

      return false;

    },

    [hydrated, isAuthenticated, openAuthModal]

  );



  const loginLocal = useCallback((data: LoginPayload): UserProfile => {

    if (data.email === ADMIN_EMAIL || data.role === "admin") {

      return {

        id: "admin-1",

        name: "VAUTO Admin",

        email: ADMIN_EMAIL,

        avatar:

          "https://images.unsplash.com/photo-1560250097-0b93528c311a?w=100&h=100&fit=crop",

        phone: "+370 600 00001",

        city: "Vilnius",

        authProvider: data.provider,

        role: "super_admin",

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

      city: data.city || user.city || "",

      authProvider: data.provider,

      role: "private",

      walletBalance: 0,

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

        const referralCode = consumePendingReferral() ?? undefined;

        if (isAuthApiAvailable()) {

          const apiResult =

            data.provider === "phone" && data.phone && data.otp

              ? await apiVerifyOtp({

                  phone: data.phone,

                  code: data.otp,

                  role: data.role === "admin" ? "admin" : "private",

                  city: data.city ?? user.city,

                  referralCode,

                  isRegistration: data.isRegistration === true,

                })

              : await apiSocialLogin({

                  provider: data.provider,

                  role: data.role === "admin" ? "admin" : "private",

                  email: data.email,

                  name: data.name,

                  city: data.city ?? user.city,

                  idToken: data.idToken,

                  referralCode,

                });



          if (!apiResult.ok) {

            setAuthError(apiResult.error);

            return;

          }



          const profile = mapApiUserToProfile(apiResult.data.user, {

            role: apiResult.data.role as UserRole,

            provider: apiResult.data.provider as AuthProviderType,

          });



          const session = {

            isAuthenticated: true as const,

            provider: data.provider,

            loggedInAt: new Date().toISOString(),

            accessToken: apiResult.data.token,

            expiresAt: apiResult.data.expiresAt,

          };



          await applyAuthenticatedUser(profile, session);

          applySignupIntentAfterLogin(data.signupIntent);

          return;

        }



        const profile = loginLocal(data);

        const mockError = validateMockPhoneAuth(profile.phone, profile.id, {

          isNewRegistration: data.isRegistration === true,

        });

        if (mockError) {

          setAuthError(mockError);

          return;

        }

        const session = {

          isAuthenticated: true as const,

          provider: data.provider,

          loggedInAt: new Date().toISOString(),

          expiresAt: sessionExpiresAtFromNow(),

        };

        await applyAuthenticatedUser(profile, session);

        applyReferralOnSignup(profile.id, referralCode);

        applySignupIntentAfterLogin(data.signupIntent);

      } finally {

        setAuthLoading(false);

      }

    },

    [loginLocal, user.city, applyReferralOnSignup, applySignupIntentAfterLogin, applyAuthenticatedUser]

  );



  const upgradeToPro = useCallback(

    async (data: UpgradeToProPayload): Promise<boolean> => {

      setAuthLoading(true);

      setAuthError(null);

      try {

        if (isAuthApiAvailable()) {

          const result = await apiUpgradeToPro(data);

          if (!result.ok) {

            setAuthError(result.error);

            return false;

          }

          const profile = mapApiUserToProfile(result.data.user, {

            role: "pro",

            provider: result.data.provider as AuthProviderType,

            businessType: data.businessType,

          });

          const session = {

            isAuthenticated: true as const,

            provider: user.authProvider ?? "phone",

            loggedInAt: new Date().toISOString(),

            accessToken: result.data.token,

            expiresAt: result.data.expiresAt,

          };

          await persistAuthSessionFull(session, profile);

          setUser(profile);

          setIsAuthenticated(true);

          return true;

        }

        const profile: UserProfile = {

          ...user,

          role: "pro",

          businessType: data.businessType,

          companyName: data.companyName,

          companyCode: data.companyCode,

          vatCode: data.vatCode,

          serviceBaseCity: data.serviceBaseCity,

          serviceRadiusKm: data.serviceRadiusKm,

          serviceNationwide: data.serviceNationwide,

          serviceSpecialties: data.serviceSpecialties,

          billingPlan: user.billingPlan ?? "starter",

          billingModel: user.billingModel ?? "ppc",

          walletBalance: user.walletBalance ?? 25,

        };

        const session = {

          isAuthenticated: true as const,

          provider: user.authProvider ?? "phone",

          loggedInAt: new Date().toISOString(),

        };

        await persistAuthSessionFull(session, profile);

        saveUser(profile);

        setUser(profile);

        setIsAuthenticated(true);

        return true;

      } finally {

        setAuthLoading(false);

      }

    },

    [user]

  );



  useEffect(() => {

    if (!hydrated || isAuthenticated) return;

    const pending = consumeOAuthPendingPayload();

    if (!pending?.idToken) return;

    void login({

      provider: pending.provider,

      role: "private",

      idToken: pending.idToken,

    });

  }, [hydrated, isAuthenticated, login]);



  const restoreDemoSession = useCallback(async (profile: UserProfile) => {

    const session = {

      isAuthenticated: true as const,

      provider: profile.authProvider ?? "phone",

      loggedInAt: new Date().toISOString(),

      expiresAt: sessionExpiresAtFromNow(),

    };

    await applyAuthenticatedUser(profile, session);

  }, [applyAuthenticatedUser]);



  const logout = useCallback(() => {

    setIsAuthenticated(false);

    clearAuthSession();

    void clearAuthSessionFull();

    clearUser();

    clearUserScope();

    setUser(ANONYMOUS_USER);

  }, []);



  useEffect(() => {

    if (!hydrated || !isAuthenticated) return;

    const interval = window.setInterval(() => {

      void maybeRefreshAccessToken(user);

    }, 60 * 60 * 1000);

    void maybeRefreshAccessToken(user);

    return () => window.clearInterval(interval);

  }, [hydrated, isAuthenticated, user]);



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

      refreshAuthUser,

      login,

      upgradeToPro,

      logout,

      openAuthModal,

      closeAuthModal,

      clearAuthRedirect,

      requireAuthForListing,

      restoreDemoSession,

      consumePendingAuthIntent,

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

      refreshAuthUser,

      login,

      upgradeToPro,

      logout,

      openAuthModal,

      closeAuthModal,

      clearAuthRedirect,

      requireAuthForListing,

      restoreDemoSession,

      consumePendingAuthIntent,

    ]

  );



  return (

    <AuthContext.Provider value={value}>

      {children}

      <SessionAutoLoginGuard />

      <AuthColdStartOverlay />

      <GlobalAuthModal />

    </AuthContext.Provider>

  );

}



export function useAuth(): AuthContextValue {

  const ctx = useContext(AuthContext);

  if (!ctx) throw new Error("useAuth must be used within AuthProvider");

  return ctx;

}


