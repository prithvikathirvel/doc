import { RowDataPacket } from "mysql2";
import { Folder } from "../../service/models";
import { FolderRepository } from "../../service/ports";
import { execute, query } from "../../dbConnection/pool";
import { mapFolder } from "./mappers";

export class MysqlFolderRepository implements FolderRepository {
  async create(folder: Folder): Promise<Folder> {
    await execute(
      `INSERT INTO folders
        (id, tenant_id, parent_id, name, path, created_by, updated_by, created_at, updated_at, deleted_at)
       VALUES
        (:id, :tenantId, :parentId, :name, :path, :createdBy, :updatedBy, :createdAt, :updatedAt, :deletedAt)`,
      folder
    );
    return folder;
  }

  async update(folder: Folder): Promise<Folder> {
    await execute(
      `UPDATE folders SET
         parent_id = :parentId,
         name = :name,
         path = :path,
         updated_by = :updatedBy,
         updated_at = :updatedAt,
         deleted_at = :deletedAt
       WHERE tenant_id = :tenantId AND id = :id`,
      folder
    );
    return folder;
  }

  async findById(tenantId: string, id: string, includeDeleted = false): Promise<Folder | null> {
    const rows = await query<RowDataPacket[]>(
      `SELECT * FROM folders WHERE tenant_id = :tenantId AND id = :id ${includeDeleted ? "" : "AND deleted_at IS NULL"} LIMIT 1`,
      { tenantId, id }
    );
    return rows[0] ? mapFolder(rows[0]) : null;
  }

  async findByParentAndName(tenantId: string, parentId: string | null, name: string): Promise<Folder | null> {
    const sql = parentId
      ? `SELECT * FROM folders WHERE tenant_id = :tenantId AND parent_id = :parentId AND name = :name AND deleted_at IS NULL LIMIT 1`
      : `SELECT * FROM folders WHERE tenant_id = :tenantId AND parent_id IS NULL AND name = :name AND deleted_at IS NULL LIMIT 1`;
    const rows = await query<RowDataPacket[]>(sql, { tenantId, parentId, name });
    return rows[0] ? mapFolder(rows[0]) : null;
  }

  async list(tenantId: string, parentId?: string | null): Promise<Folder[]> {
    let sql = `SELECT * FROM folders WHERE tenant_id = :tenantId AND deleted_at IS NULL`;
    const params: Record<string, unknown> = { tenantId };
    if (parentId === null) {
      sql += " AND parent_id IS NULL";
    } else if (parentId !== undefined) {
      sql += " AND parent_id = :parentId";
      params.parentId = parentId;
    }
    sql += " ORDER BY name ASC";
    const rows = await query<RowDataPacket[]>(sql, params);
    return rows.map(mapFolder);
  }

  async softDelete(tenantId: string, id: string): Promise<void> {
    await execute(
      `UPDATE folders SET deleted_at = NOW(), updated_at = NOW() WHERE tenant_id = :tenantId AND id = :id`,
      { tenantId, id }
    );
  }
}
