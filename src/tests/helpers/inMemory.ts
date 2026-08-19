import {
  Document,
  DocumentPermission,
  DocumentVersion,
  Folder,
  Tenant,
  TenantStorageConfig,
} from "../../domain/models";
import {
  AuditLogger,
  DocumentListFilter,
  DocumentRepository,
  FolderRepository,
  PermissionRepository,
  TenantRepository,
} from "../../domain/ports";

export class InMemoryDocumentRepository implements DocumentRepository {
  documents = new Map<string, Document>();
  versions: DocumentVersion[] = [];

  async create(document: Document): Promise<Document> {
    this.documents.set(key(document.tenantId, document.id), { ...document });
    return document;
  }
  async update(document: Document): Promise<Document> {
    this.documents.set(key(document.tenantId, document.id), { ...document });
    return document;
  }
  async findById(tenantId: string, id: string, includeDeleted = false): Promise<Document | null> {
    const doc = this.documents.get(key(tenantId, id));
    if (!doc) return null;
    if (!includeDeleted && doc.status === "soft_deleted") return null;
    return { ...doc };
  }
  async findByIdempotencyKey(tenantId: string, idempotencyKey: string): Promise<Document | null> {
    return [...this.documents.values()].find((d) => d.tenantId === tenantId && d.idempotencyKey === idempotencyKey) || null;
  }
  async list(filter: DocumentListFilter): Promise<{ items: Document[]; total: number }> {
    let items = [...this.documents.values()].filter((d) => d.tenantId === filter.tenantId);
    if (!filter.includeDeleted) items = items.filter((d) => d.status !== "soft_deleted");
    if (filter.q) items = items.filter((d) => d.name.includes(filter.q as string));
    return { items, total: items.length };
  }
  async createVersion(version: DocumentVersion): Promise<DocumentVersion> {
    this.versions.push(version);
    return version;
  }
  async listVersions(tenantId: string, documentId: string): Promise<DocumentVersion[]> {
    return this.versions.filter((v) => v.tenantId === tenantId && v.documentId === documentId);
  }
  async findVersion(tenantId: string, documentId: string, versionNumber: number): Promise<DocumentVersion | null> {
    return this.versions.find((v) => v.tenantId === tenantId && v.documentId === documentId && v.versionNumber === versionNumber) || null;
  }
}

export class InMemoryFolderRepository implements FolderRepository {
  items = new Map<string, Folder>();
  async create(folder: Folder): Promise<Folder> {
    this.items.set(key(folder.tenantId, folder.id), folder);
    return folder;
  }
  async update(folder: Folder): Promise<Folder> {
    this.items.set(key(folder.tenantId, folder.id), folder);
    return folder;
  }
  async findById(tenantId: string, id: string): Promise<Folder | null> {
    return this.items.get(key(tenantId, id)) || null;
  }
  async findByParentAndName(tenantId: string, parentId: string | null, name: string): Promise<Folder | null> {
    return [...this.items.values()].find((f) => f.tenantId === tenantId && f.parentId === parentId && f.name === name && !f.deletedAt) || null;
  }
  async list(tenantId: string, parentId?: string | null): Promise<Folder[]> {
    return [...this.items.values()].filter((f) => {
      if (f.tenantId !== tenantId || f.deletedAt) return false;
      if (parentId === undefined) return true;
      return f.parentId === parentId;
    });
  }
  async softDelete(tenantId: string, id: string): Promise<void> {
    const folder = this.items.get(key(tenantId, id));
    if (folder) folder.deletedAt = new Date();
  }
}

export class InMemoryTenantRepository implements TenantRepository {
  tenants = new Map<string, Tenant>();
  configs = new Map<string, TenantStorageConfig>();
  async create(tenant: Tenant): Promise<Tenant> {
    this.tenants.set(tenant.id, tenant);
    return tenant;
  }
  async update(tenant: Tenant): Promise<Tenant> {
    this.tenants.set(tenant.id, tenant);
    return tenant;
  }
  async findById(id: string): Promise<Tenant | null> {
    return this.tenants.get(id) || null;
  }
  async findBySlug(slug: string): Promise<Tenant | null> {
    return [...this.tenants.values()].find((t) => t.slug === slug) || null;
  }
  async list(): Promise<Tenant[]> {
    return [...this.tenants.values()];
  }
  async upsertStorageConfig(config: TenantStorageConfig): Promise<TenantStorageConfig> {
    this.configs.set(config.tenantId, config);
    return config;
  }
  async getStorageConfig(tenantId: string): Promise<TenantStorageConfig | null> {
    return this.configs.get(tenantId) || null;
  }
}

export class InMemoryPermissionRepository implements PermissionRepository {
  items: DocumentPermission[] = [];
  async replaceForDocument(permission: DocumentPermission): Promise<DocumentPermission> {
    this.items = this.items.filter(
      (p) =>
        !(
          p.tenantId === permission.tenantId &&
          p.documentId === permission.documentId &&
          p.principalType === permission.principalType &&
          p.principalId === permission.principalId
        )
    );
    this.items.push(permission);
    return permission;
  }
  async listForDocument(tenantId: string, documentId: string): Promise<DocumentPermission[]> {
    return this.items.filter((p) => p.tenantId === tenantId && p.documentId === documentId);
  }
  async findForPrincipal(
    tenantId: string,
    documentId: string,
    principalType: "user" | "role",
    principalId: string
  ): Promise<DocumentPermission | null> {
    return (
      this.items.find(
        (p) =>
          p.tenantId === tenantId &&
          p.documentId === documentId &&
          p.principalType === principalType &&
          p.principalId === principalId
      ) || null
    );
  }
  async delete(tenantId: string, permissionId: string): Promise<void> {
    this.items = this.items.filter((p) => !(p.tenantId === tenantId && p.id === permissionId));
  }
}

export class SilentAudit implements AuditLogger {
  events: unknown[] = [];
  async record(event: unknown): Promise<void> {
    this.events.push(event);
  }
}

function key(tenantId: string, id: string): string {
  return `${tenantId}:${id}`;
}
