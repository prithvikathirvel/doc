import { v4 as uuidv4 } from "uuid";
import { settings } from "../config/settings";
import {
  AppError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "../utils/errors";
import { isPlatformAdmin, isTenantAdmin } from "../utils/roles";
import { AuthContext } from "../service/models";
import { AccessTokenVerifier, DirectoryRepository, IdentityProvider, LegacyActivityClaimer } from "./ports";
import {
  AuthSession,
  ClaimResult,
  CreatedApiKey,
  DmsUser,
  DirectoryMember,
  MemberRole,
  SignupPayload,
  TenantMembership,
  TokenBundle,
} from "./models";
import crypto from "crypto";

export const ACCESS_COOKIE = "dms_at";
export const REFRESH_COOKIE = "dms_rt";
/** Custom header required on mutating cookie-authenticated requests (CSRF defence). */
export const CLIENT_HEADER = "x-dms-client";

export interface LoginResult {
  session: AuthSession;
  tokens: TokenBundle;
}

/**
 * Authentication and DMS-local authorization use cases.
 *
 * The identity provider (User Service / Keycloak) decides who the user is;
 * this service decides what they may do inside DMS, entirely from the local
 * directory tables.
 */
export class AuthService {
  constructor(
    private readonly directory: DirectoryRepository,
    private readonly idp: IdentityProvider | null,
    private readonly verifier: AccessTokenVerifier | null,
    private readonly claimer: LegacyActivityClaimer
  ) {}

  /** True when login/signup/session endpoints can serve requests. */
  get configured(): boolean {
    return Boolean(this.idp && this.verifier);
  }

  get providerName(): string {
    return this.idp ? this.idp.name : "none";
  }

  private requireProvider(): { idp: IdentityProvider; verifier: AccessTokenVerifier } {
    if (!this.idp || !this.verifier) {
      throw new UnauthorizedError(
        "Authentication is not configured on this deployment. Set USER_MGT_BASE_URL and KEYCLOAK_BASE_URL."
      ).withCode("AUTH_NOT_CONFIGURED");
    }
    return { idp: this.idp, verifier: this.verifier };
  }

  private idpUserFromToken(payload: Record<string, unknown>, fallback?: { email?: string; username?: string; displayName?: string }) {
    const sub = String(payload.sub || "").trim();
    if (!sub) throw new UnauthorizedError("Token has no subject");
    const email = String(payload.email || fallback?.email || "").trim().toLowerCase();
    const username = String(payload.preferred_username || fallback?.username || "").trim() || null;
    const displayName =
      String(payload.name || fallback?.displayName || username || email || sub).trim();
    return { sub, email, username, displayName };
  }

  /** Exchange credentials for a session. Tokens are returned for cookie storage only. */
  async login(email: string, password: string): Promise<LoginResult> {
    const { idp } = this.requireProvider();
    const normalizedEmail = (email || "").trim().toLowerCase();
    const result = await idp.login(normalizedEmail, password).catch(mapIdpError);

    // Defence in depth: the token is verified before a session is issued, even
    // though it arrived over a server-to-server call.
    const payload = await this.verify(result.accessToken);
    const identity = this.idpUserFromToken(payload, result.user);

    const user = await this.upsertUserFromIdentity(identity);
    await this.directory.touchLastLogin(user.userId);
    return {
      session: await this.buildSession({ ...user, isPlatformAdmin: user.isPlatformAdmin }),
      tokens: {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        idToken: result.idToken,
        expiresIn: result.expiresIn,
      },
    };
  }

  async signup(payload: SignupPayload): Promise<void> {
    const { idp } = this.requireProvider();
    const email = (payload.email || "").trim().toLowerCase();
    if (!email) throw new ValidationError("Email is required");
    if (!payload.password || payload.password.length < 8) {
      throw new ValidationError("Password must be at least 8 characters");
    }
    await idp.signup({ ...payload, email, username: payload.username || email.split("@")[0] }).catch((error) => {
      const message = (error as Error).message || "";
      if (/already\s+(registered|exists)|duplicate/i.test(message)) {
        throw new ConflictError(
          "An account with this email already exists. Sign in with your password instead — or ask your administrator to add you to a workspace."
        ).withCode("EMAIL_TAKEN");
      }
      mapIdpError(error);
    });
  }

  async verify(accessToken: string): Promise<Record<string, unknown>> {
    const { verifier } = this.requireProvider();
    try {
      return await verifier.verify(accessToken);
    } catch (error) {
      const message = (error as Error).message || "Invalid token";
      const expired = message.includes("jwt expired");
      throw new UnauthorizedError(expired ? "Access token expired" : "Invalid access token")
        .withCode(expired ? "TOKEN_EXPIRED" : "TOKEN_INVALID");
    }
  }

  async sessionFromToken(accessToken: string): Promise<{ session: AuthSession; user: DmsUser }> {
    const payload = await this.verify(accessToken);
    const sub = String(payload.sub || "").trim();
    if (!sub) throw new UnauthorizedError("Token has no subject");
    let user = await this.directory.findUserByUserId(sub);
    if (!user && payload.email) {
      user = await this.directory.findUserByEmail(String(payload.email).toLowerCase());
    }
    if (!user) {
      throw new UnauthorizedError("This account has not been provisioned in DMS yet").withCode(
        "ACCOUNT_NOT_PROVISIONED"
      );
    }
    if (user.status === "disabled") {
      throw new ForbiddenError("This account has been disabled");
    }
    return { session: await this.buildSession(user), user };
  }

  async refresh(refreshToken: string): Promise<LoginResult> {
    const { idp } = this.requireProvider();
    if (!refreshToken) throw new UnauthorizedError("Session expired").withCode("TOKEN_EXPIRED");
    const tokens = await idp.refresh(refreshToken).catch(mapIdpError);
    const payload = await this.verify(tokens.accessToken);
    const identity = this.idpUserFromToken(payload);
    let user = await this.directory.findUserByUserId(identity.sub);
    if (!user) {
      user = await this.upsertUserFromIdentity(identity);
    }
    return { session: await this.buildSession(user), tokens };
  }

  async logout(refreshToken?: string): Promise<void> {
    if (refreshToken && this.idp) await this.idp.logout(refreshToken);
  }

  async buildSession(user: DmsUser): Promise<AuthSession> {
    const memberships = await this.directory.listMemberships(user.userId);
    return {
      user: {
        userId: user.userId,
        email: user.email,
        displayName: user.displayName,
        username: user.username,
      },
      isPlatformAdmin: user.isPlatformAdmin,
      memberships: memberships
        .filter((membership) => membership.status === "active" && membership.tenantStatus === "active")
        .map((membership) => ({
          tenantId: membership.tenantId,
          name: membership.tenantName,
          slug: membership.tenantSlug,
          status: membership.tenantStatus,
          role: membership.role,
        })),
    };
  }

  private async upsertUserFromIdentity(identity: {
    sub: string;
    email: string;
    username: string | null;
    displayName: string;
  }): Promise<DmsUser> {
    const bootstrapAdmin = settings.auth.platformAdminEmails.includes(identity.email);
    const user = await this.directory.upsertUser({
      userId: identity.sub,
      email: identity.email || `unknown-${identity.sub}@dms.invalid`,
      username: identity.username,
      displayName: identity.displayName,
      isPlatformAdmin: bootstrapAdmin || undefined,
    });
    if (bootstrapAdmin && !user.isPlatformAdmin) {
      await this.directory.setPlatformAdmin(user.userId, true);
      user.isPlatformAdmin = true;
    }
    // The canonical id, email and username are all valid aliases so legacy
    // activity recorded under any of them can be claimed later.
    await this.directory.addAliases(
      user.userId,
      [user.userId, user.email, user.username || ""].filter(Boolean)
    );
    return user;
  }

  /* ── Members ─────────────────────────────────────────────────────── */

  async listMembers(auth: AuthContext, tenantId: string): Promise<DirectoryMember[]> {
    await this.assertTenantManager(auth, tenantId);
    return this.directory.listMembers(tenantId);
  }

  /**
   * Attaches an existing DMS account to a tenant. Any documents uploaded
   * earlier by a machine client under one of the user's aliases (email,
   * username, legacy x-user-id) are re-pointed to the canonical user id, so
   * the member sees them immediately.
   */
  async addMember(
    auth: AuthContext,
    tenantId: string,
    input: { email?: string; userId?: string; role?: MemberRole; claimAliases?: string[] }
  ): Promise<{ member: DirectoryMember; claimed: ClaimResult }> {
    await this.assertTenantManager(auth, tenantId);
    const role: MemberRole = input.role === "tenant_admin" ? "tenant_admin" : "member";

    const user =
      (input.userId && (await this.directory.findUserByUserId(input.userId.trim()))) ||
      (input.email && (await this.directory.findUserByEmail(input.email.trim().toLowerCase())));
    if (!user) {
      throw new NotFoundError(
        "No DMS account matches that email yet. Ask the user to sign up first, or create the account below."
      );
    }
    if (await this.directory.findMembership(tenantId, user.userId)) {
      throw new ConflictError("This user is already a member of the workspace");
    }

    const member = await this.directory.addMembership({
      tenantId,
      userId: user.userId,
      role,
      createdBy: auth.userId,
    });

    const extraAliases = normalizeAliases(input.claimAliases || []);
    if (extraAliases.length) {
      await this.directory.addAliases(user.userId, extraAliases, tenantId);
    }
    const claimed = await this.claimFor(tenantId, user);
    return {
      member: { user, membership: member },
      claimed,
    };
  }

  /**
   * A workspace member must never be able to edit their own membership — not
   * the role, not the status, not removal. That path is how an administrator
   * accidentally (or deliberately, via a compromised browser) reshapes their
   * own access. Machine schemes (api_key / trusted_header) are not tied to a
   * person, so the guard applies to browser sessions only.
   */
  private assertNotSelf(auth: AuthContext, userId: string, action: string): void {
    const isPerson = auth.scheme === "ui_session" || auth.scheme === "user_token";
    if (isPerson && auth.userId === userId) {
      throw new ForbiddenError(
        `You cannot ${action} your own membership. Ask another administrator — or a platform administrator — to do it.`
      );
    }
  }

  /**
   * Demoting, suspending or removing the last active administrator would lock
   * everybody out of managing the workspace. Platform administrators bypass
   * this (they can always reach any workspace and repair it).
   */
  private async assertNotLastActiveAdmin(
    auth: AuthContext,
    tenantId: string,
    userId: string,
    patch?: { role?: MemberRole; status?: "active" | "disabled" }
  ): Promise<void> {
    if (isPlatformAdmin(auth.roles)) return;
    const members = await this.directory.listMembers(tenantId);
    const target = members.find((entry) => entry.user.userId === userId);
    if (!target) return; // handled as NOT_FOUND by the caller
    const isActiveAdmin =
      target.membership.role === "tenant_admin" && target.membership.status === "active";
    if (!isActiveAdmin) return;
    const removesAdminRights = patch
      ? patch.role === "member" || patch.status === "disabled"
      : true; // no patch = removal
    if (!removesAdminRights) return;
    const activeAdmins = members.filter(
      (entry) => entry.membership.role === "tenant_admin" && entry.membership.status === "active"
    );
    if (activeAdmins.length <= 1) {
      throw new ConflictError(
        "This workspace must keep at least one active administrator. " +
          "Promote another member first, or ask a platform administrator."
      );
    }
  }

  async updateMember(
    auth: AuthContext,
    tenantId: string,
    userId: string,
    patch: { role?: MemberRole; status?: "active" | "disabled" }
  ): Promise<TenantMembership> {
    await this.assertTenantManager(auth, tenantId);
    this.assertNotSelf(auth, userId, "change the role or status of");
    await this.assertNotLastActiveAdmin(auth, tenantId, userId, patch);
    const updated = await this.directory.updateMembership(tenantId, userId, patch);
    if (!updated) throw new NotFoundError("Membership not found");
    return updated;
  }

  async removeMember(auth: AuthContext, tenantId: string, userId: string): Promise<void> {
    await this.assertTenantManager(auth, tenantId);
    this.assertNotSelf(auth, userId, "remove");
    await this.assertNotLastActiveAdmin(auth, tenantId, userId);
    const removed = await this.directory.removeMembership(tenantId, userId);
    if (!removed) throw new NotFoundError("Membership not found");
  }

  /**
   * Creates the account in the identity provider and links it in DMS. The
   * User Service does not return the user id on signup, so the account is
   * linked by performing one immediate login (credentials are in hand).
   */
  async createUser(
    auth: AuthContext,
    input: SignupPayload & { tenantId?: string; role?: MemberRole; claimAliases?: string[] }
  ): Promise<{ member: DirectoryMember | null; claimed: ClaimResult | null; email: string }> {
    const tenantId = input.tenantId?.trim() || "";
    if (tenantId) {
      await this.assertTenantManager(auth, tenantId);
    } else if (!isPlatformAdmin(auth.roles)) {
      throw new ForbiddenError("Only a platform administrator can create accounts without a workspace");
    }
    const email = input.email.trim().toLowerCase();
    if (await this.directory.findUserByEmail(email)) {
      throw new ConflictError("An account with this email already exists in DMS");
    }
    await this.signup({ ...input, email });

    let user: DmsUser | null = null;
    try {
      const login = await this.requireProvider().idp.login(email, input.password);
      const payload = await this.verify(login.accessToken);
      const identity = this.idpUserFromToken(payload, login.user);
      user = await this.upsertUserFromIdentity(identity);
      await this.directory.touchLastLogin(user.userId);
    } catch (error) {
      throw new ValidationError(
        "The account was created in the identity provider, but it could not be linked to DMS yet. " +
          "Ask the user to sign in once, then add them to the workspace by email."
      );
    }
    if (!user) {
      throw new ValidationError("The account could not be linked to DMS. Contact your administrator.");
    }

    if (!tenantId) return { member: null, claimed: null, email };
    if (await this.directory.findMembership(tenantId, user.userId)) {
      throw new ConflictError("This user is already a member of the workspace");
    }
    const membership = await this.directory.addMembership({
      tenantId,
      userId: user.userId,
      role: input.role === "tenant_admin" ? "tenant_admin" : "member",
      createdBy: auth.userId,
    });
    const extraAliases = normalizeAliases(input.claimAliases || []);
    if (extraAliases.length) {
      await this.directory.addAliases(user.userId, extraAliases, tenantId);
    }
    const claimed = await this.claimFor(tenantId, user);
    return { member: { user, membership }, claimed, email };
  }

  /** Claims every alias of the user (global + this tenant) inside one tenant. */
  private async claimFor(tenantId: string, user: DmsUser): Promise<ClaimResult> {
    const aliases = (await this.directory.listAliases(user.userId))
      .map((entry) => entry.alias)
      .filter((alias) => alias && alias !== user.userId);
    if (!aliases.length) {
      return { documents: 0, versions: 0, folders: 0, permissions: 0 };
    }
    return this.claimer.claim(tenantId, user.userId, aliases);
  }

  /**
   * A caller may manage a workspace when they are a platform administrator, an
   * active tenant administrator of it (UI session), or a tenant-scoped API key
   * carrying the tenant_admin role.
   */
  private async assertTenantManager(auth: AuthContext, tenantId: string): Promise<void> {
    if (isPlatformAdmin(auth.roles)) return;
    if (isTenantAdmin(auth.roles)) {
      if (auth.scheme === "api_key") {
        if (auth.tenantId === tenantId) return;
        throw new ForbiddenError("This API key is not scoped to that workspace");
      }
      const membership = await this.directory.findMembership(tenantId, auth.userId);
      if (membership && membership.status === "active" && membership.role === "tenant_admin") {
        return;
      }
    }
    throw new ForbiddenError("Workspace administrator role required");
  }

  /* ── API keys ────────────────────────────────────────────────────── */

  async createApiKey(
    auth: AuthContext,
    input: { displayName: string; tenantId?: string | null; roles?: string[]; expiresAt?: string | null }
  ): Promise<CreatedApiKey> {
    if (!isPlatformAdmin(auth.roles)) {
      throw new ForbiddenError("Only a platform administrator can manage API keys");
    }
    const name = (input.displayName || "").trim();
    if (!name) throw new ValidationError("A display name is required");
    const roles = (input.roles && input.roles.length ? input.roles : ["member"])
      .map((role) => role.trim().toLowerCase())
      .filter(Boolean);
    for (const role of roles) {
      if (!["platform_admin", "tenant_admin", "member"].includes(role)) {
        throw new ValidationError(`Unknown role "${role}"`);
      }
    }
    if (input.tenantId && roles.includes("platform_admin")) {
      throw new ValidationError("A workspace-scoped key cannot carry the platform_admin role");
    }
    let expiresAt: Date | null = null;
    if (input.expiresAt) {
      expiresAt = new Date(input.expiresAt);
      if (Number.isNaN(expiresAt.getTime())) throw new ValidationError("expiresAt is not a valid date");
    }

    const secret = crypto.randomBytes(24).toString("base64url");
    const prefix = crypto.randomBytes(4).toString("hex");
    const fullKey = `dms_${prefix}.${secret}`;
    const apiKey = await this.directory.createApiKey({
      displayName: name,
      keyPrefix: prefix,
      keyHash: hashKey(fullKey),
      tenantId: input.tenantId || null,
      roles,
      expiresAt,
      createdBy: auth.userId,
    });
    return {
      apiKey: {
        id: apiKey.id,
        displayName: apiKey.displayName,
        keyPrefix: apiKey.keyPrefix,
        tenantId: apiKey.tenantId,
        roles: apiKey.roles,
        status: apiKey.status,
        expiresAt: apiKey.expiresAt,
        lastUsedAt: apiKey.lastUsedAt,
        createdBy: apiKey.createdBy,
        createdAt: apiKey.createdAt,
      },
      key: fullKey,
    };
  }

  async listApiKeys(auth: AuthContext) {
    if (!isPlatformAdmin(auth.roles)) {
      throw new ForbiddenError("Only a platform administrator can manage API keys");
    }
    const keys = await this.directory.listApiKeys();
    return keys.map(({ keyHash, ...rest }) => rest);
  }

  async updateApiKey(auth: AuthContext, id: string, status: "active" | "disabled") {
    if (!isPlatformAdmin(auth.roles)) {
      throw new ForbiddenError("Only a platform administrator can manage API keys");
    }
    await this.directory.updateApiKeyStatus(id, status);
  }

  async deleteApiKey(auth: AuthContext, id: string) {
    if (!isPlatformAdmin(auth.roles)) {
      throw new ForbiddenError("Only a platform administrator can manage API keys");
    }
    const deleted = await this.directory.deleteApiKey(id);
    if (!deleted) throw new NotFoundError("API key not found");
  }

  async listPlatformAdmins(auth: AuthContext): Promise<DmsUser[]> {
    if (!isPlatformAdmin(auth.roles)) {
      throw new ForbiddenError("Only a platform administrator can list platform administrators");
    }
    return this.directory.listPlatformAdmins();
  }
}

export function hashKey(key: string): string {
  return crypto.createHash("sha256").update(key, "utf8").digest("hex");
}

function normalizeAliases(values: string[]): string[] {
  const seen = new Set<string>();
  for (const value of values) {
    const alias = String(value || "").trim().toLowerCase();
    if (alias) seen.add(alias);
  }
  return [...seen];
}

function mapIdpError(error: unknown): never {
  const err = error as Error & { statusCode?: number };
  if (err.statusCode === 401) {
    throw new UnauthorizedError(err.message || "Invalid email or password").withCode("BAD_CREDENTIALS");
  }
  if (err.statusCode && err.statusCode >= 400 && err.statusCode < 500) {
    throw new ValidationError(err.message || "The identity provider rejected the request");
  }
  // Timeouts, connection failures and provider 5xx are not the client's fault:
  // report them as upstream failures instead of a generic internal error.
  throw new AppError(
    502,
    `The identity provider is unavailable (${err.message || "unknown error"})`,
    "IDP_UNAVAILABLE"
  );
}
