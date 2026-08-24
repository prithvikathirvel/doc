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
import { useRouter } from "next/navigation";
import type { Session, Tenant, TenantStorageConfig } from "@/lib/types";
import {
  buildSession,
  clearActiveTenant,
  homePathFor,
  isPlatformAdmin,
  loadActiveTenant,
  loginPathFor,
  saveActiveTenant,
} from "@/lib/session";
import { SESSION_EXPIRED_EVENT, ApiError, authApi, tenantsApi } from "@/lib/api";
import { toast } from "sonner";

interface SessionContextValue {
  session: Session | null;
  ready: boolean;
  isPlatformAdmin: boolean;
  /** Re-reads the cookie session from the API (e.g. right after sign-in). */
  refreshSession: () => Promise<Session | null>;
  signOut: () => Promise<void>;
  /** Switches the workspace a multi-workspace member operates on. */
  setActiveTenant: (tenantId: string) => void;
  /** Tenant of the signed-in user. Platform administrators have none. */
  tenant: Tenant | null;
  storage: TenantStorageConfig | null;
  tenantLoading: boolean;
  refreshTenant: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [storage, setStorage] = useState<TenantStorageConfig | null>(null);
  const [tenantLoading, setTenantLoading] = useState(false);

  const applySession = useCallback((next: Session | null): Session | null => {
    setSession(next);
    setReady(true);
    return next;
  }, []);

  const refreshSession = useCallback(async (): Promise<Session | null> => {
    try {
      const result = await authApi.session();
      return applySession(buildSession(result.session, loadActiveTenant()));
    } catch {
      clearActiveTenant();
      return applySession(null);
    }
  }, [applySession]);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  // The API signals (via the shared refresh failure) that the cookie session
  // is gone: drop local state and return the user to their sign-in page.
  useEffect(() => {
    const onExpired = () => {
      clearActiveTenant();
      setSession(null);
      toast.error("Your session ended. Sign in again.");
      router.replace("/login");
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, [router]);

  const signOut = useCallback(async () => {
    const target = loginPathFor(session);
    try {
      await authApi.logout();
    } catch {
      // Cookies are cleared server-side best-effort; proceed locally anyway.
    }
    clearActiveTenant();
    setSession(null);
    setTenant(null);
    setStorage(null);
    router.replace(target);
  }, [router, session]);

  const setActiveTenant = useCallback(
    (tenantId: string) => {
      saveActiveTenant(tenantId);
      setSession((current) =>
        current
          ? buildSession(
              {
                user: {
                  userId: current.userId,
                  email: current.email,
                  displayName: current.userName,
                  username: null,
                },
                isPlatformAdmin: current.isPlatformAdmin,
                memberships: current.memberships,
              },
              tenantId
            )
          : current
      );
    },
    []
  );

  const refreshTenant = useCallback(async () => {
    if (!session || session.scope !== "tenant" || !session.tenantId) {
      setTenant(null);
      setStorage(null);
      return;
    }
    setTenantLoading(true);
    try {
      const result = await tenantsApi.me(session.tenantId);
      setTenant(result.tenant);
      setStorage(result.storage ?? null);
    } catch (error) {
      setTenant(null);
      setStorage(null);
      // The membership no longer exists or was suspended: end the session.
      if (error instanceof ApiError && (error.status === 404 || error.status === 403)) {
        clearActiveTenant();
        setSession(null);
        toast.error("This workspace is no longer available. Sign in again.");
        router.replace("/login");
      }
    } finally {
      setTenantLoading(false);
    }
  }, [session, router]);

  useEffect(() => {
    if (!ready) return;
    void refreshTenant();
  }, [ready, refreshTenant]);

  const value = useMemo<SessionContextValue>(
    () => ({
      session,
      ready,
      isPlatformAdmin: isPlatformAdmin(session),
      refreshSession,
      signOut,
      setActiveTenant,
      tenant,
      storage,
      tenantLoading,
      refreshTenant,
    }),
    [session, ready, refreshSession, signOut, setActiveTenant, tenant, storage, tenantLoading, refreshTenant]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) throw new Error("useSession must be used inside SessionProvider");
  return context;
}

export { homePathFor, loginPathFor };
