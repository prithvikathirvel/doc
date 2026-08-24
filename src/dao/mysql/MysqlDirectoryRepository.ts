import { v4 as uuidv4 } from "uuid";
import { execute, query, withTransaction } from "../../dbConnection/pool";
import type { RowDataPacket } from "mysql2/promise";
import {
  DirectoryMember,
  DmsApiKey,
  DmsUser,
  DmsUserAlias,
  MemberRole,
  TenantMembership,
} from "../../auth/models";
import { DirectoryRepository, LegacyActivityClaimer } from "../../auth/ports";

interface UserRow extends RowDataPacket {
  user_id: string;
  email: string;
  username: string | null;
  display_name: string | null;
  is_platform_admin: number;
  status: "active" | "disabled";
  last_login_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface MembershipRow extends RowDataPacket {
  tenant_id: string;
  tenant_name: string;
  tenant_slug: string;
  tenant_status: "active" | "suspended";
  user_id: string;
  role: MemberRole;
  status: "active" | "disabled";
  created_at: Date;
}

interface AliasRow extends RowDataPacket {
  alias: string;
  tenant_id: string;
}

interface ApiKeyRow extends RowDataPacket {
  id: string;
  display_name: string;
  key_prefix: string;
  key_hash: string;
  tenant_id: string | null;
  roles_json: string;
  status: "active" | "disabled";
  expires_at: Date | null;
  last_used_at: Date | null;
  created_by: string;
  created_at: Date;
}

function mapUser(row: UserRow): DmsUser {
  return {
    userId: row.user_id,
    email: row.email,
    username: row.username,
    displayName: row.display_name || row.email,
    isPlatformAdmin: Boolean(row.is_platform_admin),
    status: row.status,
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMembership(row: MembershipRow): TenantMembership {
  return {
    tenantId: row.tenant_id,
    tenantName: row.tenant_name,
    tenantSlug: row.tenant_slug,
    tenantStatus: row.tenant_status,
    userId: row.user_id,
    role: row.role,
    status: row.status,
    createdAt: row.created_at,
  };
}

function mapApiKey(row: ApiKeyRow): DmsApiKey {
  return {
    id: row.id,
    displayName: row.display_name,
    keyPrefix: row.key_prefix,
    keyHash: row.key_hash,
    tenantId: row.tenant_id,
    roles: JSON.parse(row.roles_json) as string[],
    status: row.status,
    expiresAt: row.expires_at,
    lastUsedAt: row.last_used_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

const MEMBER_SELECT = `
  SELECT m.tenant_id, t.name AS tenant_name, t.slug AS tenant_slug, t.status AS tenant_status,
         m.user_id, m.role, m.status, m.created_at
  FROM tenant_members m
  JOIN tenants t ON t.id = m.tenant_id
`;

/** MySQL implementation of the DMS identity directory. */
export class MysqlDirectoryRepository implements DirectoryRepository {
  async upsertUser(input: {
    userId: string;
    email: string;
    username?: string | null;
    displayName?: string | null;
    isPlatformAdmin?: boolean;
  }): Promise<DmsUser> {
    const now = new Date();
    await execute(
      `INSERT INTO dms_users (user_id, email, username, display_name, is_platform_admin, status, created_at, updated_at)
       VALUES (:userId, :email, :username, :displayName, :isPlatformAdmin, 'active', :now, :now)
       ON DUPLICATE KEY UPDATE
         email = IF(VALUES(email) <> '' AND VALUES(email) LIKE '%@%', VALUES(email), email),
         username = COALESCE(VALUES(username), username),
         display_name = COALESCE(NULLIF(VALUES(display_name), ''), display_name),
         is_platform_admin = GREATEST(is_platform_admin, VALUES(is_platform_admin)),
         updated_at = VALUES(updated_at)`,
      {
        userId: input.userId,
        email: input.email,
        username: input.username ?? null,
        displayName: input.displayName ?? null,
        isPlatformAdmin: input.isPlatformAdmin ? 1 : 0,
        now,
      }
    );
    const user = await this.findUserByUserId(input.userId);
    if (!user) throw new Error("dms_users upsert failed");
    return user;
  }

  async findUserByUserId(userId: string): Promise<DmsUser | null> {
    const rows = await query<UserRow[]>(`SELECT * FROM dms_users WHERE user_id = :userId LIMIT 1`, {
      userId,
    });
    return rows[0] ? mapUser(rows[0]) : null;
  }

  async findUserByEmail(email: string): Promise<DmsUser | null> {
    const rows = await query<UserRow[]>(
      `SELECT * FROM dms_users WHERE email = :email ORDER BY is_platform_admin DESC LIMIT 1`,
      { email: email.toLowerCase() }
    );
    return rows[0] ? mapUser(rows[0]) : null;
  }

  async setPlatformAdmin(userId: string, flag: boolean): Promise<void> {
    await execute(
      `UPDATE dms_users SET is_platform_admin = :flag, updated_at = :now WHERE user_id = :userId`,
      { userId, flag: flag ? 1 : 0, now: new Date() }
    );
  }

  async touchLastLogin(userId: string): Promise<void> {
    await execute(`UPDATE dms_users SET last_login_at = :now WHERE user_id = :userId`, {
      userId,
      now: new Date(),
    });
  }

  async listPlatformAdmins(): Promise<DmsUser[]> {
    const rows = await query<UserRow[]>(`SELECT * FROM dms_users WHERE is_platform_admin = 1 ORDER BY email`);
    return rows.map(mapUser);
  }

  async addAliases(userId: string, aliases: string[], tenantId?: string): Promise<void> {
    const scope = tenantId || "";
    const now = new Date();
    for (const raw of aliases) {
      const alias = String(raw || "").trim().toLowerCase();
      if (!alias) continue;
      await execute(
        `INSERT INTO dms_user_aliases (id, user_id, alias, tenant_id, created_at)
         VALUES (:id, :userId, :alias, :tenantId, :now)
         ON DUPLICATE KEY UPDATE user_id = VALUES(user_id)`,
        { id: uuidv4(), userId, alias, tenantId: scope, now }
      );
    }
  }

  async listAliases(userId: string): Promise<DmsUserAlias[]> {
    const rows = await query<AliasRow[]>(
      `SELECT alias, tenant_id FROM dms_user_aliases WHERE user_id = :userId`,
      { userId }
    );
    return rows.map((row) => ({ alias: row.alias, tenantId: row.tenant_id }));
  }

  async listMemberships(userId: string): Promise<TenantMembership[]> {
    const rows = await query<MembershipRow[]>(`${MEMBER_SELECT} WHERE m.user_id = :userId`, {
      userId,
    });
    return rows.map(mapMembership);
  }

  async findMembership(tenantId: string, userId: string): Promise<TenantMembership | null> {
    const rows = await query<MembershipRow[]>(
      `${MEMBER_SELECT} WHERE m.tenant_id = :tenantId AND m.user_id = :userId LIMIT 1`,
      { tenantId, userId }
    );
    return rows[0] ? mapMembership(rows[0]) : null;
  }

  async addMembership(input: {
    tenantId: string;
    userId: string;
    role: MemberRole;
    createdBy: string;
  }): Promise<TenantMembership> {
    const now = new Date();
    await execute(
      `INSERT INTO tenant_members (id, tenant_id, user_id, role, status, created_by, created_at, updated_at)
       VALUES (:id, :tenantId, :userId, :role, 'active', :createdBy, :now, :now)`,
      { id: uuidv4(), ...input, now }
    );
    const membership = await this.findMembership(input.tenantId, input.userId);
    if (!membership) throw new Error("tenant_members insert failed");
    return membership;
  }

  async updateMembership(
    tenantId: string,
    userId: string,
    patch: { role?: MemberRole; status?: "active" | "disabled" }
  ): Promise<TenantMembership | null> {
    await execute(
      `UPDATE tenant_members SET
         role = COALESCE(:role, role),
         status = COALESCE(:status, status),
         updated_at = :now
       WHERE tenant_id = :tenantId AND user_id = :userId`,
      { role: patch.role ?? null, status: patch.status ?? null, tenantId, userId, now: new Date() }
    );
    return this.findMembership(tenantId, userId);
  }

  async removeMembership(tenantId: string, userId: string): Promise<boolean> {
    const result = await execute(
      `DELETE FROM tenant_members WHERE tenant_id = :tenantId AND user_id = :userId`,
      { tenantId, userId }
    );
    return result.affectedRows > 0;
  }

  async listMembers(tenantId: string): Promise<DirectoryMember[]> {
    const rows = await query<(UserRow & MembershipRow)[]>(
      `SELECT u.*, m.tenant_id, t.name AS tenant_name, t.slug AS tenant_slug,
              t.status AS tenant_status, m.role, m.created_at
       FROM tenant_members m
       JOIN dms_users u ON u.user_id = m.user_id
       JOIN tenants t ON t.id = m.tenant_id
       WHERE m.tenant_id = :tenantId
       ORDER BY m.role = 'tenant_admin' DESC, u.display_name, u.email`,
      { tenantId }
    );
    return rows.map((row) => ({
      user: mapUser(row),
      membership: mapMembership(row),
    }));
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
    const id = uuidv4();
    const now = new Date();
    await execute(
      `INSERT INTO dms_api_keys (id, display_name, key_prefix, key_hash, tenant_id, roles_json, status, expires_at, created_by, created_at)
       VALUES (:id, :displayName, :keyPrefix, :keyHash, :tenantId, :rolesJson, 'active', :expiresAt, :createdBy, :now)`,
      {
        id,
        displayName: input.displayName,
        keyPrefix: input.keyPrefix,
        keyHash: input.keyHash,
        tenantId: input.tenantId ?? null,
        rolesJson: JSON.stringify(input.roles),
        expiresAt: input.expiresAt ?? null,
        createdBy: input.createdBy,
        now,
      }
    );
    return {
      id,
      displayName: input.displayName,
      keyPrefix: input.keyPrefix,
      keyHash: input.keyHash,
      tenantId: input.tenantId ?? null,
      roles: input.roles,
      status: "active",
      expiresAt: input.expiresAt ?? null,
      lastUsedAt: null,
      createdBy: input.createdBy,
      createdAt: now,
    };
  }

  async findApiKeyByHash(keyHash: string): Promise<DmsApiKey | null> {
    const rows = await query<ApiKeyRow[]>(
      `SELECT * FROM dms_api_keys WHERE key_hash = :keyHash LIMIT 1`,
      { keyHash }
    );
    return rows[0] ? mapApiKey(rows[0]) : null;
  }

  async listApiKeys(): Promise<DmsApiKey[]> {
    const rows = await query<ApiKeyRow[]>(`SELECT * FROM dms_api_keys ORDER BY created_at DESC`);
    return rows.map(mapApiKey);
  }

  async updateApiKeyStatus(id: string, status: "active" | "disabled"): Promise<void> {
    await execute(`UPDATE dms_api_keys SET status = :status WHERE id = :id`, { id, status });
  }

  async deleteApiKey(id: string): Promise<boolean> {
    const result = await execute(`DELETE FROM dms_api_keys WHERE id = :id`, { id });
    return result.affectedRows > 0;
  }

  async touchApiKey(id: string): Promise<void> {
    await execute(`UPDATE dms_api_keys SET last_used_at = :now WHERE id = :id`, {
      id,
      now: new Date(),
    });
  }
}

/**
 * Re-points legacy activity recorded under earlier x-user-id values (emails,
 * employee codes, machine ids) to the canonical user id, inside one tenant and
 * in one transaction.
 */
export class MysqlLegacyActivityClaimer implements LegacyActivityClaimer {
  async claim(tenantId: string, canonicalUserId: string, aliases: string[]): Promise<{
    documents: number;
    versions: number;
    folders: number;
    permissions: number;
  }> {
    const unique = [...new Set(aliases.map((alias) => alias.trim().toLowerCase()).filter(Boolean))];
    if (!unique.length) return { documents: 0, versions: 0, folders: 0, permissions: 0 };

    return withTransaction(async (conn) => {
      const placeholders = unique.map((_, index) => `:a${index}`).join(", ");
      const params: Record<string, unknown> = { tenantId, canonicalUserId };
      unique.forEach((alias, index) => {
        params[`a${index}`] = alias;
      });

      const [docs] = await conn.execute(
        `UPDATE documents SET created_by = :canonicalUserId, updated_by = :canonicalUserId
         WHERE tenant_id = :tenantId AND created_by IN (${placeholders})`,
        params
      );
      const [versions] = await conn.execute(
        `UPDATE document_versions SET created_by = :canonicalUserId
         WHERE tenant_id = :tenantId AND created_by IN (${placeholders})`,
        params
      );
      const [folders] = await conn.execute(
        `UPDATE folders SET created_by = :canonicalUserId, updated_by = :canonicalUserId
         WHERE tenant_id = :tenantId AND created_by IN (${placeholders})`,
        params
      );
      const [grants] = await conn.execute(
        `UPDATE document_permissions SET principal_id = :canonicalUserId
         WHERE tenant_id = :tenantId AND principal_type = 'user' AND principal_id IN (${placeholders})`,
        params
      );
      return {
        documents: (docs as { affectedRows: number }).affectedRows,
        versions: (versions as { affectedRows: number }).affectedRows,
        folders: (folders as { affectedRows: number }).affectedRows,
        permissions: (grants as { affectedRows: number }).affectedRows,
      };
    });
  }
}
