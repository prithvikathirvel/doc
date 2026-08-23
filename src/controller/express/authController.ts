import { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "../../config/keycloak";
import { settings } from "../../config/settings";
import { container } from "../../config/container";
import { refreshKeycloakToken, logoutKeycloakSession } from "../../clients/keycloakClient";
import { UserManagementError } from "../../clients/userManagementClient";
import { BadRequestError, ForbiddenError, UnauthorizedError } from "../../utils/errors";
import { isPlatformAdmin, mapUserServiceRoles } from "../../utils/roles";
import { extractUserServiceRoleNames } from "../../utils/userServiceRoles";

export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const email = requiredString(req.body?.email, "Email is required");
    const password = requiredString(req.body?.password, "Password is required");
    let result;
    try {
      result = await container.userManagementClient.login(email, password);
    } catch (error) {
      throw mapLoginError(error);
    }

    let claims;
    try {
      claims = await verifyAccessToken(result.accessToken);
    } catch {
      // Do not hand a token to the browser unless the same verifier used by
      // protected DMS routes accepts it.
      throw new UnauthorizedError("The identity provider returned an invalid access token");
    }

    // Roles are authoritative from the User Service response + the token's own
    // role claims (the union covers both today's and any future claim-based
    // deployment). The resolver cache is warmed so the first protected call is
    // free, and every subsequent request re-derives the role the same way.
    const roles = mapUserServiceRoles([
      ...extractResponseRoles(result.raw),
      ...extractClaimRoles(claims),
    ]);
    // Persist the authoritative role (incl. platform_admin) so every subsequent
    // protected request can resolve it without depending on the token or the
    // User Service's authenticated endpoints.
    await container.roleResolver.prime(claims.sub, roles);

    const platform = isPlatformAdmin(roles);
    const memberships = platform
      ? []
      : await container.tenantMemberships.listByUser(claims.sub);
    const tenantRows = platform ? await container.tenantRepository.list() : await tenantsForMemberships(memberships);
    const tenants = tenantRows.map((tenant) => {
      const membership = memberships.find((item) => item.tenantId === tenant.id);
      return {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        status: tenant.status,
        role: membership?.role || (platform ? "platform_admin" : roles.includes("tenant_admin") ? "tenant_admin" : "member"),
      };
    });

    const effectiveRole = platform
      ? "platform_admin"
      : tenants.length === 1
        ? tenants[0].role
        : roles.includes("tenant_admin")
          ? "tenant_admin"
          : "member";
    const profileEmail = claims.email || result.user?.email || "";
    const claimDisplayName = [claims.given_name, claims.family_name].filter(Boolean).join(" ");
    const profileDisplayName = [result.user?.firstName, result.user?.lastName].filter(Boolean).join(" ");
    const displayName = claimDisplayName || profileDisplayName || claims.preferred_username || profileEmail;
    const now = Math.floor(Date.now() / 1000);

    res.json({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      idToken: result.idToken,
      expiresIn: result.expiresIn || (typeof claims.exp === "number" ? Math.max(0, claims.exp - now) : 300),
      refreshExpiresIn: result.refreshExpiresIn,
      user: {
        userId: claims.sub,
        email: profileEmail,
        displayName,
        username: claims.preferred_username,
        firstName: claims.given_name,
        lastName: claims.family_name,
      },
      role: effectiveRole,
      roles,
      tenants,
    });
  } catch (error) {
    next(error);
  }
}

export async function refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const refreshToken = requiredString(req.body?.refreshToken || req.body?.refresh_token, "Refresh token is required");
    let result;
    try {
      result = await refreshKeycloakToken(refreshToken);
    } catch (error) {
      if (error instanceof UserManagementError && [400, 401, 422].includes(error.status)) {
        throw new UnauthorizedError("Your session has expired. Sign in again.");
      }
      throw error;
    }
    try {
      const claims = await verifyAccessToken(result.accessToken);
      // Refreshed tokens are re-verified but not used to derive role changes:
      // roles are resolved server-side on the next protected request.
      const now = Math.floor(Date.now() / 1000);
      res.json({
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        idToken: result.idToken,
        expiresIn: result.expiresIn || (typeof claims.exp === "number" ? Math.max(0, claims.exp - now) : 300),
        refreshExpiresIn: result.refreshExpiresIn,
      });
    } catch {
      throw new UnauthorizedError("The identity provider returned an invalid access token");
    }
  } catch (error) {
    next(error);
  }
}

export async function logout(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const refreshToken = typeof req.body?.refreshToken === "string" ? req.body.refreshToken.trim() : "";
    const idToken = typeof req.body?.idToken === "string" ? req.body.idToken.trim() : undefined;
    if (req.auth?.userId) container.roleResolver.invalidate(req.auth.userId);
    if (refreshToken) await logoutKeycloakSession(refreshToken, idToken);
    res.status(204).send();
  } catch (error) {
    // A local logout should still succeed if Keycloak is temporarily unavailable.
    next(error);
  }
}

export async function signup(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!settings.allowPublicSignup) throw new ForbiddenError("Public sign-up is disabled");
    const email = requiredString(req.body?.email, "Email is required");
    const password = requiredString(req.body?.password, "Password is required");
    const username = requiredString(req.body?.username, "Username is required");
    const result = await container.userManagementClient.signup({
      email,
      password,
      username,
      firstName: optionalString(req.body?.firstName),
      lastName: optionalString(req.body?.lastName),
      phone: optionalString(req.body?.phone),
      gender: optionalString(req.body?.gender),
      address: optionalString(req.body?.address),
      additionalDetails:
        req.body?.additionalDetails && typeof req.body.additionalDetails === "object"
          ? req.body.additionalDetails
          : undefined,
    });
    res.status(201).json(result || { message: "Account created" });
  } catch (error) {
    if (error instanceof UserManagementError && [400, 409, 422].includes(error.status)) {
      next(new BadRequestError("The account could not be created. Check the supplied details."));
      return;
    }
    next(error);
  }
}

function extractClaimRoles(claims: Record<string, unknown>): string[] {
  const realm = claims.realm_access as { roles?: unknown } | undefined;
  const resourceAccess = claims.resource_access as Record<string, { roles?: unknown }> | undefined;
  const clientRoles = resourceAccess?.[settings.dmsAppClientId]?.roles;
  const values = [claims.roles, claims.role, realm?.roles, clientRoles].flatMap((value) => {
    if (Array.isArray(value)) return value.map(String);
    return typeof value === "string" ? value.split(",").map((role) => role.trim()) : [];
  });
  return values;
}

/**
 * Pulls role display names out of the raw User Service login payload using the
 * shared extractor, so the same code path that understands
 * `data.user.role.roleName` is used by login, the resolver and the tests.
 */
function extractResponseRoles(raw: unknown): string[] {
  return extractUserServiceRoleNames(raw);
}

async function tenantsForMemberships(memberships: Array<{ tenantId: string }>) {
  const tenants = await Promise.all(memberships.map((membership) => container.tenantRepository.findById(membership.tenantId)));
  return tenants.filter((tenant): tenant is NonNullable<typeof tenant> => Boolean(tenant));
}

function requiredString(value: unknown, message: string): string {
  if (typeof value !== "string" || !value.trim()) throw new BadRequestError(message);
  return value.trim();
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function mapLoginError(error: unknown): Error {
  if (
    error instanceof UserManagementError &&
    [400, 401, 403, 404, 422].includes(error.status)
  ) {
    return new UnauthorizedError("Invalid email or password");
  }
  return error instanceof Error ? error : new UnauthorizedError("Sign in failed");
}
