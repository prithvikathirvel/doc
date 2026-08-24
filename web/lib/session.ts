"use client";

import type { AuthSession, Session, SessionMembership } from "./types";

export const PLATFORM_ADMIN_ROLE = "platform_admin";
export const TENANT_ADMIN_ROLE = "tenant_admin";
export const MEMBER_ROLE = "member";

const ACTIVE_TENANT_KEY = "dms.activeTenant";

export function loadActiveTenant(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ACTIVE_TENANT_KEY);
}

export function saveActiveTenant(tenantId: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ACTIVE_TENANT_KEY, tenantId);
}

export function clearActiveTenant(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(ACTIVE_TENANT_KEY);
}

/**
 * Projects the server session into the client session, resolving which
 * workspace the user is operating on:
 *
 * - platform administrators have no workspace (the console is cross-tenant);
 * - the remembered choice (tenant picker) wins when it is still valid;
 * - a user with exactly one workspace lands in it directly.
 */
export function buildSession(
  auth: AuthSession,
  preferredTenantId?: string | null
): Session {
  const memberships = auth.memberships || [];
  const active =
    (preferredTenantId && memberships.find((entry) => entry.tenantId === preferredTenantId)) ||
    (memberships.length === 1 ? memberships[0] : undefined);

  if (auth.isPlatformAdmin) {
    return {
      scope: "platform",
      tenantId: "",
      userId: auth.user.userId,
      userName: auth.user.displayName || auth.user.email,
      email: auth.user.email,
      roles: [PLATFORM_ADMIN_ROLE],
      isPlatformAdmin: true,
      memberships,
      signedInAt: new Date().toISOString(),
    };
  }

  return {
    scope: "tenant",
    tenantId: active?.tenantId || "",
    tenantName: active?.name,
    tenantSlug: active?.slug,
    userId: auth.user.userId,
    userName: auth.user.displayName || auth.user.email,
    email: auth.user.email,
    roles: [active?.role || MEMBER_ROLE],
    isPlatformAdmin: false,
    memberships,
    signedInAt: new Date().toISOString(),
  };
}

export function isPlatformAdmin(session: Session | null): boolean {
  return Boolean(session?.isPlatformAdmin);
}

export function homePathFor(session: Session | null): string {
  if (!session) return "/login";
  if (isPlatformAdmin(session)) return "/admin";
  if (!session.tenantId) return session.memberships.length > 1 ? "/select-workspace" : "/pending";
  return "/workspace";
}

/**
 * Where to land right after a successful sign-in. One credential set for
 * everyone; the server session decides who goes where:
 *
 * - platform administrator → the console
 * - member of one workspace → that workspace
 * - member of several workspaces → the picker
 * - no workspace yet → the pending screen
 */
export function routeAfterLogin(auth: AuthSession): string {
  if (auth.isPlatformAdmin) return "/admin";
  const memberships = auth.memberships || [];
  if (memberships.length === 0) return "/pending";
  if (memberships.length === 1) {
    saveActiveTenant(memberships[0].tenantId);
    return "/workspace";
  }
  return "/select-workspace";
}

/** Administrators and tenant users return to their own sign-in page. */
export function loginPathFor(session: Session | null): string {
  return isPlatformAdmin(session) ? "/admin/login" : "/login";
}

export { ACTIVE_TENANT_KEY };
export type { SessionMembership };
