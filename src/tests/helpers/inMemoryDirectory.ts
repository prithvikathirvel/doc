import { v4 as uuidv4 } from "uuid";
import {
  DirectoryMember,
  DmsApiKey,
  DmsUser,
  DmsUserAlias,
  MemberRole,
  TenantMembership,
} from "../../auth/models";
import { DirectoryRepository, LegacyActivityClaimer } from "../../auth/ports";
import { Document, DocumentPermission, Folder } from "../../service/models";

/**
 * In-memory identity directory for tests and the preview API. Mirrors
 * MysqlDirectoryRepository exactly, including the lower-casing of emails and
 * aliases, so behaviour tested here holds against MySQL.
 */
export class InMemoryDirectoryRepository implements DirectoryRepository {
  users = new Map<string, DmsUser>();
  memberships: TenantMembership[] = [];
  aliases: Array<DmsUserAlias & { userId: string }> = [];
  apiKeys = new Map<string, DmsApiKey>();
  tenants = new Map<string, { name: string; slug: string; status: "active" | "suspended" }>();

  async upsertUser(input: {
    userId: string;
    email: string;
    username?: string | null;
    displayName?: string | null;
    isPlatformAdmin?: boolean;
  }): Promise<DmsUser> {
    const existing = this.users.get(input.userId);
    const now = new Date();
    const user: DmsUser = {
      userId: input.userId,
      email: input.email.toLowerCase(),
      username: input.username ?? existing?.username ?? null,
      displayName: input.displayName || existing?.displayName || input.email.toLowerCase(),
      isPlatformAdmin: Boolean(input.isPlatformAdmin) || Boolean(existing?.isPlatformAdmin),
      status: existing?.status || "active",
      lastLoginAt: existing?.lastLoginAt ?? null,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
    this.users.set(user.userId, user);
    return { ...user };
  }

  async findUserByUserId(userId: string): Promise<DmsUser | null> {
    const user = this.users.get(userId);
    return user ? { ...user } : null;
  }

  async findUserByEmail(email: string): Promise<DmsUser | null> {
    const needle = email.toLowerCase();
    const user = [...this.users.values()].find((entry) => entry.email === needle);
    return user ? { ...user } : null;
  }

  async setPlatformAdmin(userId: string, flag: boolean): Promise<void> {
    const user = this.users.get(userId);
    if (user) user.isPlatformAdmin = flag;
  }

  async touchLastLogin(userId: string): Promise<void> {
    const user = this.users.get(userId);
    if (user) user.lastLoginAt = new Date();
  }

  async listPlatformAdmins(): Promise<DmsUser[]> {
    return [...this.users.values()].filter((user) => user.isPlatformAdmin).map((user) => ({ ...user }));
  }

  async addAliases(userId: string, aliases: string[], tenantId?: string): Promise<void> {
    const scope = tenantId || "";
    for (const raw of aliases) {
      const alias = String(raw || "").trim().toLowerCase();
      if (!alias) continue;
      const existing = this.aliases.find(
        (entry) => entry.alias === alias && entry.tenantId === scope
      );
      if (existing) existing.userId = userId;
      else this.aliases.push({ alias, tenantId: scope, userId });
    }
  }

  async listAliases(userId: string): Promise<DmsUserAlias[]> {
    return this.aliases.filter((entry) => entry.userId === userId).map(({ alias, tenantId }) => ({ alias, tenantId }));
  }

  async listMemberships(userId: string): Promise<TenantMembership[]> {
    return this.memberships
      .filter((membership) => membership.userId === userId)
      .map((membership) => ({ ...membership }));
  }

  async findMembership(tenantId: string, userId: string): Promise<TenantMembership | null> {
    const membership = this.memberships.find(
      (entry) => entry.tenantId === tenantId && entry.userId === userId
    );
    return membership ? { ...membership } : null;
  }

  async addMembership(input: {
    tenantId: string;
    userId: string;
    role: MemberRole;
    createdBy: string;
  }): Promise<TenantMembership> {
    const tenant = this.tenants.get(input.tenantId) || { name: input.tenantId, slug: input.tenantId, status: "active" as const };
    const membership: TenantMembership = {
      tenantId: input.tenantId,
      tenantName: tenant.name,
      tenantSlug: tenant.slug,
      tenantStatus: tenant.status,
      userId: input.userId,
      role: input.role,
      status: "active",
      createdAt: new Date(),
    };
    this.memberships.push(membership);
    return { ...membership };
  }

  async updateMembership(
    tenantId: string,
    userId: string,
    patch: { role?: MemberRole; status?: "active" | "disabled" }
  ): Promise<TenantMembership | null> {
    const membership = this.memberships.find(
      (entry) => entry.tenantId === tenantId && entry.userId === userId
    );
    if (!membership) return null;
    if (patch.role) membership.role = patch.role;
    if (patch.status) membership.status = patch.status;
    return { ...membership };
  }

  async removeMembership(tenantId: string, userId: string): Promise<boolean> {
    const index = this.memberships.findIndex(
      (entry) => entry.tenantId === tenantId && entry.userId === userId
    );
    if (index === -1) return false;
    this.memberships.splice(index, 1);
    return true;
  }

  async listMembers(tenantId: string): Promise<DirectoryMember[]> {
    return this.memberships
      .filter((membership) => membership.tenantId === tenantId)
      .map((membership) => {
        const user = this.users.get(membership.userId);
        return user
          ? { user: { ...user }, membership: { ...membership } }
          : null;
      })
      .filter((entry): entry is DirectoryMember => entry !== null)
      .sort(
        (a, b) =>
          Number(b.membership.role === "tenant_admin") - Number(a.membership.role === "tenant_admin") ||
          a.user.displayName.localeCompare(b.user.displayName)
      );
  }

  async createApiKey(input: {
    displayName: string;
    keyPrefix: string;
    keyHash: string;
    tenantId?: string | null;
    roles: string[];
    expiresAt?: Date | null;
    createdBy: string;
  }): Promise<DmsApiKey> {
    const apiKey: DmsApiKey = {
      id: uuidv4(),
      displayName: input.displayName,
      keyPrefix: input.keyPrefix,
      keyHash: input.keyHash,
      tenantId: input.tenantId ?? null,
      roles: input.roles,
      status: "active",
      expiresAt: input.expiresAt ?? null,
      lastUsedAt: null,
      createdBy: input.createdBy,
      createdAt: new Date(),
    };
    this.apiKeys.set(apiKey.id, apiKey);
    return { ...apiKey };
  }

  async findApiKeyByHash(keyHash: string): Promise<DmsApiKey | null> {
    const apiKey = [...this.apiKeys.values()].find((entry) => entry.keyHash === keyHash);
    return apiKey ? { ...apiKey } : null;
  }

  async listApiKeys(): Promise<DmsApiKey[]> {
    return [...this.apiKeys.values()].map((apiKey) => ({ ...apiKey }));
  }

  async updateApiKeyStatus(id: string, status: "active" | "disabled"): Promise<void> {
    const apiKey = this.apiKeys.get(id);
    if (apiKey) apiKey.status = status;
  }

  async deleteApiKey(id: string): Promise<boolean> {
    return this.apiKeys.delete(id);
  }

  async touchApiKey(id: string): Promise<void> {
    const apiKey = this.apiKeys.get(id);
    if (apiKey) apiKey.lastUsedAt = new Date();
  }
}

/** In-memory counterpart of MysqlLegacyActivityClaimer. */
export class InMemoryLegacyActivityClaimer implements LegacyActivityClaimer {
  constructor(
    private readonly stores: {
      documents: { all(): Document[] };
      versions: Array<{ tenantId: string; createdBy: string }>;
      folders: { items: Map<string, Folder> };
      grants: DocumentPermission[];
    }
  ) {}

