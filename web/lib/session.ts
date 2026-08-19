"use client";

import type { SessionIdentity } from "./types";

const STORAGE_KEY = "dms.session.v1";

export const DEFAULT_SESSION: SessionIdentity = {
  tenantId: "11111111-1111-1111-1111-111111111111",
  userId: "alice",
  userName: "Alice Kumar",
  roles: ["tenant_admin"],
};

export function loadSession(): SessionIdentity {
  if (typeof window === "undefined") return DEFAULT_SESSION;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SESSION;
    const parsed = JSON.parse(raw) as Partial<SessionIdentity>;
    return {
      tenantId: parsed.tenantId || DEFAULT_SESSION.tenantId,
      userId: parsed.userId || DEFAULT_SESSION.userId,
      userName: parsed.userName || DEFAULT_SESSION.userName,
      roles:
        Array.isArray(parsed.roles) && parsed.roles.length > 0
          ? parsed.roles
          : DEFAULT_SESSION.roles,
    };
  } catch {
    return DEFAULT_SESSION;
  }
}

export function saveSession(session: SessionIdentity): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}

export function isPlatformAdmin(roles: string[]): boolean {
  return roles.includes("platform_admin") || roles.includes("admin");
}
