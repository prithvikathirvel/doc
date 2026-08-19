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
import type { SessionIdentity, Tenant, TenantStorageConfig } from "@/lib/types";
import {
  DEFAULT_SESSION,
  isPlatformAdmin,
  loadSession,
  saveSession,
} from "@/lib/session";
import { tenantsApi } from "@/lib/api";

type SessionContextValue = {
  session: SessionIdentity;
  ready: boolean;
  setSession: (next: SessionIdentity) => void;
  updateSession: (partial: Partial<SessionIdentity>) => void;
  isAdmin: boolean;
  tenant: Tenant | null;
  storage: TenantStorageConfig | null | undefined;
  refreshTenant: () => Promise<void>;
  tenantLoading: boolean;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSessionState] = useState<SessionIdentity>(DEFAULT_SESSION);
  const [ready, setReady] = useState(false);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [storage, setStorage] = useState<TenantStorageConfig | null | undefined>(undefined);
  const [tenantLoading, setTenantLoading] = useState(false);

  useEffect(() => {
    setSessionState(loadSession());
    setReady(true);
  }, []);

  const setSession = useCallback((next: SessionIdentity) => {
    setSessionState(next);
    saveSession(next);
  }, []);

  const updateSession = useCallback((partial: Partial<SessionIdentity>) => {
    setSessionState((prev) => {
      const next = { ...prev, ...partial };
      saveSession(next);
      return next;
    });
  }, []);

  const refreshTenant = useCallback(async () => {
    if (!session.tenantId) {
      setTenant(null);
      setStorage(null);
      return;
    }
    setTenantLoading(true);
    try {
      const res = await tenantsApi.me();
      setTenant(res.tenant);
      setStorage(res.storage ?? null);
    } catch {
      setTenant(null);
      setStorage(null);
    } finally {
      setTenantLoading(false);
    }
  }, [session.tenantId, session.userId, session.roles.join(",")]);

  useEffect(() => {
    if (!ready) return;
    void refreshTenant();
  }, [ready, refreshTenant]);

  const value = useMemo<SessionContextValue>(
    () => ({
      session,
      ready,
      setSession,
      updateSession,
      isAdmin: isPlatformAdmin(session.roles),
      tenant,
      storage,
      refreshTenant,
      tenantLoading,
    }),
    [session, ready, setSession, updateSession, tenant, storage, refreshTenant, tenantLoading]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}
