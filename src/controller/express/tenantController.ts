import { NextFunction, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { container } from "../../config/container";
import { TenantMemberRole } from "../../service/models";
import { BadRequestError, ForbiddenError, NotFoundError, ValidationError } from "../../utils/errors";
import {
  createTenantSchema,
  resolveWorkspaceSchema,
  storageConfigSchema,
  updateTenantSchema,
} from "../../validator/documentSchemas";
import { PROVIDER_SPECS } from "../../service/storageConfig";
import { isTenantAdmin, mapUserServiceRoles } from "../../utils/roles";

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
    const tenantId = await container.tenantService.resolveCurrentTenantId(req.auth, req.auth.tenantId);
    const tenant = await container.tenantService.getForAuth(req.auth, tenantId);
    const storage = await container.tenantService.getStorageConfig(req.auth, tenantId);
    res.json({ tenant, storage });
  } catch (err) {
    next(err);
  }
}

export async function listMine(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const rows = await container.tenantService.listMine(req.auth);
    res.json({
      tenants: rows.map(({ tenant, role }) => ({
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        status: tenant.status,
        role,
      })),
    });
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

export async function listTenantUsers(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const users = await container.tenantService.listUsers(req.auth, req.params.id);
    const memberships =
      req.auth.authSource === "keycloak" ? await container.tenantMemberships.listByTenant(req.params.id) : [];
    const membershipByUser = new Map(memberships.map((membership) => [membership.userId, membership]));

    // Central directory data is an enrichment only: document activity remains
    // owned by DMS and a temporary User Service outage does not erase it.
    let appUsers: Awaited<ReturnType<typeof container.userManagementClient.listUsersWithRoles>> = [];
    try {
      appUsers = await container.userManagementClient.listUsersWithRoles();
    } catch {
      appUsers = [];
    }
    const appUsersById = new Map(appUsers.map((item) => [item.user.userId, item]));
    const enriched = users.map((user) => {
      const directory = appUsersById.get(user.userId);
      const membership = membershipByUser.get(user.userId);
      const mappedRole = membership?.role || mapUserServiceRoles(directory?.roles)[0];
      return {
        ...user,
        email: directory?.user.email || membership?.email || undefined,
        username: directory?.user.username || undefined,
        firstName: directory?.user.firstName,
        lastName: directory?.user.lastName,
        role: mappedRole,
      };
    });
    res.json({ users: enriched });
  } catch (err) {
    next(err);
  }
}

export async function addTenantUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const tenant = await container.tenantService.getForAuth(req.auth, req.params.id);
    if (!isTenantAdmin(req.auth.roles)) throw new ForbiddenError("Tenant administrator role required");

    const userId = typeof req.body?.userId === "string" ? req.body.userId.trim() : "";
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const roleId = typeof req.body?.roleId === "string" ? req.body.roleId.trim() : "";
    if (!roleId || (!userId && !email)) {
      throw new BadRequestError("userId or email and roleId are required");
    }
    const user = userId
      ? await container.userManagementClient.getUser(userId)
      : await container.userManagementClient.findByEmail(email);
    if (!user) throw new NotFoundError("User was not found in the User Management Service");

    const role = toTenantMemberRole(req.body?.role);
    // The external role is assigned before the local membership is committed so
    // DMS never advertises a membership the central RBAC service rejected.
    await container.userManagementClient.assignRole(user.userId, roleId);
    const now = new Date();
    const membership = await container.tenantMemberships.upsert({
      id: uuidv4(),
      tenantId: tenant.id,
      userId: user.userId,
      email: user.email || email || null,
      role,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    res.status(201).json({ membership });
  } catch (err) {
    next(err);
  }
}

export async function updateTenantUserRole(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await container.tenantService.getForAuth(req.auth, req.params.id);
    if (!isTenantAdmin(req.auth.roles)) throw new ForbiddenError("Tenant administrator role required");
    const roleId = typeof req.body?.roleId === "string" ? req.body.roleId.trim() : "";
    if (!roleId) throw new BadRequestError("roleId is required");
    await container.userManagementClient.updateRole(req.params.userId, roleId);
    const membership = await container.tenantMemberships.updateRole(
      req.params.userId,
      req.params.id,
      toTenantMemberRole(req.body?.role)
    );
    if (!membership) throw new NotFoundError("Tenant membership not found");
    res.json({ membership });
  } catch (err) {
    next(err);
  }
}

function toTenantMemberRole(value: unknown): TenantMemberRole {
  const normalized = typeof value === "string" ? value.trim().toLowerCase().replace(/[\s-]+/g, "_") : "member";
  return normalized === "tenant_admin" || normalized === "admin" ? "tenant_admin" : "member";
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
