import { createHash } from "crypto";
import { Readable } from "stream";
import { v4 as uuidv4 } from "uuid";
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
  StorageConfigurationError,
  ValidationError,
} from "../utils/errors";
import {
  AuthContext,
  Document,
  DocumentAccess,
  DocumentPermission,
  DocumentVersion,
  PermissionAction,
  buildObjectKey,
  storageLocationOf,
} from "../service/models";
import {
  AuditLogger,
  DocumentRepository,
  FileScanHook,
  FolderRepository,
  PermissionRepository,
  SignedUrl,
  StorageProvider,
  TenantRepository,
} from "../service/ports";
import { allows, evaluateAccess, flagsForLevel } from "../utils/accessControl";
import { isTenantAdmin } from "../utils/roles";
import { inferMimeType, validateUpload } from "../utils/fileValidation";
import { metrics } from "../utils/metrics";
import { StorageResolver } from "./storageResolver";

export interface CreateDocumentInput {
  name?: string;
  filename: string;
  mimeType?: string;
  size?: number;
  folderId?: string | null;
  metadata?: Record<string, unknown>;
  idempotencyKey?: string;
}

export interface CompleteUploadInput {
  size?: number;
  checksum?: string;
}

export class DocumentService {
  constructor(
    private readonly documents: DocumentRepository,
    private readonly folders: FolderRepository,
    private readonly tenants: TenantRepository,
    private readonly permissions: PermissionRepository,
    private readonly audit: AuditLogger,
    private readonly resolver: StorageResolver,
    private readonly scanner?: FileScanHook
  ) {}

  async createUploadSession(auth: AuthContext, input: CreateDocumentInput) {
    const started = Date.now();
    try {
      if (input.idempotencyKey) {
        const existing = await this.documents.findByIdempotencyKey(auth.tenantId, input.idempotencyKey);
        if (existing) {
          const provider = await this.providerFor(auth.tenantId);
          const upload = provider.capabilities().signedUploadUrl
            ? await provider.createUploadUrl(storageLocationOf(existing), { contentType: existing.mimeType })
            : null;
          return { document: existing, upload, replayed: true };
        }
      }

      const { tenant, storageConfig, provider } = await this.context(auth.tenantId);
      if (input.folderId) {
        const folder = await this.folders.findById(auth.tenantId, input.folderId);
        if (!folder) throw new NotFoundError("Folder not found");
      }

      const mimeType = inferMimeType(input.filename, input.mimeType);
      validateUpload(tenant, { filename: input.filename, mimeType, size: input.size ?? 0 });
      if (this.scanner) {
        await this.scanner.scan({ filename: input.filename, mimeType, size: input.size ?? 0 });
      }

      const documentId = uuidv4();
      const version = 1;
      const objectKey = buildObjectKey({
        basePrefix: storageConfig.basePrefix,
        tenantId: auth.tenantId,
        documentId,
        version,
        filename: input.filename,
      });

      const now = new Date();
      const document: Document = {
        id: documentId,
        tenantId: auth.tenantId,
        folderId: input.folderId ?? null,
        name: input.name || stripExtension(input.filename),
        originalFilename: input.filename,
        mimeType,
        size: input.size ?? 0,
        checksum: null,
        storageProvider: storageConfig.provider,
        storageContainer: storageConfig.container,
        storageKey: objectKey,
        currentVersion: version,
        status: "pending_upload",
        createdBy: auth.userId,
        updatedBy: auth.userId,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        idempotencyKey: input.idempotencyKey ?? null,
        metadata: input.metadata || {},
      };

      await this.documents.create(document);
      await this.grantOwner(document, auth);

      const upload = provider.capabilities().signedUploadUrl
        ? await provider.createUploadUrl(storageLocationOf(document), {
            contentType: mimeType,
            expiresInSeconds: storageConfig.signedUrlTtlSeconds,
          })
        : null;

      await this.audit.record({
        tenantId: auth.tenantId,
        actorId: auth.userId,
        action: "document.upload_session",
        resourceType: "document",
        resourceId: document.id,
        provider: document.storageProvider,
        success: true,
        durationMs: Date.now() - started,
      });
      metrics.observeUpload(Date.now() - started, true);
      return { document, upload, replayed: false };
    } catch (err) {
      metrics.observeUpload(Date.now() - started, false);
      throw err;
    }
  }

