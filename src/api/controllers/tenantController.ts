import { NextFunction, Request, Response } from "express";
import { container } from "../../config/container";
import { ForbiddenError, ValidationError } from "../../domain/exceptions";
import { createTenantSchema, storageConfigSchema } from "../schemas/documentSchemas";

export async function createTenant(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.auth.roles.includes("platform_admin") && !req.auth.roles.includes("admin")) {
      throw new ForbiddenError("platform_admin role required");
    }
    const { error, value } = createTenantSchema.validate(req.body);
    if (error) throw new ValidationError(error.message);
    const tenant = await container.tenantService.create(value);
    res.status(201).json({ tenant });
  } catch (err) {
    next(err);
  }
}

export async function listTenants(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.auth.roles.includes("platform_admin") && !req.auth.roles.includes("admin")) {
      throw new ForbiddenError("platform_admin role required");
    }
    const tenants = await container.tenantService.list();
    res.json({ tenants });
  } catch (err) {
    next(err);
  }
}

export async function getCurrentTenant(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const tenant = await container.tenantService.get(req.auth.tenantId);
    const storage = await container.tenantService.getStorageConfig(req.auth, req.auth.tenantId);
    res.json({ tenant, storage });
  } catch (err) {
    next(err);
  }
}

export async function getTenant(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const tenant = await container.tenantService.get(req.params.id);
    const storage = await container.tenantService.getStorageConfig(req.auth, req.params.id);
    res.json({ tenant, storage });
  } catch (err) {
    next(err);
  }
}

export async function upsertStorageConfig(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { error, value } = storageConfigSchema.validate(req.body);
    if (error) throw new ValidationError(error.message);
    const storage = await container.tenantService.configureStorage(req.auth, req.params.id, value);
    res.json({ storage });
  } catch (err) {
    next(err);
  }
}
