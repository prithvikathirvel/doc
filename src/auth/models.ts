/**
 * Identity and authorization models for the DMS-owned directory.
 *
 * Authentication itself happens in Keycloak (through the central User
 * Service). Everything in this module is DMS-local authorization state:
 * who exists, which tenant they belong to, which role they hold there,
 * and which API keys machine clients use.
 */

export type MemberRole = "tenant_admin" | "member";
export type DirectoryStatus = "active" | "disabled";
export type AuthScheme = "ui_session" | "user_token" | "api_key" | "trusted_header";

export interface DmsUser {
  /** Canonical id: the User Service / Keycloak user id (JWT `sub`). */
  userId: string;
  email: string;
  username: string | null;
  displayName: string;
  isPlatformAdmin: boolean;
  status: DirectoryStatus;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TenantMembership {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  tenantStatus: "active" | "suspended";
  userId: string;
  role: MemberRole;
  status: DirectoryStatus;
  createdAt: Date;
}

export interface DirectoryMember {
  user: DmsUser;
  membership: TenantMembership;
}

export interface DmsUserAlias {
  alias: string;
  /** '' marks a global alias (email, username, canonical id); otherwise tenant-scoped. */
  tenantId: string;
}

export interface DmsApiKey {
  id: string;
  displayName: string;
  keyPrefix: string;
  /** SHA-256 hex of the full key. The full key is never stored. */
  keyHash: string;
  tenantId: string | null;
  roles: string[];
  status: DirectoryStatus;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  createdBy: string;
  createdAt: Date;
}

/** A freshly created API key together with the only copy of the secret. */
export interface CreatedApiKey {
  apiKey: Omit<DmsApiKey, "keyHash">;
  key: string;
}

export interface SessionUser {
  userId: string;
  email: string;
  displayName: string;
  username: string | null;
}

export interface SessionMembership {
  tenantId: string;
  name: string;
  slug: string;
  status: "active" | "suspended";
  role: MemberRole;
}

export interface AuthSession {
  user: SessionUser;
  isPlatformAdmin: boolean;
  memberships: SessionMembership[];
}

/** Token bundle returned by the identity provider. Never exposed to the browser. */
export interface TokenBundle {
  accessToken: string;
  refreshToken: string;
  idToken?: string;
  /** Seconds until the access token expires. */
  expiresIn: number;
}

export interface SignupPayload {
  email: string;
  password: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  gender?: string;
  address?: string;
  additionalDetails?: Record<string, unknown>;
}

export interface ClaimResult {
  documents: number;
  versions: number;
  folders: number;
  permissions: number;
}
