import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { settings } from "../../config/settings";
import { UnauthorizedError } from "../../domain/exceptions";
import { AuthContext } from "../../domain/models";

declare global {
  namespace Express {
    interface Request {
      auth: AuthContext;
    }
  }
}

export function authMiddleware(req: Request, _res: Response, next: NextFunction): void {
  if (settings.authDisabled) {
    req.auth = {
      userId: String(req.header("x-user-id") || "dev-user"),
      userName: String(req.header("x-user-name") || "developer"),
      tenantId: String(req.header("x-tenant-id") || ""),
      roles: String(req.header("x-roles") || "tenant_admin").split(",").map((r) => r.trim()).filter(Boolean),
    };
    if (!req.auth.tenantId) {
      next(new UnauthorizedError("x-tenant-id header is required when AUTH_DISABLED=true"));
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
    const roles = extractRoles(decoded);
    if (!userId || !userName) {
      next(new UnauthorizedError("User identity not found in token"));
      return;
    }
    if (!tenantId) {
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
