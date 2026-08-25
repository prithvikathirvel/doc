import { NextFunction, Request, Response } from "express";
import { container } from "../../config/container";
import { ValidationError } from "../../utils/errors";
import {
  createFolderSchema,
  folderEnsureSchema,
  updateFolderSchema,
} from "../../validator/documentSchemas";

export async function createFolder(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { error, value } = createFolderSchema.validate(req.body);
    if (error) throw new ValidationError(error.message);
    const folder = await container.folderService.create(req.auth, value);
    res.status(201).json({ folder });
  } catch (err) {
    next(err);
  }
}

/**
 * Idempotent get-or-create of a whole folder path. Applications call this
 * before (or instead of) navigating the tree: every missing segment is created
 * and concurrent callers converge on the same folder.
 */
export async function ensureFolder(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { error, value } = folderEnsureSchema.validate(req.body);
    if (error) throw new ValidationError(error.message);
    const result = await container.folderService.ensurePath(req.auth, value.path);
    res.status(200).json({ folder: result.folder, created: result.created });
  } catch (err) {
    next(err);
  }
}

/** Resolves a folder path to its folder record without creating anything. */
export async function resolveFolder(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const path = String(req.query.path || "");
    if (!path) throw new ValidationError("path query parameter is required");
    const folder = await container.folderService.resolvePath(req.auth, path);
    res.json({ folder });
  } catch (err) {
    next(err);
  }
}

export async function listFolders(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parentId = req.query.parentId === "null" ? null : (req.query.parentId as string | undefined);
    const folders = await container.folderService.list(req.auth, parentId);
    res.json({ folders });
  } catch (err) {
    next(err);
  }
}

export async function getFolder(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const folder = await container.folderService.get(req.auth, req.params.id);
    res.json({ folder });
  } catch (err) {
    next(err);
  }
}

export async function updateFolder(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { error, value } = updateFolderSchema.validate(req.body);
    if (error) throw new ValidationError(error.message);
    const folder = await container.folderService.rename(req.auth, req.params.id, value.name);
    res.json({ folder });
  } catch (err) {
    next(err);
  }
}

/** What a recursive delete would affect, used by the confirmation dialog. */
export async function getFolderSummary(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const summary = await container.folderService.summarize(req.auth, req.params.id);
    res.json(summary);
  } catch (err) {
    next(err);
  }
}

export async function deleteFolder(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await container.folderService.remove(req.auth, req.params.id);
    res.json({
      folder: result.folder,
      deleted: {
        folders: result.foldersDeleted,
        documents: result.documentsTrashed,
        bytes: result.bytes,
      },
    });
  } catch (err) {
    next(err);
  }
}
