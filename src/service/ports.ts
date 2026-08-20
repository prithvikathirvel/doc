import { Readable } from "stream";
import {
  AuditEvent,
  Document,
  DocumentPermission,
  DocumentStatus,
  DocumentVersion,
  Folder,
  ObjectMetadata,
  StorageCapabilities,
  StorageLocation,
  StorageObjectSummary,
  StorageProviderConfig,
  Tenant,
  TenantAnalytics,
  TenantStorageConfig,
  TenantUser,
} from "./models";

export interface UploadRequest {
  location: StorageLocation;
  body: Buffer | Readable;
  contentType?: string;
  contentLength?: number;
  metadata?: Record<string, string>;
}

export interface DownloadResult {
  body: Readable;
  metadata: ObjectMetadata;
}

export interface SignedUrlOptions {
  expiresInSeconds?: number;
  contentType?: string;
  contentDisposition?: string;
}

export interface SignedUrl {
  url: string;
  method: "GET" | "PUT";
  headers?: Record<string, string>;
  expiresAt: Date;
}

export interface MultipartUploadSession {
  uploadId: string;
  location: StorageLocation;
}

export interface StorageProvider {
  readonly providerType: string;
  capabilities(): StorageCapabilities;
  upload(request: UploadRequest): Promise<ObjectMetadata>;
  download(location: StorageLocation): Promise<DownloadResult>;
  delete(location: StorageLocation): Promise<void>;
  exists(location: StorageLocation): Promise<boolean>;
  getMetadata(location: StorageLocation): Promise<ObjectMetadata>;
  copy(source: StorageLocation, destination: StorageLocation): Promise<void>;
  move(source: StorageLocation, destination: StorageLocation): Promise<void>;
  list(container: string, prefix?: string, maxKeys?: number): Promise<StorageObjectSummary[]>;
  createUploadUrl(location: StorageLocation, options?: SignedUrlOptions): Promise<SignedUrl>;
  createDownloadUrl(location: StorageLocation, options?: SignedUrlOptions): Promise<SignedUrl>;
  initiateMultipart(location: StorageLocation, contentType?: string): Promise<MultipartUploadSession>;
  uploadPart(session: MultipartUploadSession, partNumber: number, body: Buffer): Promise<{ etag: string }>;
  completeMultipart(
    session: MultipartUploadSession,
    parts: Array<{ partNumber: number; etag: string }>
  ): Promise<ObjectMetadata>;
  abortMultipart(session: MultipartUploadSession): Promise<void>;
}

export type StorageProviderFactory = (config: StorageProviderConfig) => StorageProvider;

export interface DocumentListFilter {
  tenantId: string;
  /**
   * When present the result is limited to documents the principal created or was
   * granted access to. Tenant administrators list without this filter.
   */
  visibleTo?: { userId: string; roles: string[] };
  /** Restricts the list to documents created by this principal. */
  createdBy?: string;
  folderId?: string | null;
  status?: DocumentStatus;
  q?: string;
  includeDeleted?: boolean;
  limit?: number;
  offset?: number;
}

export interface DocumentRepository {
  create(document: Document): Promise<Document>;
  update(document: Document): Promise<Document>;
  findById(tenantId: string, id: string, includeDeleted?: boolean): Promise<Document | null>;
  findByIdempotencyKey(tenantId: string, key: string): Promise<Document | null>;
  list(filter: DocumentListFilter): Promise<{ items: Document[]; total: number }>;
  createVersion(version: DocumentVersion): Promise<DocumentVersion>;
  listVersions(tenantId: string, documentId: string): Promise<DocumentVersion[]>;
  findVersion(tenantId: string, documentId: string, versionNumber: number): Promise<DocumentVersion | null>;
}

export interface SubtreeSummary {
  /** Sub-folders below the folder itself. */
  folders: number;
  documents: number;
  bytes: number;
}

export interface SubtreeDeletion extends SubtreeSummary {
  /** Includes the folder that was deleted. */
  foldersDeleted: number;
  documentsTrashed: number;
}

export interface FolderRepository {
  create(folder: Folder): Promise<Folder>;
  update(folder: Folder): Promise<Folder>;
  findById(tenantId: string, id: string, includeDeleted?: boolean): Promise<Folder | null>;
  findByParentAndName(tenantId: string, parentId: string | null, name: string): Promise<Folder | null>;
  list(tenantId: string, parentId?: string | null): Promise<Folder[]>;
  /** Counts everything that a recursive delete of this folder would affect. */
  summarizeSubtree(tenantId: string, folder: Folder): Promise<SubtreeSummary>;
  /** Soft-deletes the folder, its sub-folders and every document inside, in one transaction. */
  softDeleteSubtree(tenantId: string, folder: Folder, actorId: string): Promise<SubtreeDeletion>;
}

export interface TenantRepository {
  create(tenant: Tenant): Promise<Tenant>;
  update(tenant: Tenant): Promise<Tenant>;
  findById(id: string): Promise<Tenant | null>;
  findBySlug(slug: string): Promise<Tenant | null>;
  list(): Promise<Tenant[]>;
  upsertStorageConfig(config: TenantStorageConfig): Promise<TenantStorageConfig>;
  getStorageConfig(tenantId: string): Promise<TenantStorageConfig | null>;
}

export interface PermissionRepository {
  replaceForDocument(permission: DocumentPermission): Promise<DocumentPermission>;
  listForDocument(tenantId: string, documentId: string): Promise<DocumentPermission[]>;
  findForPrincipal(
    tenantId: string,
    documentId: string,
    principalType: "user" | "role",
    principalId: string
  ): Promise<DocumentPermission | null>;
  delete(tenantId: string, permissionId: string): Promise<void>;
}

export interface AnalyticsRepository {
  tenantAnalytics(tenantId: string): Promise<TenantAnalytics>;
  /** People who created or were granted documents inside a tenant. */
  tenantUsers(tenantId: string): Promise<TenantUser[]>;
}

export interface AuditLogger {
  record(event: AuditEvent): Promise<void>;
}

export interface FileScanHook {
  scan(input: { filename: string; mimeType: string; size: number; checksum?: string }): Promise<void>;
}
