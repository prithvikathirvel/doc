import { RowDataPacket } from "mysql2";
import { DocumentPermission } from "../../../domain/models";
import { PermissionRepository } from "../../../domain/ports";
import { execute, query } from "./pool";
import { mapPermission } from "./mappers";

export class MysqlPermissionRepository implements PermissionRepository {
  async replaceForDocument(permission: DocumentPermission): Promise<DocumentPermission> {
    await execute(
      `INSERT INTO document_permissions
        (id, tenant_id, document_id, principal_type, principal_id, can_read, can_write, can_delete, can_admin, created_by, created_at)
       VALUES
        (:id, :tenantId, :documentId, :principalType, :principalId, :canRead, :canWrite, :canDelete, :canAdmin, :createdBy, :createdAt)
       ON DUPLICATE KEY UPDATE
         can_read = VALUES(can_read),
         can_write = VALUES(can_write),
         can_delete = VALUES(can_delete),
         can_admin = VALUES(can_admin)`,
      {
        ...permission,
        canRead: permission.canRead ? 1 : 0,
        canWrite: permission.canWrite ? 1 : 0,
        canDelete: permission.canDelete ? 1 : 0,
        canAdmin: permission.canAdmin ? 1 : 0,
      }
    );
    return permission;
  }

  async listForDocument(tenantId: string, documentId: string): Promise<DocumentPermission[]> {
    const rows = await query<RowDataPacket[]>(
      `SELECT * FROM document_permissions WHERE tenant_id = :tenantId AND document_id = :documentId`,
      { tenantId, documentId }
    );
    return rows.map(mapPermission);
  }

  async findForPrincipal(
    tenantId: string,
    documentId: string,
    principalType: "user" | "role",
    principalId: string
  ): Promise<DocumentPermission | null> {
    const rows = await query<RowDataPacket[]>(
      `SELECT * FROM document_permissions
       WHERE tenant_id = :tenantId AND document_id = :documentId
         AND principal_type = :principalType AND principal_id = :principalId
       LIMIT 1`,
      { tenantId, documentId, principalType, principalId }
    );
    return rows[0] ? mapPermission(rows[0]) : null;
  }

  async delete(tenantId: string, permissionId: string): Promise<void> {
    await execute(`DELETE FROM document_permissions WHERE tenant_id = :tenantId AND id = :permissionId`, {
      tenantId,
      permissionId,
    });
  }
}
