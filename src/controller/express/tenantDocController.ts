import { NextFunction, Request, Response } from "express";
import { container } from "../../config/container";
import { ValidationError } from "../../utils/errors";
import { tenantDocConfigSchema } from "../../validator/documentSchemas";

function validate<T>(payload: unknown): T {
  const { error, value } = tenantDocConfigSchema.validate(payload, { abortEarly: true, stripUnknown: false });
  if (error) throw new ValidationError(error.message.replace(/"/g, ""));
  return value as T;
}

/** Builder view: the saved configuration plus the pickable operation catalogue. */
export async function getTenantDocsConfig(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await container.tenantDocService.getConfig(req.auth, req.params.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

/** Create or replace the documentation configuration (platform administrators). */
export async function upsertTenantDocsConfig(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const payload = validate<{
      title?: string;
      intro?: string | null;
      apiBaseUrl?: string | null;
      selectedOperations?: string[];
      status?: "active" | "disabled";
    }>(req.body);
    const config = await container.tenantDocService.upsertConfig(req.auth, req.params.id, payload);
    res.status(200).json({ config });
  } catch (err) {
    next(err);
  }
}

/** Partial update: toggle status, regenerate the share token, amend fields. */
export async function patchTenantDocsConfig(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const payload = validate<{
      title?: string;
      intro?: string | null;
      apiBaseUrl?: string | null;
      selectedOperations?: string[];
      status?: "active" | "disabled";
      regenerateToken?: boolean;
    }>(req.body);
    const config = await container.tenantDocService.patchConfig(req.auth, req.params.id, payload);
    res.json({ config });
  } catch (err) {
    next(err);
  }
}

/** Public: renders the documentation page for a share token. No authentication. */
export async function getPublicDocs(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const page = await container.tenantDocService.getPublicPage(req.params.token);
    res.json(page);
  } catch (err) {
    next(err);
  }
}
