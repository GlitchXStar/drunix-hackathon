"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import type { ApiUser } from "./api";
import * as api from "./api";

/* ---------- types -------------------------------------------------------- */

interface AuthState {
  user: ApiUser | null;
  loading: boolean;
  error: string | null;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

/* ---------- context ------------------------------------------------------ */

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

/* ---------- role helpers ------------------------------------------------- */

const BUSINESS_ROLES = ["BUSINESS_OWNER", "BUSINESS_EMPLOYEE"];
const INSTITUTION_ROLES = ["KYC_OFFICER", "LOAN_OFFICER", "COMPLIANCE_OFFICER", "INSTITUTION_ADMIN"];
const ADMIN_ROLES = ["PLATFORM_SUPER_ADMIN"];

export function dashboardPath(role: string): string {
  if (BUSINESS_ROLES.includes(role)) return "/business/profile";
  if (INSTITUTION_ROLES.includes(role)) return "/institution/redeem";
  if (ADMIN_ROLES.includes(role)) return "/admin";
  return "/login";
}

export function sidebarRole(role: string): string {
  const map: Record<string, string> = {
    BUSINESS_OWNER: "businessOwner",
    BUSINESS_EMPLOYEE: "businessOwner",
    KYC_OFFICER: "kycOfficer",
    LOAN_OFFICER: "loanOfficer",
    COMPLIANCE_OFFICER: "complianceOfficer",
    INSTITUTION_ADMIN: "institutionAdmin",
    PLATFORM_SUPER_ADMIN: "superAdmin",
  };
  return map[role] || "businessOwner";
}

/* ---------- provider ----------------------------------------------------- */

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<AuthState>({
    user: null,
    loading: true,
    error: null,
  });

  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await api.getMe();
      if (res.csrfToken) {
        api.setCsrfToken(res.csrfToken);
      }
      if (isMountedRef.current) {
        setState({ user: res.user, loading: false, error: null });
      }
    } catch {
      api.setCsrfToken(null);
      if (isMountedRef.current) {
        setState({ user: null, loading: false, error: null });
      }
      if (typeof window !== "undefined") {
        const path = window.location.pathname;
        if (
          path.startsWith("/institution") ||
          path.startsWith("/business") ||
          path.startsWith("/admin")
        ) {
          router.replace("/login?reason=session_expired");
        }
      }
    }
  }, [router]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!state.loading && !state.user && typeof window !== "undefined") {
      const path = window.location.pathname;
      if (
        path.startsWith("/institution") ||
        path.startsWith("/business") ||
        path.startsWith("/admin")
      ) {
        router.replace("/login?reason=session_expired");
      }
    }
  }, [state.loading, state.user, router]);

  const login = useCallback(
    async (email: string, password: string) => {
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const { user } = await api.login(email, password);
        if (isMountedRef.current) {
          setState({ user, loading: false, error: null });
        }
        router.push(dashboardPath(user.role));
      } catch (err: any) {
        if (isMountedRef.current) {
          setState({
            user: null,
            loading: false,
            error: err?.message || "Login failed",
          });
        }
        throw err;
      }
    },
    [router],
  );

  const doLogout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      /* ignore */
    }
    if (isMountedRef.current) {
      setState({ user: null, loading: false, error: null });
    }
    router.push("/login");
  }, [router]);

  const contextValue = useMemo<AuthContextValue>(
    () => ({
      ...state,
      login,
      logout: doLogout,
      refresh,
    }),
    [state, login, doLogout, refresh],
  );

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}
