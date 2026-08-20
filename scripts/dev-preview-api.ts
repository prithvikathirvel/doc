/**
 * Local preview API.
 *
 * Runs the real Express application with in-memory repositories and fake storage
 * adapters, seeded with two example tenants. It exists so the web UI can be developed
 * and demonstrated without MySQL or a cloud bucket:
 *
 *   npx ts-node --transpile-only scripts/dev-preview-api.ts     # API on :3001
 *   cd web && DMS_API_URL=http://127.0.0.1:3001 npm run dev     # UI on :3000
 *
 * Never use it as a runtime for real data: nothing is persisted.
 */
process.env.AUTH_DISABLED = "true";

import path from "path";
import { container } from "../src/config/container";
import { storageRegistry } from "../src/dao/dao";
import { FakeStorageProvider } from "../src/dao/fake/FakeStorageProvider";
import {
  InMemoryDocumentRepository,
  InMemoryFolderRepository,
  InMemoryPermissionRepository,
  InMemoryTenantRepository,
  SilentAudit,
} from "../src/tests/helpers/inMemory";
import { DocumentService } from "../src/service/documentService";
import { FolderService } from "../src/service/folderService";
import { PermissionService } from "../src/service/permissionService";
import { TenantService } from "../src/service/tenantService";
import { StorageResolver } from "../src/service/storageResolver";
import type { AnalyticsRepository } from "../src/service/ports";
import type { AuthContext, TenantAnalytics, TenantUser } from "../src/service/models";
import app from "../src/index";

const PORT = Number(process.env.PREVIEW_PORT || 3001);

const documents = new InMemoryDocumentRepository();
const folders = new InMemoryFolderRepository(documents);
const tenants = new InMemoryTenantRepository();
const permissions = new InMemoryPermissionRepository(documents.grants);
const audit = new SilentAudit();
const resolver = new StorageResolver();

for (const provider of ["s3", "minio", "gcp", "azure"]) {
  storageRegistry.register(
    provider,
    () => new FakeStorageProvider({ providerType: provider, signedUrls: false })
  );
}

