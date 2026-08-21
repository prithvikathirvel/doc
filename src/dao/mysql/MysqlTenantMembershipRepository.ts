import { RowDataPacket } from "mysql2";
import { execute, query } from "../../dbConnection/pool";
import { TenantMembership } from "../../service/models";
import { TenantMembershipRepository } from "../../service/ports";

function mapMembership(row: RowDataPacket): TenantMembership {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    userId: String(row.user_id),
    email: row.email ? String(row.email) : null,
    role: row.role === "tenant_admin" ? "tenant_admin" : "member",
    status: row.status === "suspended" ? "suspended" : "active",
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export class MysqlTenantMembershipRepository implements TenantMembershipRepository {
  async findByUserAndTenant(userId: string, tenantId: string): Promise<TenantMembership | null> {
    const rows = await query<RowDataPacket[]>(
      `SELECT * FROM tenant_members
       WHERE user_id = :userId AND tenant_id = :tenantId
       LIMIT 1`,
      { userId, tenantId }
    );
    return rows[0] ? mapMembership(rows[0]) : null;
  }

  async listByUser(userId: string): Promise<TenantMembership[]> {
    const rows = await query<RowDataPacket[]>(
      `SELECT * FROM tenant_members
       WHERE user_id = :userId AND status = 'active'
       ORDER BY created_at ASC`,
      { userId }
    );
    return rows.map(mapMembership);
  }

  async listByTenant(tenantId: string): Promise<TenantMembership[]> {
    const rows = await query<RowDataPacket[]>(
      `SELECT * FROM tenant_members
       WHERE tenant_id = :tenantId AND status = 'active'
       ORDER BY created_at ASC`,
      { tenantId }
    );
    return rows.map(mapMembership);
  }

  async upsert(membership: TenantMembership): Promise<TenantMembership> {
    await execute(
      `INSERT INTO tenant_members
        (id, tenant_id, user_id, email, role, status, created_at, updated_at)
       VALUES
        (:id, :tenantId, :userId, :email, :role, :status, :createdAt, :updatedAt)
       ON DUPLICATE KEY UPDATE
        email = VALUES(email),
        role = VALUES(role),
        status = VALUES(status),
        updated_at = VALUES(updated_at)`,
      {
        id: membership.id,
        tenantId: membership.tenantId,
        userId: membership.userId,
        email: membership.email,
        role: membership.role,
        status: membership.status,
        createdAt: membership.createdAt,
        updatedAt: membership.updatedAt,
      }
    );
    return (await this.findByUserAndTenant(membership.userId, membership.tenantId)) || membership;
  }

  async updateRole(
    userId: string,
    tenantId: string,
    role: "tenant_admin" | "member"
  ): Promise<TenantMembership | null> {
    await execute(
      `UPDATE tenant_members
       SET role = :role, updated_at = :updatedAt
       WHERE user_id = :userId AND tenant_id = :tenantId`,
      { role, userId, tenantId, updatedAt: new Date() }
    );
    return this.findByUserAndTenant(userId, tenantId);
  }
}
