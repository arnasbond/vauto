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

  clearAuthSessionFull,

  loadAccessToken,

  persistAuthSessionFull,

  restorePersistedAuth,

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

  ProBusinessType,

  UserProfile,

  UserRole,

} from "@/lib/types";

import { GlobalAuthModal } from "@/components/auth/GlobalAuthModal";

import { consumeOAuthPendingPayload } from "@/lib/auth/oauth-redirect";



export interface LoginPayload {

  provider: AuthProviderType;

  phone?: string;

  role: UserRole;

  email?: string;

  otp?: string;

  city?: string;

  idToken?: string;

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



  const isAdmin = isSuperAdminUser(user);



  useEffect(() => {

    async function restore() {

      const { session: auth, user: storedUser, token } = await restorePersistedAuth();



      if (auth?.isAuthenticated && storedUser) {

        if (auth.expiresAt && new Date(auth.expiresAt).getTime() < Date.now()) {

          await clearAuthSessionFull();

          clearUser();

          setHydrated(true);

          return;

        }



        setUser(storedUser);

        setIsAuthenticated(true);



        const accessToken = token ?? auth.accessToken ?? loadAccessToken();

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

          } else if (refreshed.status === 401) {

            await clearAuthSessionFull();

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

    setAuthRedirectPath(redirectPath);

    setAuthModalOpen(true);

  }, []);



  const closeAuthModal = useCallback(() => setAuthModalOpen(false), []);



  const clearAuthRedirect = useCallback(() => setAuthRedirectPath(null), []);



  const applyReferralOnSignup = useCallback((newUserId: string) => {

    const ref = consumePendingReferral();

    if (ref && ref !== newUserId) {

      grantReferralCredit(ref);

    }

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

        name: "Vauto Admin",

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

      city: data.city || user.city || "Vilnius",

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

        if (isAuthApiAvailable()) {

          const apiResult =

            data.provider === "phone" && data.phone && data.otp

              ? await apiVerifyOtp({

                  phone: data.phone,

                  code: data.otp,

                  role: data.role === "admin" ? "admin" : "private",

                  city: data.city ?? user.city,

                })

              : await apiSocialLogin({

                  provider: data.provider,

                  role: data.role === "admin" ? "admin" : "private",

                  email: data.email,

                  city: data.city ?? user.city,

                  idToken: data.idToken,

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



          await persistAuthSessionFull(session, profile);

          setUser(profile);

          setIsAuthenticated(true);

          applyReferralOnSignup(profile.id);

          return;

        }



        const profile = loginLocal(data);

        const session = {

          isAuthenticated: true as const,

          provider: data.provider,

          loggedInAt: new Date().toISOString(),

        };

        await persistAuthSessionFull(session, profile);

        setUser(profile);

        setIsAuthenticated(true);

        applyReferralOnSignup(profile.id);

      } finally {

        setAuthLoading(false);

      }

    },

    [loginLocal, user.city, applyReferralOnSignup]

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

    };

    await persistAuthSessionFull(session, profile);

    setUser(profile);

    setIsAuthenticated(true);

  }, []);



  const logout = useCallback(() => {

    setIsAuthenticated(false);

    clearAuthSession();

    void clearAuthSessionFull();

    clearUser();

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

      refreshAuthUser,

      login,

      upgradeToPro,

      logout,

      openAuthModal,

      closeAuthModal,

      clearAuthRedirect,

      requireAuthForListing,

      restoreDemoSession,

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