  async claim(tenantId: string, canonicalUserId: string, aliases: string[]) {
    const set = new Set(aliases.map((alias) => alias.trim().toLowerCase()).filter(Boolean));
    let documents = 0;
    let versions = 0;
    let folders = 0;
    let permissions = 0;

    for (const document of this.stores.documents.all()) {
      if (document.tenantId === tenantId && set.has(document.createdBy.toLowerCase())) {
        document.createdBy = canonicalUserId;
        document.updatedBy = canonicalUserId;
        documents += 1;
      }
    }
    for (const version of this.stores.versions) {
      if (version.tenantId === tenantId && set.has(version.createdBy.toLowerCase())) {
        version.createdBy = canonicalUserId;
        versions += 1;
      }
    }
    for (const folder of this.stores.folders.items.values()) {
      if (folder.tenantId === tenantId && set.has(folder.createdBy.toLowerCase())) {
        folder.createdBy = canonicalUserId;
        folder.updatedBy = canonicalUserId;
        folders += 1;
      }
    }
    for (const grant of this.stores.grants) {
      if (
        grant.tenantId === tenantId &&
        grant.principalType === "user" &&
        set.has(grant.principalId.toLowerCase())
      ) {
        grant.principalId = canonicalUserId;
        permissions += 1;
      }
    }
    return { documents, versions, folders, permissions };
  }
}