  async completeUpload(auth: AuthContext, documentId: string, input: CompleteUploadInput = {}) {
    const document = await this.requireDocument(auth, documentId, "write", true);
    const provider = await this.providerFor(auth.tenantId);
    const exists = await provider.exists(storageLocationOf(document));
    if (!exists) {
      document.status = "failed";
      document.updatedAt = new Date();
      document.updatedBy = auth.userId;
      await this.documents.update(document);
      throw new BadRequestError("Upload has not reached storage yet");
    }

    const objectMeta = await provider.getMetadata(storageLocationOf(document));
    document.size = input.size ?? objectMeta.size;
    document.checksum = input.checksum ?? objectMeta.checksum ?? document.checksum;
    document.status = "active";
    document.updatedAt = new Date();
    document.updatedBy = auth.userId;
    await this.documents.update(document);

    const existingVersions = await this.documents.listVersions(auth.tenantId, document.id);
    if (!existingVersions.some((v) => v.versionNumber === document.currentVersion)) {
      await this.documents.createVersion(versionFrom(document, auth.userId));
    }

    await this.audit.record({
      tenantId: auth.tenantId,
      actorId: auth.userId,
      action: "document.complete_upload",
      resourceType: "document",
      resourceId: document.id,
      provider: document.storageProvider,
      success: true,
    });
    return document;
  }

  async uploadDirect(auth: AuthContext, input: CreateDocumentInput & { body: Buffer | Readable; checksum?: string }) {
    const started = Date.now();
    const session = await this.createUploadSession(auth, input);
    const provider = await this.providerFor(auth.tenantId);
    const body = input.body;
    const checksum = input.checksum || (Buffer.isBuffer(body) ? sha256(body) : undefined);
    try {
      await provider.upload({
        location: storageLocationOf(session.document),
        body,
        contentType: session.document.mimeType,
        contentLength: Buffer.isBuffer(body) ? body.length : input.size,
      });
      const completed = await this.completeUpload(auth, session.document.id, {
        size: Buffer.isBuffer(body) ? body.length : input.size,
        checksum,
      });
      metrics.observeStorage(Date.now() - started, true);
      return completed;
    } catch (err) {
      metrics.observeStorage(Date.now() - started, false);
      throw err;
    }
  }

  async get(auth: AuthContext, documentId: string, includeDeleted = false): Promise<Document> {
    return this.requireDocument(auth, documentId, "read", includeDeleted);
  }

  /**
   * Lists documents in the tenant. Members only see what they created or were
   * granted access to; tenant administrators see everything.
   */
  async list(
    auth: AuthContext,
    query: {
      folderId?: string | null;
      q?: string;
      createdBy?: string;
      includeDeleted?: boolean;
      limit?: number;
      offset?: number;
    }
  ) {
    return this.documents.list({
      tenantId: auth.tenantId,
      folderId: query.folderId,
      q: query.q,
      createdBy: query.createdBy,
      includeDeleted: query.includeDeleted,
      limit: query.limit,
      offset: query.offset,
      visibleTo: isTenantAdmin(auth.roles) ? undefined : { userId: auth.userId, roles: auth.roles },
    });
  }

  async createDownloadSession(auth: AuthContext, documentId: string, versionNumber?: number) {
    const started = Date.now();
    try {
      const document = await this.requireDocument(auth, documentId, "read");
      const version = versionNumber
        ? await this.documents.findVersion(auth.tenantId, documentId, versionNumber)
        : null;
      if (versionNumber && !version) {
        throw new NotFoundError("Document version not found");
      }
      const provider = await this.providerFor(auth.tenantId);
      const location = storageLocationOf(document, version || undefined);
      if (!provider.capabilities().signedDownloadUrl) {
        return { document, version, download: null as SignedUrl | null };
      }
      const download = await provider.createDownloadUrl(location, {
        contentDisposition: `attachment; filename="${document.originalFilename}"`,
      });
      metrics.observeDownload(Date.now() - started, true);
      await this.audit.record({
        tenantId: auth.tenantId,
        actorId: auth.userId,
        action: "document.download_session",
        resourceType: "document",
        resourceId: document.id,
        provider: document.storageProvider,
        success: true,
        durationMs: Date.now() - started,
      });
      return { document, version, download };
    } catch (err) {
      metrics.observeDownload(Date.now() - started, false);
      throw err;
    }
  }

