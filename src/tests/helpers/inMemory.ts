import {
  Document,
  DocumentPermission,
  DocumentVersion,
  Folder,
  Tenant,
  TenantStorageConfig,
  TenantMembership,
} from "../../service/models";
import {
  AuditLogger,
  DocumentListFilter,
  DocumentRepository,
  FolderRepository,
  PermissionRepository,
  TenantRepository,
  TenantMembershipRepository,
} from "../../service/ports";

export class InMemoryDocumentRepository implements DocumentRepository {
  documents = new Map<string, Document>();
  versions: DocumentVersion[] = [];
  /** Shared with InMemoryPermissionRepository so list() can honour visibility filters. */
  grants: DocumentPermission[] = [];

  /** Live references to the stored records, used by the folder repository. */
  all(): Document[] {
    return [...this.documents.values()];
  }

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
    if (filter.createdBy) items = items.filter((d) => d.createdBy === filter.createdBy);
    if (filter.visibleTo) {
      const { userId, roles } = filter.visibleTo;
      items = items.filter(
        (d) =>
          d.createdBy === userId ||
          this.grants.some(
            (p) =>
              p.documentId === d.id &&
              p.canRead &&
              ((p.principalType === "user" && p.principalId === userId) ||
                (p.principalType === "role" && roles.includes(p.principalId)))
          )
      );
    }
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
  /** Shared with the document repository so cascading deletes are visible in tests. */
  constructor(private readonly documentStore?: { all(): Document[] }) {}
  async create(folder: Folder): Promise<Folder> {
    this.items.set(key(folder.tenantId, folder.id), folder);
    return folder;
  }
  async update(folder: Folder): Promise<Folder> {
    this.items.set(key(folder.tenantId, folder.id), folder);
    return folder;
  }
  async findById(tenantId: string, id: string, includeDeleted = false): Promise<Folder | null> {
    const folder = this.items.get(key(tenantId, id)) || null;
    if (!folder) return null;
    if (!includeDeleted && folder.deletedAt) return null;
    return folder;
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
  async summarizeSubtree(tenantId: string, folder: Folder) {
    const subtree = this.subtree(tenantId, folder);
    const documents = this.allDocuments().filter(
      (d) => d.tenantId === tenantId && d.status !== "soft_deleted" && d.folderId && subtree.has(d.folderId)
    );
    return {
      folders: subtree.size - 1,
      documents: documents.length,
      bytes: documents.reduce((sum, d) => sum + d.size, 0),
    };
  }

  async softDeleteSubtree(tenantId: string, folder: Folder, actorId: string) {
    const summary = await this.summarizeSubtree(tenantId, folder);
    const subtree = this.subtree(tenantId, folder);
    let foldersDeleted = 0;
    for (const id of subtree) {
      const target = this.items.get(key(tenantId, id));
      if (target && !target.deletedAt) {
        target.deletedAt = new Date();
        target.updatedBy = actorId;
        foldersDeleted += 1;
      }
    }
    let documentsTrashed = 0;
    for (const document of this.allDocuments()) {
      if (
        document.tenantId === tenantId &&
        document.status !== "soft_deleted" &&
        document.folderId &&
        subtree.has(document.folderId)
      ) {
        document.status = "soft_deleted";
        document.deletedAt = new Date();
        document.updatedBy = actorId;
        documentsTrashed += 1;
      }
    }
    return { ...summary, foldersDeleted, documentsTrashed };
  }

  private allDocuments(): Document[] {
    return this.documentStore ? this.documentStore.all() : [];
  }

  private subtree(tenantId: string, folder: Folder): Set<string> {
    const ids = new Set<string>([folder.id]);
    for (const candidate of this.items.values()) {
      if (candidate.tenantId !== tenantId || candidate.deletedAt) continue;
      if (candidate.path.startsWith(`${folder.path}/`)) ids.add(candidate.id);
    }
    return ids;
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

export class InMemoryTenantMembershipRepository implements TenantMembershipRepository {
  items: TenantMembership[] = [];

  async findByUserAndTenant(userId: string, tenantId: string): Promise<TenantMembership | null> {
    return this.items.find((item) => item.userId === userId && item.tenantId === tenantId) || null;
  }

  async listByUser(userId: string): Promise<TenantMembership[]> {
    return this.items.filter((item) => item.userId === userId && item.status === "active");
  }

  async listByTenant(tenantId: string): Promise<TenantMembership[]> {
    return this.items.filter((item) => item.tenantId === tenantId && item.status === "active");
  }

  async upsert(membership: TenantMembership): Promise<TenantMembership> {
    const index = this.items.findIndex(
      (item) => item.userId === membership.userId && item.tenantId === membership.tenantId
    );
    if (index >= 0) this.items.splice(index, 1, membership);
    else this.items.push(membership);
    return membership;
  }

  async updateRole(
    userId: string,
    tenantId: string,
    role: "tenant_admin" | "member"
  ): Promise<TenantMembership | null> {
    const item = await this.findByUserAndTenant(userId, tenantId);
    if (!item) return null;
    item.role = role;
    item.updatedAt = new Date();
    return item;
  }
}

export class InMemoryPermissionRepository implements PermissionRepository {
  constructor(public items: DocumentPermission[] = []) {}
  async replaceForDocument(permission: DocumentPermission): Promise<DocumentPermission> {
    const index = this.items.findIndex(
      (p) =>
        p.tenantId === permission.tenantId &&
        p.documentId === permission.documentId &&
        p.principalType === permission.principalType &&
        p.principalId === permission.principalId
    );
    if (index >= 0) this.items.splice(index, 1, permission);
    else this.items.push(permission);
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
    const index = this.items.findIndex((p) => p.tenantId === tenantId && p.id === permissionId);
    if (index >= 0) this.items.splice(index, 1);
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
