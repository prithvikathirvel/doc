import { AuthContext } from "../service/models";
import {
  CreatedApiKey,
  ClaimResult,
  DirectoryMember,
  DmsApiKey,
  DmsUser,
  DmsUserAlias,
  MemberRole,
  SignupPayload,
  TenantMembership,
  TokenBundle,
} from "./models";

/** How a request authenticated. Ordered from most to least trustworthy. */
export type CredentialKind = "api-key" | "token" | "trusted-header" | "none";

export interface ResolvedCredential {
  kind: CredentialKind;
}

/**
 * Verifies access tokens. Production verifies Keycloak RS256 tokens against the
 * realm's published keys (JWKS, cached); development may verify HMAC tokens
 * minted with JWT_SECRET. It never merely decodes.
 */
export interface AccessTokenVerifier {
  verify(token: string): Promise<Record<string, unknown>>;
}

/** The central User Service (Keycloak) in production, a local stub in preview. */
export interface IdentityProvider {
  readonly name: string;
  login(email: string, password: string): Promise<TokenBundle & { user?: IdpUser }>;
  signup(payload: SignupPayload): Promise<void>;
  refresh(refreshToken: string): Promise<TokenBundle>;
  logout(refreshToken: string): Promise<void>;
}

export interface IdpUser {
  userId?: string;
  email?: string;
  username?: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
}

/**
 * DMS-owned identity directory: users, tenant memberships, identity aliases
 * and API keys. Passwords are never stored here.
 */
export interface DirectoryRepository {
  upsertUser(input: {
    userId: string;
    email: string;
    username?: string | null;
    displayName?: string | null;
    isPlatformAdmin?: boolean;
  }): Promise<DmsUser>;
  findUserByUserId(userId: string): Promise<DmsUser | null>;
  findUserByEmail(email: string): Promise<DmsUser | null>;
  setPlatformAdmin(userId: string, flag: boolean): Promise<void>;
  touchLastLogin(userId: string): Promise<void>;
  listPlatformAdmins(): Promise<DmsUser[]>;

  addAliases(userId: string, aliases: string[], tenantId?: string): Promise<void>;
  listAliases(userId: string): Promise<DmsUserAlias[]>;

  listMemberships(userId: string): Promise<TenantMembership[]>;
  findMembership(tenantId: string, userId: string): Promise<TenantMembership | null>;
  addMembership(input: {
    tenantId: string;
    userId: string;
    role: MemberRole;
    createdBy: string;
  }): Promise<TenantMembership>;
  updateMembership(
    tenantId: string,
    userId: string,
    patch: { role?: MemberRole; status?: "active" | "disabled" }
  ): Promise<TenantMembership | null>;
  removeMembership(tenantId: string, userId: string): Promise<boolean>;
  listMembers(tenantId: string): Promise<DirectoryMember[]>;

  createApiKey(input: {
    displayName: string;
    keyPrefix: string;
    keyHash: string;
    tenantId?: string | null;
    roles: string[];
    expiresAt?: Date | null;
    createdBy: string;
  }): Promise<DmsApiKey>;
  findApiKeyByHash(keyHash: string): Promise<DmsApiKey | null>;
  listApiKeys(): Promise<DmsApiKey[]>;
  updateApiKeyStatus(id: string, status: "active" | "disabled"): Promise<void>;
  deleteApiKey(id: string): Promise<boolean>;
  touchApiKey(id: string): Promise<void>;
}

/**
 * Re-points legacy activity (documents, folders, versions, grants recorded
 * under an x-user-id that predates a real account) to the canonical user id.
 */
export interface LegacyActivityClaimer {
  claim(tenantId: string, canonicalUserId: string, aliases: string[]): Promise<ClaimResult>;
}

export interface AuthRequestContext {
  /** Additional context resolved for authenticated requests. */
  auth?: AuthContext;
}
