import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { settings } from "../config/settings";
import { UnauthorizedError } from "../utils/errors";
import { AuthContext } from "../service/models";
import { isPlatformAdmin, normalizeRoles } from "../utils/roles";

declare global {
  namespace Express {
    interface Request {
      auth: AuthContext;
    }
  }
}

export function authMiddleware(req: Request, _res: Response, next: NextFunction): void {
  if (settings.authDisabled) {
    const roles = normalizeRoles(String(req.header("x-roles") || "").split(","));
    req.auth = {
      userId: String(req.header("x-user-id") || "").trim(),
      userName: String(req.header("x-user-name") || "").trim() || String(req.header("x-user-id") || "").trim(),
      tenantId: String(req.header("x-tenant-id") || "").trim(),
      roles: roles.length ? roles : ["member"],
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
    return;
  }

  const token = req.header("idtoken") || bearer(req.header("authorization"));
  if (!token) {
    next(new UnauthorizedError("Token not provided"));
    return;
  }

  try {
    const decoded = decodeToken(token) as Record<string, unknown>;
    const userName = String(decoded.preferred_username || decoded.name || decoded.email || "");
    const userId = String(decoded.sub || decoded.user_id || "");
    const tenantId = String(
      req.header("x-tenant-id") || decoded.tenant_id || decoded.tid || decoded.tenantId || ""
    );
    const roles = normalizeRoles(extractRoles(decoded));
    if (!userId || !userName) {
      next(new UnauthorizedError("User identity not found in token"));
      return;
    }
    if (!tenantId && !isPlatformAdmin(roles)) {
      next(new UnauthorizedError("Tenant id not found in token or x-tenant-id header"));
      return;
    }
    req.auth = { userId, userName, tenantId, roles };
    next();
  } catch {
    next(new UnauthorizedError("Invalid token"));
  }
}

function bearer(value?: string): string | undefined {
  if (!value) return undefined;
  return value.toLowerCase().startsWith("bearer ") ? value.slice(7) : value;
}

function decodeToken(token: string): jwt.JwtPayload | string {
  if (settings.jwtSecret) {
    return jwt.verify(token, settings.jwtSecret);
  }
  const decoded = jwt.decode(token);
  if (!decoded) {
    throw new Error("invalid");
  }
  return decoded;
}

function extractRoles(decoded: Record<string, unknown>): string[] {
  const realm = decoded.realm_access as { roles?: string[] } | undefined;
  const raw = decoded.roles || decoded.role || realm?.roles || [];
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === "string") return raw.split(",").map((r) => r.trim()).filter(Boolean);
  return [];
}
