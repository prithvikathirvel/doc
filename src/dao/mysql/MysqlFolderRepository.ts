import { ResultSetHeader, RowDataPacket } from "mysql2";
import { Folder } from "../../service/models";
import { FolderRepository, SubtreeDeletion, SubtreeSummary } from "../../service/ports";
import { execute, query, withTransaction } from "../../dbConnection/pool";
import { mapFolder } from "./mappers";

/** Escapes LIKE wildcards so a folder named "50%_off" cannot widen the match. */
function likePrefix(path: string): string {
  const escaped = path.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
  return `${escaped}/%`;
}

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

  /**
   * Counts the subtree with two indexed reads instead of walking the tree in the
   * application: folders are matched by path prefix, documents by that folder set.
   */
  async summarizeSubtree(tenantId: string, folder: Folder): Promise<SubtreeSummary> {
    const params = { tenantId, folderId: folder.id, pathPrefix: likePrefix(folder.path) };

    const [folderRows, documentRows] = await Promise.all([
      query<RowDataPacket[]>(
        `SELECT COUNT(*) AS total
           FROM folders
          WHERE tenant_id = :tenantId
            AND deleted_at IS NULL
            AND path LIKE :pathPrefix ESCAPE '\\'`,
        params
      ),
      query<RowDataPacket[]>(
        `SELECT COUNT(*) AS total, COALESCE(SUM(size), 0) AS bytes
           FROM documents d
          WHERE d.tenant_id = :tenantId
            AND d.status <> 'soft_deleted'
            AND d.folder_id IN (
                  SELECT f.id FROM folders f
                   WHERE f.tenant_id = :tenantId
                     AND f.deleted_at IS NULL
                     AND (f.id = :folderId OR f.path LIKE :pathPrefix ESCAPE '\\')
                )`,
        params
      ),
    ]);

    return {
      folders: Number(folderRows[0]?.total || 0),
      documents: Number(documentRows[0]?.total || 0),
      bytes: Number(documentRows[0]?.bytes || 0),
    };
  }

  /**
   * Recursive delete as two set-based statements inside one transaction, so a tree
   * of any depth costs the same two writes and can never be left half-deleted.
   */
  async softDeleteSubtree(tenantId: string, folder: Folder, actorId: string): Promise<SubtreeDeletion> {
    const summary = await this.summarizeSubtree(tenantId, folder);
    const params = {
      tenantId,
      folderId: folder.id,
      pathPrefix: likePrefix(folder.path),
      actorId,
    };

    return withTransaction(async (conn) => {
      const [documentResult] = await conn.execute<ResultSetHeader>(
        `UPDATE documents
            SET status = 'soft_deleted',
                deleted_at = NOW(),
                updated_at = NOW(),
                updated_by = :actorId
          WHERE tenant_id = :tenantId
            AND status <> 'soft_deleted'
            AND folder_id IN (
                  SELECT id FROM (
                    SELECT f.id FROM folders f
                     WHERE f.tenant_id = :tenantId
                       AND f.deleted_at IS NULL
                       AND (f.id = :folderId OR f.path LIKE :pathPrefix ESCAPE '\\')
                  ) AS subtree
                )`,
        params
      );

      const [folderResult] = await conn.execute<ResultSetHeader>(
        `UPDATE folders
            SET deleted_at = NOW(),
                updated_at = NOW(),
                updated_by = :actorId
          WHERE tenant_id = :tenantId
            AND deleted_at IS NULL
            AND (id = :folderId OR path LIKE :pathPrefix ESCAPE '\\')`,
        params
      );

      return {
        ...summary,
        foldersDeleted: folderResult.affectedRows,
        documentsTrashed: documentResult.affectedRows,
      };
    });
  }
}
