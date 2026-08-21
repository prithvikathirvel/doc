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
  clearSession,
  homePathFor,
  isPlatformAdmin,
  loadSession,
  loginPathFor,
  saveSession,
} from "@/lib/session";
import { ApiError, authApi, tenantsApi } from "@/lib/api";
import { toast } from "sonner";

interface SessionContextValue {
  session: Session | null;
  ready: boolean;
  isPlatformAdmin: boolean;
  signIn: (session: Session) => void;
  signOut: () => Promise<void>;
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

  useEffect(() => {
    setSession(loadSession());
    setReady(true);
  }, []);

  const signIn = useCallback((next: Session) => {
    saveSession(next);
    setSession(next);
  }, []);

  const signOut = useCallback(async () => {
    const current = loadSession() || session;
    const target = loginPathFor(current);
    try {
      if (current?.refreshToken) await authApi.logout(current.refreshToken, current.idToken);
    } catch {
      // Local logout is still completed when the identity provider is offline.
    } finally {
      clearSession();
      setSession(null);
      setTenant(null);
      setStorage(null);
      router.replace(target);
    }
  }, [router, session]);

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
      // The stored session points at a workspace that no longer exists or is no
      // longer accessible: end it instead of leaving the user on a broken screen.
      if (error instanceof ApiError && (error.status === 404 || error.status === 403)) {
        clearSession();
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
      signIn,
      signOut,
      tenant,
      storage,
      tenantLoading,
      refreshTenant,
    }),
    [session, ready, signIn, signOut, tenant, storage, tenantLoading, refreshTenant]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) throw new Error("useSession must be used inside SessionProvider");
  return context;
}

export { homePathFor, loginPathFor };
