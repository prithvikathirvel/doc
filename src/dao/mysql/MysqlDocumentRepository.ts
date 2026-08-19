import { RowDataPacket } from "mysql2";
import { Document, DocumentVersion } from "../../service/models";
import { DocumentListFilter, DocumentRepository } from "../../service/ports";
import { execute, query } from "../../dbConnection/pool";
import { mapDocument, mapVersion } from "./mappers";

export class MysqlDocumentRepository implements DocumentRepository {
  async create(document: Document): Promise<Document> {
    await execute(
      `INSERT INTO documents
        (id, tenant_id, folder_id, name, original_filename, mime_type, size, checksum,
         storage_provider, storage_container, storage_key, current_version, status,
         created_by, updated_by, created_at, updated_at, deleted_at, idempotency_key, metadata_json)
       VALUES
        (:id, :tenantId, :folderId, :name, :originalFilename, :mimeType, :size, :checksum,
         :storageProvider, :storageContainer, :storageKey, :currentVersion, :status,
         :createdBy, :updatedBy, :createdAt, :updatedAt, :deletedAt, :idempotencyKey, :metadataJson)`,
      {
        ...document,
        metadataJson: JSON.stringify(document.metadata || {}),
      }
    );
    return document;
  }

  async update(document: Document): Promise<Document> {
    await execute(
      `UPDATE documents SET
         folder_id = :folderId,
         name = :name,
         original_filename = :originalFilename,
         mime_type = :mimeType,
         size = :size,
         checksum = :checksum,
         storage_provider = :storageProvider,
         storage_container = :storageContainer,
         storage_key = :storageKey,
         current_version = :currentVersion,
         status = :status,
         updated_by = :updatedBy,
         updated_at = :updatedAt,
         deleted_at = :deletedAt,
         metadata_json = :metadataJson
       WHERE tenant_id = :tenantId AND id = :id`,
      {
        ...document,
        metadataJson: JSON.stringify(document.metadata || {}),
      }
    );
    return document;
  }

  async findById(tenantId: string, id: string, includeDeleted = false): Promise<Document | null> {
    const rows = await query<RowDataPacket[]>(
      `SELECT * FROM documents WHERE tenant_id = :tenantId AND id = :id ${includeDeleted ? "" : "AND status <> 'soft_deleted'"} LIMIT 1`,
      { tenantId, id }
    );
    return rows[0] ? mapDocument(rows[0]) : null;
  }

  async findByIdempotencyKey(tenantId: string, key: string): Promise<Document | null> {
    const rows = await query<RowDataPacket[]>(
      `SELECT * FROM documents WHERE tenant_id = :tenantId AND idempotency_key = :key LIMIT 1`,
      { tenantId, key }
    );
    return rows[0] ? mapDocument(rows[0]) : null;
  }

  async list(filter: DocumentListFilter): Promise<{ items: Document[]; total: number }> {
    const clauses = ["tenant_id = :tenantId"];
    const params: Record<string, unknown> = {
      tenantId: filter.tenantId,
      limit: filter.limit ?? 50,
      offset: filter.offset ?? 0,
    };
    if (filter.folderId !== undefined) {
      if (filter.folderId === null) clauses.push("folder_id IS NULL");
      else {
        clauses.push("folder_id = :folderId");
        params.folderId = filter.folderId;
      }
    }
    if (filter.status) {
      clauses.push("status = :status");
      params.status = filter.status;
    } else if (!filter.includeDeleted) {
      clauses.push("status <> 'soft_deleted'");
    }
    if (filter.q) {
      clauses.push("(name LIKE :q OR original_filename LIKE :q)");
      params.q = `%${filter.q}%`;
    }
    if (filter.visibleTo) {
      const rolePlaceholders = filter.visibleTo.roles.map((_, index) => `:role${index}`);
      filter.visibleTo.roles.forEach((role, index) => {
        params[`role${index}`] = role;
      });
      params.principalUserId = filter.visibleTo.userId;
      const roleClause = rolePlaceholders.length
        ? ` OR (p.principal_type = 'role' AND p.principal_id IN (${rolePlaceholders.join(", ")}))`
        : "";
      clauses.push(
        `(created_by = :principalUserId OR EXISTS (
            SELECT 1 FROM document_permissions p
            WHERE p.tenant_id = documents.tenant_id
              AND p.document_id = documents.id
              AND p.can_read = 1
              AND ((p.principal_type = 'user' AND p.principal_id = :principalUserId)${roleClause})
          ))`
      );
    }
    const where = clauses.join(" AND ");
    const countRows = await query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total FROM documents WHERE ${where}`,
      params
    );
    const rows = await query<RowDataPacket[]>(
      `SELECT * FROM documents WHERE ${where} ORDER BY updated_at DESC LIMIT :limit OFFSET :offset`,
      params
    );
    return { items: rows.map(mapDocument), total: Number(countRows[0]?.total || 0) };
  }

  async createVersion(version: DocumentVersion): Promise<DocumentVersion> {
    await execute(
      `INSERT INTO document_versions
        (id, document_id, tenant_id, version_number, storage_provider, storage_container,
         storage_key, checksum, size, mime_type, created_by, created_at)
       VALUES
        (:id, :documentId, :tenantId, :versionNumber, :storageProvider, :storageContainer,
         :storageKey, :checksum, :size, :mimeType, :createdBy, :createdAt)`,
      version
    );
    return version;
  }

  async listVersions(tenantId: string, documentId: string): Promise<DocumentVersion[]> {
    const rows = await query<RowDataPacket[]>(
      `SELECT * FROM document_versions WHERE tenant_id = :tenantId AND document_id = :documentId ORDER BY version_number DESC`,
      { tenantId, documentId }
    );
    return rows.map(mapVersion);
  }

  async findVersion(tenantId: string, documentId: string, versionNumber: number): Promise<DocumentVersion | null> {
    const rows = await query<RowDataPacket[]>(
      `SELECT * FROM document_versions
       WHERE tenant_id = :tenantId AND document_id = :documentId AND version_number = :versionNumber LIMIT 1`,
      { tenantId, documentId, versionNumber }
    );
    return rows[0] ? mapVersion(rows[0]) : null;
  }
}
