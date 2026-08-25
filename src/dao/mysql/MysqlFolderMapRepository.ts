import { RowDataPacket } from "mysql2";
import { FolderMap } from "../../service/models";
import { FolderMapRepository } from "../../service/ports";
import { execute, query } from "../../dbConnection/pool";

interface FolderMapRow extends RowDataPacket {
  id: string;
  tenant_id: string;
  map_key: string;
  path_template: string;
  description: string | null;
  status: "active" | "disabled";
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

function mapFolderMap(row: FolderMapRow): FolderMap {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    key: row.map_key,
    pathTemplate: row.path_template,
    description: row.description,
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class MysqlFolderMapRepository implements FolderMapRepository {
  async listByTenant(tenantId: string): Promise<FolderMap[]> {
    const rows = await query<FolderMapRow[]>(
      `SELECT * FROM dms_folder_maps WHERE tenant_id = :tenantId ORDER BY map_key ASC`,
      { tenantId }
    );
    return rows.map(mapFolderMap);
  }

  async findByKey(tenantId: string, key: string): Promise<FolderMap | null> {
    const rows = await query<FolderMapRow[]>(
      `SELECT * FROM dms_folder_maps WHERE tenant_id = :tenantId AND map_key = :key LIMIT 1`,
      { tenantId, key }
    );
    return rows[0] ? mapFolderMap(rows[0]) : null;
  }

  async upsert(map: FolderMap): Promise<FolderMap> {
    await execute(
      `INSERT INTO dms_folder_maps
        (id, tenant_id, map_key, path_template, description, status, created_by, created_at, updated_at)
       VALUES
        (:id, :tenantId, :key, :pathTemplate, :description, :status, :createdBy, :createdAt, :updatedAt)
       ON DUPLICATE KEY UPDATE
         path_template = VALUES(path_template),
         description = VALUES(description),
         status = VALUES(status),
         updated_at = VALUES(updated_at)`,
      {
        ...map,
        description: map.description ?? null,
      }
    );
    return map;
  }

  async deleteMissing(tenantId: string, keepKeys: string[]): Promise<void> {
    if (keepKeys.length === 0) {
      await execute(`DELETE FROM dms_folder_maps WHERE tenant_id = :tenantId`, { tenantId });
      return;
    }
    const placeholders = keepKeys.map((_, index) => `:keep${index}`).join(", ");
    const params: Record<string, unknown> = { tenantId };
    keepKeys.forEach((key, index) => {
      params[`keep${index}`] = key;
    });
    await execute(
      `DELETE FROM dms_folder_maps WHERE tenant_id = :tenantId AND map_key NOT IN (${placeholders})`,
      params
    );
  }
}
