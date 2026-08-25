import { NextFunction, Request, Response } from "express";
import { container } from "../../config/container";
import { ValidationError } from "../../utils/errors";
import { folderMapsSaveSchema } from "../../validator/documentSchemas";

/** GET /folders/maps — the tenant's path templates (readable by every member). */
export async function listFolderMaps(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const tenantId = req.auth.tenantId;
    const maps = await container.folderMapService.list(req.auth, tenantId);
    res.json({ maps });
  } catch (err) {
    next(err);
  }
}

/** PUT /folders/maps — replace the tenant's set of maps (workspace administrators). */
export async function saveFolderMaps(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { error, value } = folderMapsSaveSchema.validate(req.body);
    if (error) throw new ValidationError(error.message.replace(/"/g, ""));
    const maps = await container.folderMapService.save(req.auth, req.auth.tenantId, value);
    res.json({ maps });
  } catch (err) {
    next(err);
  }
}
