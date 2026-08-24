import { NextFunction, Request, Response } from "express";
import { settings } from "../config/settings";
import { verifyAccessToken } from "../config/keycloak";
import { AppError, ForbiddenError, UnauthorizedError } from "../utils/errors";
import { AuthContext } from "../service/models";
import { isPlatformAdmin, normalizeRoles } from "../utils/roles";
import { container } from "../config/container";

declare global {
  namespace Express {
    interface Request {
      auth: AuthContext;
    }
  }
}

/**
 * Authentication has two intentionally explicit modes:
 *
 * - headers: local/dev compatibility only;
 * - keycloak: a signed RS256 Keycloak access token and the DMS app id are
 *   required. No client-supplied identity headers are read in this mode unless
 *   AUTH_ALLOW_DEV_HEADERS is deliberately enabled for a migration.
 *
 * In keycloak mode the token is **authentication only**. The caller's role is
 * resolved authoritatively on every request (User Management Service app roles
 * + DMS tenant_members), never from token claims, so a tenant integration can
 * forward a valid same-realm token that carries no role claims at all.
 * See docs/SECURE_AUTHORIZATION.md.
 */
export function authMiddleware(req: Request, _res: Response, next: NextFunction): void {
  if (settings.authMode === "headers" || settings.authDisabled) {
    authenticateFromHeaders(req, next);
    return;
  }

  const token = req.header("authorization") ? bearer(req.header("authorization")) : req.header("idtoken");
  if (!token) {
    if (settings.authAllowDevHeaders && hasDevIdentityHeaders(req)) {
      authenticateFromHeaders(req, next, true);
      return;
    }
    next(new UnauthorizedError("Token not provided"));
    return;
  }

  void verifyAndAttach(req, token, next);
}

async function verifyAndAttach(req: Request, token: string, next: NextFunction): Promise<void> {
  try {
    const claims = await verifyAccessToken(token);
    if (req.header("x-app-id") !== settings.dmsAppId) {
      next(new ForbiddenError("Unknown or missing x-app-id"));
      return;
    }

    const userId = claims.sub;
    const userName = claims.preferred_username || claims.email || claims.sub;
    const email = typeof claims.email === "string" ? claims.email.trim().toLowerCase() : "";
    const tenantId = String(
      req.header("x-tenant-id") || claims.tenant_id || claims.tid || claims.tenantId || ""
    ).trim();

    // Authoritative application roles (incl. platform_admin). The resolver
    // caches per user; on a cache miss it consults the User Management Service.
    const { roles: appRoles } = await container.roleResolver.resolveAppRoles(userId);
    const platform = isPlatformAdmin(appRoles);

    let roles = appRoles;
    // A tenant header is a selector, not proof of membership. Platform admins
    // can select any tenant; everyone else must have an active DMS membership,
    // and that membership is DMS's source of truth for the tenant-scoped role.
    if (tenantId && !platform) {
      let membership = await container.tenantMemberships.findByUserAndTenant(userId, tenantId);
      // Federated identity link: a partner user from another trusted issuer has
      // a different `sub`, so match them to their tenant membership by email.
      // Only enabled when FEDERATED_EMAIL_LINKING is on, and only against an
      // existing, admin-created membership — the caller cannot self-join.
      if (!membership && email && settings.keycloak.federatedEmailLinking) {
        membership = await container.tenantMemberships.findByEmailAndTenant(email, tenantId);
      }
      if (!membership || membership.status !== "active") {
        next(new ForbiddenError("You do not belong to this tenant"));
        return;
      }
      roles = [membership.role];
    }

    req.auth = {
      userId,
      userName,
      tenantId,
      roles: roles.length ? roles : ["member"],
      authSource: "keycloak",
    };
    next();
  } catch (error) {
    if (error instanceof AppError) next(error);
    else next(new UnauthorizedError("Invalid token"));
  }
}

function authenticateFromHeaders(req: Request, next: NextFunction, requireAppId = false): void {
  if (requireAppId && req.header("x-app-id") !== settings.dmsAppId) {
    next(new ForbiddenError("Unknown or missing x-app-id"));
    return;
  }
  const roles = normalizeRoles(String(req.header("x-roles") || "").split(","));
  req.auth = {
    userId: String(req.header("x-user-id") || "").trim(),
    userName: String(req.header("x-user-name") || "").trim() || String(req.header("x-user-id") || "").trim(),
    tenantId: String(req.header("x-tenant-id") || "").trim(),
    roles: roles.length ? roles : ["member"],
    authSource: "headers",
  };
  if (!req.auth.userId) {
    next(new UnauthorizedError("x-user-id header is required"));
    return;
  }
  // Platform administrators operate across tenants and may call tenant-independent
  // endpoints (such as listing tenants) without selecting a tenant first.
  if (!req.auth.tenantId && !isPlatformAdmin(req.auth.roles)) {
    next(new UnauthorizedError("x-tenant-id header is required"));
    return;
  }
  next();
}

function hasDevIdentityHeaders(req: Request): boolean {
  return Boolean(String(req.header("x-user-id") || "").trim());
}

function bearer(value?: string): string | undefined {
  if (!value) return undefined;
  return value.toLowerCase().startsWith("bearer ") ? value.slice(7).trim() : value.trim();
}