  async streamDownload(auth: AuthContext, documentId: string, versionNumber?: number) {
    const document = await this.requireDocument(auth, documentId, "read");
    const version = versionNumber
      ? await this.documents.findVersion(auth.tenantId, documentId, versionNumber)
      : null;
    if (versionNumber && !version) {
      throw new NotFoundError("Document version not found");
    }
    const provider = await this.providerFor(auth.tenantId);
    return {
      document,
      version,
      download: await provider.download(storageLocationOf(document, version || undefined)),
    };
  }

  async softDelete(auth: AuthContext, documentId: string) {
    const document = await this.requireDocument(auth, documentId, "delete");
    document.status = "soft_deleted";
    document.deletedAt = new Date();
    document.updatedAt = new Date();
    document.updatedBy = auth.userId;
    await this.documents.update(document);
    await this.audit.record({
      tenantId: auth.tenantId,
      actorId: auth.userId,
      action: "document.soft_delete",
      resourceType: "document",
      resourceId: document.id,
      provider: document.storageProvider,
      success: true,
    });
    return document;
  }

  async restore(auth: AuthContext, documentId: string) {
    const document = await this.requireDocument(auth, documentId, "write", true);
    if (document.status !== "soft_deleted") {
      throw new BadRequestError("Document is not deleted");
    }
    document.status = "active";
    document.deletedAt = null;
    document.updatedAt = new Date();
    document.updatedBy = auth.userId;
    await this.documents.update(document);
    await this.audit.record({
      tenantId: auth.tenantId,
      actorId: auth.userId,
      action: "document.restore",
      resourceType: "document",
      resourceId: document.id,
      provider: document.storageProvider,
      success: true,
    });
    return document;
  }

  async permanentDelete(auth: AuthContext, documentId: string) {
    const document = await this.requireDocument(auth, documentId, "delete", true);
    const provider = await this.providerFor(auth.tenantId);
    const versions = await this.documents.listVersions(auth.tenantId, documentId);
    const locations = [
      storageLocationOf(document),
      ...versions.map((v) => storageLocationOf(document, v)),
    ];
    const unique = new Map(locations.map((l) => [l.objectKey, l]));

    let storageFailed = false;
    for (const location of unique.values()) {
      try {
        await provider.delete(location);
      } catch {
        storageFailed = true;
      }
    }

    document.status = "soft_deleted";
    document.deletedAt = document.deletedAt || new Date();
    document.updatedAt = new Date();
    document.updatedBy = auth.userId;
    document.metadata = { ...document.metadata, permanentlyDeleted: true, storageDeleteFailed: storageFailed };
    await this.documents.update(document);

    await this.audit.record({
      tenantId: auth.tenantId,
      actorId: auth.userId,
      action: "document.permanent_delete",
      resourceType: "document",
      resourceId: document.id,
      provider: document.storageProvider,
      success: !storageFailed,
      errorCategory: storageFailed ? "STORAGE_DELETE" : undefined,
    });
    return { document, storageFailed };
  }

  async uploadNewVersion(
    auth: AuthContext,
    documentId: string,
    input: CreateDocumentInput & { body: Buffer | Readable }
  ) {
    const session = await this.createVersionSession(auth, documentId, input);
    const provider = await this.providerFor(auth.tenantId);
    await provider.upload({
      location: storageLocationOf(session.document),
      body: input.body,
      contentType: session.document.mimeType,
      contentLength: Buffer.isBuffer(input.body) ? input.body.length : input.size,
    });
    const checksum = Buffer.isBuffer(input.body) ? sha256(input.body) : undefined;
    const document = await this.completeUpload(auth, session.document.id, {
      size: Buffer.isBuffer(input.body) ? input.body.length : input.size,
      checksum,
    });
    return document;
  }

  async createVersionSession(auth: AuthContext, documentId: string, input: CreateDocumentInput) {
    const document = await this.requireDocument(auth, documentId, "write");
    const { tenant, storageConfig, provider } = await this.context(auth.tenantId);
    const mimeType = inferMimeType(input.filename || document.originalFilename, input.mimeType || document.mimeType);
    validateUpload(tenant, { filename: input.filename || document.originalFilename, mimeType, size: input.size ?? 0 });

    const nextVersion = document.currentVersion + 1;
    const objectKey = buildObjectKey({
      basePrefix: storageConfig.basePrefix,
      tenantId: auth.tenantId,
      documentId: document.id,
      version: nextVersion,
      filename: input.filename || document.originalFilename,
    });

    document.currentVersion = nextVersion;
    document.storageProvider = storageConfig.provider;
    document.storageContainer = storageConfig.container;
    document.storageKey = objectKey;
    document.originalFilename = input.filename || document.originalFilename;
    document.mimeType = mimeType;
    document.status = "pending_upload";
    document.updatedAt = new Date();
    document.updatedBy = auth.userId;
    if (input.name) document.name = input.name;
    await this.documents.update(document);

    const upload = provider.capabilities().signedUploadUrl
      ? await provider.createUploadUrl(storageLocationOf(document), { contentType: mimeType })
      : null;
    return { document, upload };
  }

