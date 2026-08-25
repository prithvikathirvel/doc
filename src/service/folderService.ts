import { v4 as uuidv4 } from "uuid";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../utils/errors";
import { AuthContext, Folder } from "../service/models";
import { AuditLogger, FolderRepository, SubtreeDeletion, SubtreeSummary } from "../service/ports";
import { isTenantAdmin } from "../utils/roles";
import { parsePathSegments, storedPath } from "./folderPaths";

export class FolderService {
  constructor(
    private readonly folders: FolderRepository,
    private readonly audit?: AuditLogger
  ) {}

  async create(auth: AuthContext, input: { name: string; parentId?: string | null }): Promise<Folder> {
    const name = input.name?.trim();
    if (!name) throw new ValidationError("Folder name is required");
    const parentId = input.parentId ?? null;
    let parentPath = "";
    if (parentId) {
      const parent = await this.folders.findById(auth.tenantId, parentId);
      if (!parent) throw new NotFoundError("Parent folder not found");
      parentPath = parent.path;
    }
    const existing = await this.folders.findByParentAndName(auth.tenantId, parentId, name);
    if (existing) throw new ConflictError("A folder with this name already exists");
    const now = new Date();
    const folder: Folder = {
      id: uuidv4(),
      tenantId: auth.tenantId,
      parentId,
      name,
      path: parentPath ? `${parentPath}/${name}` : `/${name}`,
      createdBy: auth.userId,
      updatedBy: auth.userId,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    return this.folders.create(folder);
  }

  /**
   * Idempotent get-or-create for a whole path ("submissions/org-123/form-456").
   * Every missing segment is created; concurrent callers converge on one folder
   * because the database enforces UNIQUE (tenant_id, parent_id, name) — a loser
   * of that race re-reads instead of duplicating.
   */
  async ensurePath(
    auth: AuthContext,
    path: string
  ): Promise<{ folder: Folder; created: boolean }> {
    const segments = parsePathSegments(path);
    const target = storedPath(segments);
    const existing = await this.folders.findByPath(auth.tenantId, target);
    if (existing) return { folder: existing, created: false };

    let parentId: string | null = null;
    let currentPath = "";
    let created = false;
    let last: Folder | null = null;
    for (const segment of segments) {
      currentPath = currentPath ? `${currentPath}/${segment}` : `/${segment}`;
      let folder = await this.folders.findByParentAndName(auth.tenantId, parentId, segment);
      if (!folder) {
        const now = new Date();
        try {
          folder = await this.folders.create({
            id: uuidv4(),
            tenantId: auth.tenantId,
            parentId,
            name: segment,
            path: currentPath,
            createdBy: auth.userId,
            updatedBy: auth.userId,
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
          });
          created = true;
        } catch (error) {
          if (error instanceof ConflictError) {
            // Lost a create race (or a soft-deleted folder occupies the name).
            const raced = await this.folders.findByParentAndName(auth.tenantId, parentId, segment);
            if (!raced) throw error;
            folder = raced;
          } else {
            throw error;
          }
        }
      }
      last = folder;
      parentId = folder.id;
    }
    const folder =
      (await this.folders.findByPath(auth.tenantId, target)) ||
      last ||
      (parentId ? await this.folders.findById(auth.tenantId, parentId) : null);
    if (!folder) throw new NotFoundError("Folder path could not be ensured");
    return { folder, created };
  }

  /** Resolves a path to its folder without creating anything. */
  async resolvePath(auth: AuthContext, path: string): Promise<Folder> {
    const segments = parsePathSegments(path);
    const folder = await this.folders.findByPath(auth.tenantId, storedPath(segments));
    if (!folder) throw new NotFoundError("Folder not found");
    return folder;
  }

  async get(auth: AuthContext, folderId: string): Promise<Folder> {
    const folder = await this.folders.findById(auth.tenantId, folderId);
    if (!folder) throw new NotFoundError("Folder not found");
    return folder;
  }

  async list(auth: AuthContext, parentId?: string | null): Promise<Folder[]> {
    return this.folders.list(auth.tenantId, parentId);
  }

  async rename(auth: AuthContext, folderId: string, name: string): Promise<Folder> {
    const folder = await this.get(auth, folderId);
    const next = name.trim();
    if (!next) throw new ValidationError("Folder name is required");
    const existing = await this.folders.findByParentAndName(auth.tenantId, folder.parentId, next);
    if (existing && existing.id !== folder.id) {
      throw new ConflictError("A folder with this name already exists");
    }
    const parentPath = folder.path.substring(0, folder.path.lastIndexOf("/")) || "";
    folder.name = next;
    folder.path = parentPath ? `${parentPath}/${next}` : `/${next}`;
    folder.updatedAt = new Date();
    folder.updatedBy = auth.userId;
    return this.folders.update(folder);
  }

  /**
   * What a recursive delete would affect. The UI shows this in the confirmation
   * step so nobody deletes a tree without seeing its contents first.
   */
  async summarize(auth: AuthContext, folderId: string): Promise<{ folder: Folder } & SubtreeSummary> {
    const folder = await this.get(auth, folderId);
    const summary = await this.folders.summarizeSubtree(auth.tenantId, folder);
    return { folder, ...summary };
  }

  /**
   * Deletes a folder together with its sub-folders and their documents.
   * Documents are moved to trash, so the operation stays recoverable.
   */
  async remove(auth: AuthContext, folderId: string): Promise<{ folder: Folder } & SubtreeDeletion> {
    const folder = await this.get(auth, folderId);
    this.assertCanDelete(auth, folder);

    const result = await this.folders.softDeleteSubtree(auth.tenantId, folder, auth.userId);

    await this.audit?.record({
      tenantId: auth.tenantId,
      actorId: auth.userId,
      action: "folder.delete_subtree",
      resourceType: "folder",
      resourceId: folder.id,
      success: true,
      details: {
        path: folder.path,
        foldersDeleted: result.foldersDeleted,
        documentsTrashed: result.documentsTrashed,
      },
    });

    return { folder, ...result };
  }

  private assertCanDelete(auth: AuthContext, folder: Folder): void {
    if (isTenantAdmin(auth.roles) || folder.createdBy === auth.userId) return;
    throw new ForbiddenError("Only the folder owner or a tenant administrator can delete this folder");
  }
}
