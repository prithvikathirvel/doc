import { Request } from "express";
import { settings } from "../config/settings";
import { UnauthorizedError, ForbiddenError } from "../utils/errors";
import { isPlatformAdmin, normalizeRoles } from "../utils/roles";
import { AuthContext } from "../service/models";
import { readCookie } from "./cookies";
import { ACCESS_COOKIE, hashKey } from "./authService";
import { AccessTokenVerifier, DirectoryRepository } from "./ports";

let warnedAboutTrustedHeaders = false;

/**
 * Resolves who is calling a DMS API request. Strategies, most trustworthy
 * first; the first one that applies wins:
 *
 * 1. `x-api-key`            — machine client, DB-backed key with its own tenant + roles
 * 2. session cookie / token — UI user or token-authenticated client; Keycloak-verified,
 *                            roles resolved from the local directory
 * 3. trusted headers        — legacy internal mode (AUTH_DISABLED=true): x-user-id,
 *                            x-tenant-id, x-roles, exactly as before
 *
 * Strategy 3 exists for backward compatibility with existing API clients and
 * must sit behind a gateway or on a trusted network: headers are asserted, not
 * proven. It can be removed once clients migrate to API keys.
 */
export class AuthResolver {
  constructor(
    private readonly verifier: AccessTokenVerifier | null,
    private readonly directory: DirectoryRepository
  ) {}

  async resolve(req: Request): Promise<AuthContext> {
    const apiKey = req.header("x-api-key");
    if (apiKey) return this.resolveApiKey(apiKey, req);

    const cookieToken = readCookie(req, ACCESS_COOKIE);
    const headerToken = req.header("idtoken") || bearer(req.header("authorization"));
    if (cookieToken || headerToken) {
      return this.resolveToken(String(cookieToken || headerToken), req, Boolean(cookieToken));
    }

    if (settings.authDisabled) return this.resolveTrustedHeaders(req);

    throw new UnauthorizedError("Authentication required").withCode("AUTH_REQUIRED");
  }

  private async resolveApiKey(key: string, req: Request): Promise<AuthContext> {
    const record = await this.directory.findApiKeyByHash(hashKey(key.trim()));
    if (!record) {
      throw new UnauthorizedError("Unknown API key").withCode("BAD_API_KEY");
    }
    if (record.status !== "active") {
      throw new UnauthorizedError("This API key has been disabled").withCode("BAD_API_KEY");
    }
    if (record.expiresAt && record.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedError("This API key has expired").withCode("BAD_API_KEY");
    }
    void this.directory.touchApiKey(record.id).catch(() => undefined);

    const roles = normalizeRoles(record.roles);
    const requestedTenant = String(req.header("x-tenant-id") || "").trim();
    if (record.tenantId && requestedTenant && requestedTenant !== record.tenantId) {
      throw new ForbiddenError("This API key is scoped to a different workspace");
    }
    const tenantId = requestedTenant || record.tenantId || "";
    if (!tenantId && !isPlatformAdmin(roles)) {
      throw new UnauthorizedError("x-tenant-id header is required for this API key");
    }

    // On-behalf-of attribution: an integration holding the key may pass its own
    // end user's identifier as x-user-id (and display name as x-user-name).
    // The KEY remains the authenticated principal — roles and workspace scope
    // still come from the key, never from these headers — but activity is
    // recorded under the end user's id, so "user-wise separation" works for
    // application users that do not (yet) have a DMS account. When such a user
    // later signs up and is attached to the workspace, their documents are
    // claimed automatically via the alias mechanism.
    const onBehalfOf = String(req.header("x-user-id") || "").trim();
    if (onBehalfOf) {
      return {
        userId: onBehalfOf,
        userName: String(req.header("x-user-name") || "").trim() || onBehalfOf,
        tenantId,
        roles: roles.length ? roles : ["member"],
        scheme: "api_key",
      };
    }

    return {
      userId: `api-key:${record.keyPrefix}`,
      userName: record.displayName,
      tenantId,
      roles: roles.length ? roles : ["member"],
      scheme: "api_key",
    };
  }

