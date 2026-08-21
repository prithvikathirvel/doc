import { NextFunction, Request, Response } from "express";
import { settings } from "../config/settings";
import { verifyAccessToken, KeycloakClaims } from "../config/keycloak";
import { AppError, ForbiddenError, UnauthorizedError } from "../utils/errors";
import { AuthContext } from "../service/models";
import { isPlatformAdmin, mapUserServiceRoles, normalizeRoles } from "../utils/roles";
import { MysqlTenantMembershipRepository } from "../dao/mysql/MysqlTenantMembershipRepository";
import { cachedTokenRoles } from "../config/tokenRoleCache";

declare global {
  namespace Express {
    interface Request {
      auth: AuthContext;
    }
  }
}

const memberships = new MysqlTenantMembershipRepository();

/**
 * Authentication has two intentionally explicit modes:
 *
 * - headers: local/dev compatibility only;
 * - keycloak: a signed RS256 Keycloak access token and the DMS app id are
 *   required. No client-supplied identity headers are read in this mode unless
 *   AUTH_ALLOW_DEV_HEADERS is deliberately enabled for a migration.
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
    const appId = req.header("x-app-id");
    if (appId !== settings.dmsAppId) {
      next(new ForbiddenError("Unknown or missing x-app-id"));
      return;
    }

    const roles = cachedTokenRoles(token) || mapUserServiceRoles(extractRoles(claims));
    const userId = claims.sub;
    const userName = claims.preferred_username || claims.email || claims.sub;
    const tenantId = String(
      req.header("x-tenant-id") || claims.tenant_id || claims.tid || claims.tenantId || ""
    ).trim();
    req.auth = {
      userId,
      userName,
      tenantId,
      roles: roles.length ? roles : ["member"],
      authSource: "keycloak",
    };

    // A tenant header is a selector, not proof of membership. Platform admins
    // can select any tenant; everyone else must have an active DMS membership.
    if (tenantId && !isPlatformAdmin(req.auth.roles)) {
      const membership = await memberships.findByUserAndTenant(userId, tenantId);
      if (!membership || membership.status !== "active") {
        next(new ForbiddenError("You do not belong to this tenant"));
        return;
      }
      // Tenant membership is DMS's source of truth for the tenant-scoped role.
      req.auth.roles = [membership.role];
    }

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
    // Keep the old header-mode behavior exactly as it was. Keycloak users are
    // allowed to reach /tenants/mine without a selected tenant instead.
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

function extractRoles(decoded: KeycloakClaims): string[] {
  const realm = decoded.realm_access;
  const resourceAccess = decoded.resource_access as
    | Record<string, { roles?: unknown }>
    | undefined;
  const clientRoles = resourceAccess?.[settings.dmsAppClientId]?.roles;
  const raw = [decoded.roles, decoded.role, realm?.roles, clientRoles].flatMap((value) => {
    if (Array.isArray(value)) return value.map(String);
    if (typeof value === "string") return value.split(",").map((role) => role.trim()).filter(Boolean);
    return [];
  });
  return raw;
}
