import { RowDataPacket } from "mysql2";
import { TenantDocConfig } from "../../service/models";
import { TenantDocRepository } from "../../service/ports";
import { execute, query } from "../../dbConnection/pool";

interface TenantDocRow extends RowDataPacket {
  id: string;
  tenant_id: string;
  share_token: string;
  title: string;
  intro: string | null;
  api_base_url: string | null;
  selected_operations: string[];
  status: "active" | "disabled";
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

function mapConfig(row: TenantDocRow): TenantDocConfig {
  const operations = Array.isArray(row.selected_operations) ? row.selected_operations : [];
  return {
    id: row.id,
    tenantId: row.tenant_id,
    shareToken: row.share_token,
    title: row.title,
    intro: row.intro,
    apiBaseUrl: row.api_base_url,
    selectedOperations: operations.map(String),
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class MysqlTenantDocRepository implements TenantDocRepository {
  async findByTenant(tenantId: string): Promise<TenantDocConfig | null> {
    const rows = await query<TenantDocRow[]>(
      `SELECT * FROM dms_tenant_docs WHERE tenant_id = :tenantId LIMIT 1`,
      { tenantId }
    );
    return rows[0] ? mapConfig(rows[0]) : null;
  }

  async findByToken(shareToken: string): Promise<TenantDocConfig | null> {
    const rows = await query<TenantDocRow[]>(
      `SELECT * FROM dms_tenant_docs WHERE share_token = :shareToken LIMIT 1`,
      { shareToken }
    );
    return rows[0] ? mapConfig(rows[0]) : null;
  }

  async upsert(config: TenantDocConfig): Promise<TenantDocConfig> {
    await execute(
      `INSERT INTO dms_tenant_docs
        (id, tenant_id, share_token, title, intro, api_base_url, selected_operations, status, created_by, created_at, updated_at)
       VALUES
        (:id, :tenantId, :shareToken, :title, :intro, :apiBaseUrl, :selectedOperations, :status, :createdBy, :createdAt, :updatedAt)
       ON DUPLICATE KEY UPDATE
         share_token = VALUES(share_token),
         title = VALUES(title),
         intro = VALUES(intro),
         api_base_url = VALUES(api_base_url),
         selected_operations = VALUES(selected_operations),
         status = VALUES(status),
         updated_at = VALUES(updated_at)`,
      {
        ...config,
        intro: config.intro ?? null,
        apiBaseUrl: config.apiBaseUrl ?? null,
        selectedOperations: JSON.stringify(config.selectedOperations),
      }
    );
    return config;
  }
}
