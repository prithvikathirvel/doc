import { v4 as uuidv4 } from "uuid";
import { ConflictError, NotFoundError, ValidationError } from "../utils/errors";
import { AuthContext, Folder } from "../service/models";
import { FolderRepository } from "../service/ports";

export class FolderService {
  constructor(private readonly folders: FolderRepository) {}

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

  async remove(auth: AuthContext, folderId: string): Promise<void> {
    await this.get(auth, folderId);
    await this.folders.softDelete(auth.tenantId, folderId);
  }
}