  private async resolveToken(
    token: string,
    req: Request,
    fromCookie: boolean
  ): Promise<AuthContext> {
    if (!this.verifier) {
      throw new UnauthorizedError(
        "Token authentication is not configured on this deployment (set KEYCLOAK_BASE_URL)"
      ).withCode("AUTH_NOT_CONFIGURED");
    }
    let payload: Record<string, unknown>;
    try {
      payload = await this.verifier.verify(token);
    } catch (error) {
      const message = (error as Error).message || "";
      if (message.includes("jwt expired")) {
        throw new UnauthorizedError("Access token expired").withCode("TOKEN_EXPIRED");
      }
      throw new UnauthorizedError("Invalid access token").withCode("TOKEN_INVALID");
    }

    const sub = String(payload.sub || "").trim();
    if (!sub) throw new UnauthorizedError("User identity not found in token").withCode("TOKEN_INVALID");

    let user =
      (await this.directory.findUserByUserId(sub)) ||
      (typeof payload.email === "string"
        ? await this.directory.findUserByEmail(payload.email.toLowerCase())
        : null);
    if (!user) {
      throw new UnauthorizedError("This account has not been provisioned in DMS yet").withCode(
        "ACCOUNT_NOT_PROVISIONED"
      );
    }
    if (user.status === "disabled") {
      throw new ForbiddenError("This account has been disabled").withCode("ACCOUNT_DISABLED");
    }

    const memberships = (await this.directory.listMemberships(user.userId)).filter(
      (membership) => membership.status === "active" && membership.tenantStatus === "active"
    );
    const platformAdmin = user.isPlatformAdmin || settings.auth.platformAdminEmails.includes(user.email);

    const requestedTenant = String(req.header("x-tenant-id") || "").trim();
    let tenantId = "";
    let roles: string[];

    if (platformAdmin) {
      roles = ["platform_admin"];
      tenantId = requestedTenant;
    } else if (requestedTenant) {
      const membership = memberships.find((entry) => entry.tenantId === requestedTenant);
      if (!membership) {
        throw new ForbiddenError("You do not have access to this workspace").withCode(
          "TENANT_FORBIDDEN"
        );
      }
      roles = [membership.role];
      tenantId = membership.tenantId;
    } else if (memberships.length === 1) {
      roles = [memberships[0].role];
      tenantId = memberships[0].tenantId;
    } else {
      throw new UnauthorizedError("Select a workspace before continuing").withCode("TENANT_REQUIRED");
    }

    return {
      userId: user.userId,
      userName: user.displayName || user.email,
      tenantId,
      roles,
      scheme: fromCookie ? "ui_session" : "user_token",
      email: user.email,
    };
  }

  private resolveTrustedHeaders(req: Request): AuthContext {
    if (!warnedAboutTrustedHeaders) {
      warnedAboutTrustedHeaders = true;
      // eslint-disable-next-line no-console
      console.warn(
        "[dms] AUTH_DISABLED=true: trusting x-user-id/x-tenant-id/x-roles headers. " +
          "Use only on a trusted network or behind an authenticating gateway; migrate API clients to x-api-key."
      );
    }
    const roles = normalizeRoles(String(req.header("x-roles") || "").split(","));
    const auth: AuthContext = {
      userId: String(req.header("x-user-id") || "").trim(),
      userName: String(req.header("x-user-name") || "").trim() || String(req.header("x-user-id") || "").trim(),
      tenantId: String(req.header("x-tenant-id") || "").trim(),
      roles: roles.length ? roles : ["member"],
      scheme: "trusted_header",
    };
    if (!auth.userId) {
      throw new UnauthorizedError("x-user-id header is required");
    }
    if (!auth.tenantId && !isPlatformAdmin(auth.roles)) {
      throw new UnauthorizedError("x-tenant-id header is required");
    }
    return auth;
  }
}

function bearer(value?: string): string | undefined {
  if (!value) return undefined;
  return value.toLowerCase().startsWith("bearer ") ? value.slice(7) : value;
}
