import { NextFunction, Request, Response } from "express";
import { container } from "../../config/container";
import { ValidationError } from "../../utils/errors";
import {
  createTenantSchema,
  resolveWorkspaceSchema,
  storageConfigSchema,
  updateTenantSchema,
} from "../../validator/documentSchemas";
import { PROVIDER_SPECS } from "../../service/storageConfig";

function validate<T>(
  schema: { validate: (value: unknown, options?: object) => { error?: { message: string }; value: T } },
  payload: unknown
): T {
  const { error, value } = schema.validate(payload, { abortEarly: true, stripUnknown: false });
  if (error) throw new ValidationError(error.message.replace(/"/g, ""));
  return value;
}

export async function createTenant(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const payload = validate(createTenantSchema, req.body);
    const result = await container.tenantService.create(req.auth, payload);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

export async function listTenants(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const tenants = await container.tenantService.list(req.auth);
    res.json({ tenants });
  } catch (err) {
    next(err);
  }
}

export async function getCurrentTenant(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const tenant = await container.tenantService.getForAuth(req.auth, req.auth.tenantId);
    const storage = await container.tenantService.getStorageConfig(req.auth, req.auth.tenantId);
    res.json({ tenant, storage });
  } catch (err) {
    next(err);
  }
}

export async function getTenant(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const tenant = await container.tenantService.getForAuth(req.auth, req.params.id);
    const storage = await container.tenantService.getStorageConfig(req.auth, req.params.id);
    res.json({ tenant, storage });
  } catch (err) {
    next(err);
  }
}

export async function updateTenant(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const payload = validate(updateTenantSchema, req.body);
    const tenant = await container.tenantService.update(req.auth, req.params.id, payload);
    res.json({ tenant });
  } catch (err) {
    next(err);
  }
}

export async function getTenantAnalytics(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const analytics = await container.tenantService.getAnalytics(req.auth, req.params.id);
    res.json({ analytics });
  } catch (err) {
    next(err);
  }
}

export async function upsertStorageConfig(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const payload = validate(storageConfigSchema, req.body);
    const storage = await container.tenantService.configureStorage(req.auth, req.params.id, payload);
    res.json({ storage });
  } catch (err) {
    next(err);
  }
}

/** Describes the fields each storage provider needs, so clients stay in sync with the API. */
export function listStorageProviders(_req: Request, res: Response): void {
  res.json({
    providers: Object.values(PROVIDER_SPECS).map((spec) => ({
      provider: spec.provider,
      label: spec.label,
      fields: spec.fields,
    })),
  });
}

/** Unauthenticated: turns a workspace slug typed on the sign-in screen into a tenant id. */
export async function resolveWorkspace(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const payload = validate(resolveWorkspaceSchema, req.body);
    const result = await container.tenantService.resolveWorkspace(payload.workspace, payload.user);
    res.json(result);
  } catch (err) {
    next(err);
  }
}