  async listVersions(auth: AuthContext, documentId: string) {
    await this.requireDocument(auth, documentId, "read", true);
    return this.documents.listVersions(auth.tenantId, documentId);
  }

  async rename(auth: AuthContext, documentId: string, name: string, folderId?: string | null) {
    const document = await this.requireDocument(auth, documentId, "write");
    if (!name.trim()) throw new ValidationError("Name is required");
    if (folderId !== undefined) {
      if (folderId) {
        const folder = await this.folders.findById(auth.tenantId, folderId);
        if (!folder) throw new NotFoundError("Folder not found");
      }
      document.folderId = folderId;
    }
    document.name = name.trim();
    document.updatedAt = new Date();
    document.updatedBy = auth.userId;
    return this.documents.update(document);
  }

  async metadata(auth: AuthContext, documentId: string) {
    const document = await this.requireDocument(auth, documentId, "read", true);
    const provider = await this.providerFor(auth.tenantId);
    let storage = null;
    try {
      storage = await provider.getMetadata(storageLocationOf(document));
    } catch {
      storage = null;
    }
    return { document, storage };
  }

  /** Effective access of the caller on a document that has already been loaded. */
  async accessFor(auth: AuthContext, document: Document): Promise<DocumentAccess> {
    if (isTenantAdmin(auth.roles) || document.createdBy === auth.userId) {
      return evaluateAccess({ auth, document });
    }
    const [userGrant, roleGrants] = await Promise.all([
      this.permissions.findForPrincipal(auth.tenantId, document.id, "user", auth.userId),
      Promise.all(
        auth.roles.map((role) => this.permissions.findForPrincipal(auth.tenantId, document.id, "role", role))
      ),
    ]);
    return evaluateAccess({ auth, document, userGrant, roleGrants });
  }

  /** Loads a document and fails with 403 unless the caller may perform `action`. */
  private async requireDocument(
    auth: AuthContext,
    documentId: string,
    action: PermissionAction,
    includeDeleted = false
  ): Promise<Document> {
    const document = await this.documents.findById(auth.tenantId, documentId, includeDeleted);
    if (!document) {
      throw new NotFoundError("Document not found");
    }
    const access = await this.accessFor(auth, document);
    if (!allows(access, action)) {
      throw new ForbiddenError(`You do not have ${action} access to this document`);
    }
    return document;
  }

  private async grantOwner(document: Document, auth: AuthContext): Promise<DocumentPermission> {
    return this.permissions.replaceForDocument({
      id: uuidv4(),
      tenantId: document.tenantId,
      documentId: document.id,
      principalType: "user",
      principalId: auth.userId,
      ...flagsForLevel("owner"),
      createdBy: auth.userId,
      createdAt: new Date(),
    });
  }

  private async context(tenantId: string) {
    const tenant = await this.tenants.findById(tenantId);
    if (!tenant) throw new NotFoundError("Tenant not found");
    if (tenant.status !== "active") throw new ForbiddenError("Tenant is not active");
    const storageConfig = await this.tenants.getStorageConfig(tenantId);
    if (!storageConfig) throw new StorageConfigurationError("Tenant has no storage configuration");
    const provider = this.resolver.resolve(storageConfig);
    return { tenant, storageConfig, provider };
  }

  private async providerFor(tenantId: string): Promise<StorageProvider> {
    const { provider } = await this.context(tenantId);
    return provider;
  }
}

function stripExtension(filename: string): string {
  return filename.replace(/\.[^/.]+$/, "");
}

function versionFrom(document: Document, userId: string): DocumentVersion {
  return {
    id: uuidv4(),
    documentId: document.id,
    tenantId: document.tenantId,
    versionNumber: document.currentVersion,
    storageProvider: document.storageProvider,
    storageContainer: document.storageContainer,
    storageKey: document.storageKey,
    checksum: document.checksum,
    size: document.size,
    mimeType: document.mimeType,
    createdBy: userId,
    createdAt: new Date(),
  };
}

function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}
