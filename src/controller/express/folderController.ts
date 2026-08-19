import { NextFunction, Request, Response } from "express";
import { container } from "../../config/container";
import { ValidationError } from "../../utils/errors";
import { createFolderSchema, updateFolderSchema } from "../../validator/documentSchemas";

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

export async function deleteFolder(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await container.folderService.remove(req.auth, req.params.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