const analytics: AnalyticsRepository = {
  async tenantAnalytics(tenantId: string): Promise<TenantAnalytics> {
    const all = documents.all().filter((document) => document.tenantId === tenantId);
    const active = all.filter((document) => document.status === "active");
    const trash = all.filter((document) => document.status === "soft_deleted");

    const byDay = new Map<string, { documents: number; bytes: number }>();
    for (const document of all) {
      const key = new Date(document.createdAt).toISOString().slice(0, 10);
      const entry = byDay.get(key) || { documents: 0, bytes: 0 };
      entry.documents += 1;
      entry.bytes += document.size;
      byDay.set(key, entry);
    }
    const uploadTrend: TenantAnalytics["uploadTrend"] = [];
    const cursor = new Date();
    cursor.setUTCHours(0, 0, 0, 0);
    cursor.setUTCDate(cursor.getUTCDate() - 29);
    for (let index = 0; index < 30; index += 1) {
      const key = cursor.toISOString().slice(0, 10);
      uploadTrend.push({ date: key, ...(byDay.get(key) || { documents: 0, bytes: 0 }) });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    const byMime = new Map<string, { documents: number; bytes: number }>();
    const byUser = new Map<string, { documents: number; bytes: number }>();
    for (const document of active) {
      const mime = byMime.get(document.mimeType) || { documents: 0, bytes: 0 };
      mime.documents += 1;
      mime.bytes += document.size;
      byMime.set(document.mimeType, mime);
      const user = byUser.get(document.createdBy) || { documents: 0, bytes: 0 };
      user.documents += 1;
      user.bytes += document.size;
      byUser.set(document.createdBy, user);
    }

    const versions = documents.versions.filter((version) => version.tenantId === tenantId);

    return {
      tenantId,
      generatedAt: new Date(),
      documents: {
        total: all.length,
        active: active.length,
        pendingUpload: all.filter((document) => document.status === "pending_upload").length,
        failed: all.filter((document) => document.status === "failed").length,
        inTrash: trash.length,
        createdLast30Days: all.length,
      },
      storage: {
        activeBytes: active.reduce((sum, document) => sum + document.size, 0),
        trashBytes: trash.reduce((sum, document) => sum + document.size, 0),
        versionBytes: versions.reduce((sum, version) => sum + version.size, 0),
        averageDocumentBytes: active.length
          ? Math.round(active.reduce((sum, document) => sum + document.size, 0) / active.length)
          : 0,
        largestDocumentBytes: active.reduce((max, document) => Math.max(max, document.size), 0),
      },
      folders: {
        total: [...folders.items.values()].filter(
          (folder) => folder.tenantId === tenantId && !folder.deletedAt
        ).length,
      },
      versions: { total: versions.length },
      contributors: {
        total: byUser.size,
        top: [...byUser.entries()].map(([userId, value]) => ({ userId, ...value })).slice(0, 5),
      },
      fileTypes: [...byMime.entries()].map(([mimeType, value]) => ({ mimeType, ...value })).slice(0, 6),
      uploadTrend,
      recentActivity: (audit.events as Array<Record<string, unknown>>)
        .slice(-12)
        .reverse()
        .map((event) => ({
          action: String(event.action),
          actorId: String(event.actorId),
          resourceType: String(event.resourceType),
          resourceId: String(event.resourceId),
          success: Boolean(event.success),
          createdAt: new Date(),
        })),
    };
  },

  async tenantUsers(tenantId: string): Promise<TenantUser[]> {
    const all = documents.all().filter((document) => document.tenantId === tenantId);
    const tenant = await tenants.findById(tenantId);
    const owner = (tenant?.ownerEmail || "").toLowerCase();
    const users = new Map<string, TenantUser>();

    const ensure = (userId: string): TenantUser => {
      const existing = users.get(userId);
      if (existing) return existing;
      const created: TenantUser = {
        userId,
        isOwner: Boolean(owner) && userId.toLowerCase() === owner,
        documents: 0,
        activeDocuments: 0,
        trashedDocuments: 0,
        bytes: 0,
        versions: 0,
        sharedWithThem: 0,
        firstActivityAt: null,
        lastActivityAt: null,
      };
      users.set(userId, created);
      return created;
    };

    for (const document of all) {
      const user = ensure(document.createdBy);
      user.documents += 1;
      if (document.status === "soft_deleted") {
        user.trashedDocuments += 1;
      } else {
        user.activeDocuments += 1;
        user.bytes += document.size;
      }
      user.firstActivityAt = user.firstActivityAt || document.createdAt;
      user.lastActivityAt = document.updatedAt;
    }
    for (const version of documents.versions.filter((entry) => entry.tenantId === tenantId)) {
      ensure(version.createdBy).versions += 1;
    }
    for (const grant of permissions.items.filter(
      (entry) => entry.tenantId === tenantId && entry.principalType === "user"
    )) {
      ensure(grant.principalId).sharedWithThem += 1;
    }
    if (owner) ensure(owner);

    return [...users.values()].sort(
      (a, b) => Number(b.isOwner) - Number(a.isOwner) || b.documents - a.documents
    );
  },
};

container.resolver = resolver;
container.documentService = new DocumentService(documents, folders, tenants, permissions, audit, resolver);
container.folderService = new FolderService(folders, audit);
container.tenantService = new TenantService(tenants, resolver, analytics);
container.permissionService = new PermissionService(documents, permissions);

const platformAdmin: AuthContext = {
  userId: "admin@platform.io",
  userName: "Platform Admin",
  tenantId: "",
  roles: ["platform_admin"],
};

async function seed(): Promise<void> {
  const acme = await container.tenantService.create(platformAdmin, {
    name: "Acme Corporation",
    slug: "acme",
    ownerName: "Jane Doe",
    ownerEmail: "jane@acme.com",
    maxFileSizeBytes: 52_428_800,
    allowedMimeTypes: ["application/pdf", "text/plain", "image/png", "image/jpeg"],
    storage: {
      provider: "s3",
      container: "acme-documents",
      region: "us-east-1",
      accessKeyRef: "ACME_AWS_ACCESS_KEY",
      secretKeyRef: "ACME_AWS_SECRET_KEY",
      basePrefix: "dms",
      signedUrlTtlSeconds: 900,
    },
  });

  await container.tenantService.create(platformAdmin, {
    name: "Northwind Logistics",
    slug: "northwind",
    ownerName: "Sam Patel",
    ownerEmail: "sam@northwind.io",
    maxFileSizeBytes: 104_857_600,
    allowedMimeTypes: null,
    storage: {
      provider: "minio",
      container: "northwind",
      endpoint: "https://minio.northwind.internal:9000",
      accessKeyRef: "NORTHWIND_ACCESS_KEY",
      secretKeyRef: "NORTHWIND_SECRET_KEY",
      signedUrlTtlSeconds: 600,
    },
  });

  const tenantId = acme.tenant.id;
  const jane: AuthContext = { userId: "jane@acme.com", userName: "Jane Doe", tenantId, roles: ["tenant_admin"] };
  const carlos: AuthContext = { userId: "carlos@acme.com", userName: "Carlos Reyes", tenantId, roles: ["member"] };
  const priya: AuthContext = { userId: "priya@acme.com", userName: "Priya Nair", tenantId, roles: ["member"] };

  const contracts = await container.folderService.create(jane, { name: "Contracts", parentId: null });
  const year = await container.folderService.create(jane, { name: "2026", parentId: contracts.id });
  const signed = await container.folderService.create(jane, { name: "Signed", parentId: year.id });
  const invoices = await container.folderService.create(jane, { name: "Invoices", parentId: null });

  const samples: Array<[AuthContext, string, string, string, number, string | null]> = [
    [jane, "Master service agreement", "msa.pdf", "application/pdf", 482_000, contracts.id],
    [jane, "Statement of work 2026", "sow-2026.pdf", "application/pdf", 210_400, year.id],
    [jane, "Signed NDA", "nda-signed.pdf", "application/pdf", 88_100, signed.id],
    [jane, "Data processing addendum", "dpa.pdf", "application/pdf", 158_900, null],
    [carlos, "Onboarding checklist", "checklist.txt", "text/plain", 4_200, invoices.id],
    [carlos, "Vendor assessment", "vendor.pdf", "application/pdf", 96_300, null],
    [priya, "Office floorplan", "floorplan.png", "image/png", 1_204_000, null],
  ];

  for (const [auth, name, filename, mimeType, size, folderId] of samples) {
    await container.documentService.uploadDirect(auth, {
      filename,
      name,
      mimeType,
      size,
      folderId,
      body: Buffer.alloc(Math.min(size, 2048), 7),
    });
  }

  const janeDocuments = await container.documentService.list(jane, {
    limit: 10,
    createdBy: "jane@acme.com",
  });
  const first = janeDocuments.items[0];
  if (first) {
    await container.documentService.uploadNewVersion(jane, first.id, {
      filename: first.originalFilename,
      mimeType: first.mimeType,
      size: 3072,
      body: Buffer.alloc(3072, 9),
    });
    await container.permissionService.grant(jane, first.id, {
      principalType: "user",
      principalId: "carlos@acme.com",
      level: "contributor",
    });
    await container.permissionService.grant(jane, first.id, {
      principalType: "role",
      principalId: "auditor",
      level: "viewer",
    });
    console.log("sample object key:", first.storageKey);
  }

  const carlosDocuments = await container.documentService.list(carlos, { limit: 10 });
  const trashTarget = carlosDocuments.items.find(
    (document) => document.createdBy === "carlos@acme.com" && document.folderId === null
  );
  if (trashTarget) await container.documentService.softDelete(carlos, trashTarget.id);

  const seeded = await tenants.list();
  console.log("seeded tenants:", seeded.map((tenant) => `${tenant.name} (${tenant.slug})`).join(", "));
}

void seed().then(() => {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`preview API listening on ${PORT} (script: ${path.basename(__filename)})`);
  });
});
