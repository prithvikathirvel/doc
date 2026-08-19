import { RowDataPacket } from "mysql2";
import {
  Document,
  DocumentPermission,
  DocumentStatus,
  DocumentVersion,
  Folder,
  ProviderType,
  Tenant,
  TenantStorageConfig,
} from "../../../domain/models";

function asDate(value: unknown): Date {
  return value instanceof Date ? value : new Date(String(value));
}

function asDateOrNull(value: unknown): Date | null {
  if (value === null || value === undefined) return null;
  return asDate(value);
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "object") return value as T;
  try {
    return JSON.parse(String(value)) as T;
  } catch {
    return fallback;
  }
}

export function mapTenant(row: RowDataPacket): Tenant {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status,
    maxFileSizeBytes: Number(row.max_file_size_bytes),
    allowedMimeTypes: parseJson<string[] | null>(row.allowed_mime_types, null),
    createdAt: asDate(row.created_at),
    updatedAt: asDate(row.updated_at),
  };
}

export function mapStorageConfig(row: RowDataPacket): TenantStorageConfig {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    provider: row.provider as ProviderType,
    container: row.container,
    region: row.region || undefined,
    endpoint: row.endpoint || undefined,
    accessKeyRef: row.access_key_ref || undefined,
    secretKeyRef: row.secret_key_ref || undefined,
    sessionTokenRef: row.session_token_ref || undefined,
    projectId: row.project_id || undefined,
    accountName: row.account_name || undefined,
    credentialsJsonRef: row.credentials_json_ref || undefined,
    basePrefix: row.base_prefix || undefined,
    useSsl: Boolean(row.use_ssl),
    signedUrlTtlSeconds: Number(row.signed_url_ttl_seconds),
    createdAt: asDate(row.created_at),
    updatedAt: asDate(row.updated_at),
  };
}

export function mapFolder(row: RowDataPacket): Folder {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    parentId: row.parent_id,
    name: row.name,
    path: row.path,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: asDate(row.created_at),
    updatedAt: asDate(row.updated_at),
    deletedAt: asDateOrNull(row.deleted_at),
  };
}

export function mapDocument(row: RowDataPacket): Document {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    folderId: row.folder_id,
    name: row.name,
    originalFilename: row.original_filename,
    mimeType: row.mime_type,
    size: Number(row.size),
    checksum: row.checksum,
    storageProvider: row.storage_provider,
    storageContainer: row.storage_container,
    storageKey: row.storage_key,
    currentVersion: Number(row.current_version),
    status: row.status as DocumentStatus,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: asDate(row.created_at),
    updatedAt: asDate(row.updated_at),
    deletedAt: asDateOrNull(row.deleted_at),
    idempotencyKey: row.idempotency_key,
    metadata: parseJson(row.metadata_json, {}),
  };
}

export function mapVersion(row: RowDataPacket): DocumentVersion {
  return {
    id: row.id,
    documentId: row.document_id,
    tenantId: row.tenant_id,
    versionNumber: Number(row.version_number),
    storageProvider: row.storage_provider,
    storageContainer: row.storage_container,
    storageKey: row.storage_key,
    checksum: row.checksum,
    size: Number(row.size),
    mimeType: row.mime_type,
    createdBy: row.created_by,
    createdAt: asDate(row.created_at),
  };
}

export function mapPermission(row: RowDataPacket): DocumentPermission {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    documentId: row.document_id,
    principalType: row.principal_type,
    principalId: row.principal_id,
    canRead: Boolean(row.can_read),
    canWrite: Boolean(row.can_write),
    canDelete: Boolean(row.can_delete),
    canAdmin: Boolean(row.can_admin),
    createdBy: row.created_by,
    createdAt: asDate(row.created_at),
  };
}
