"use client";

import type { Session } from "./types";

const STORAGE_KEY = "dms.session";

export const PLATFORM_ADMIN_ROLE = "platform_admin";
export const TENANT_ADMIN_ROLE = "tenant_admin";
export const MEMBER_ROLE = "member";

export function loadSession(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Session>;
    if (!parsed.userId || !parsed.scope) return null;
    if (parsed.scope === "tenant" && !parsed.tenantId) return null;
    return {
      scope: parsed.scope,
      tenantId: parsed.tenantId || "",
      tenantName: parsed.tenantName,
      tenantSlug: parsed.tenantSlug,
      userId: parsed.userId,
      userName: parsed.userName || parsed.userId,
      roles: Array.isArray(parsed.roles) && parsed.roles.length ? parsed.roles : [MEMBER_ROLE],
      idToken: typeof parsed.idToken === "string" ? parsed.idToken : "",
      signedInAt: parsed.signedInAt || new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function saveSession(session: Session): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}

export function isPlatformAdmin(session: Session | null): boolean {
  return Boolean(session?.roles.includes(PLATFORM_ADMIN_ROLE));
}

export function homePathFor(session: Session | null): string {
  if (!session) return "/login";
  return isPlatformAdmin(session) ? "/admin" : "/workspace";
}
