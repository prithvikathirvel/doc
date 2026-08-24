import { NextFunction, Request, Response } from "express";
import { container } from "../../config/container";
import { ValidationError } from "../../utils/errors";
import {
  addMemberSchema,
  createApiKeySchema,
  signupSchema,
  updateApiKeySchema,
  updateMemberSchema,
} from "../../validator/authSchemas";

function validate<T>(
  schema: { validate: (value: unknown, options?: object) => { error?: { message: string }; value: T } },
  payload: unknown
): T {
  const { error, value } = schema.validate(payload, { abortEarly: true, stripUnknown: false });
  if (error) throw new ValidationError(error.message.replace(/"/g, ""));
  return value;
}

/** GET /api/tenants/:id/members — the workspace membership directory. */
export async function listMembers(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const members = await container.authService.listMembers(req.auth, String(req.params.id));
    res.json({ members });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/tenants/:id/members — attach an existing account to a workspace and
 * claim any legacy activity recorded under the user's earlier x-user-id values.
 */
export async function addMember(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const payload = validate(addMemberSchema, req.body);
    const result = await container.authService.addMember(req.auth, String(req.params.id), payload);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

/** PATCH /api/tenants/:id/members/:userId — change role or suspend membership. */
export async function updateMember(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const payload = validate(updateMemberSchema, req.body);
    const membership = await container.authService.updateMember(
      req.auth,
      String(req.params.id),
      String(req.params.userId),
      payload
    );
    res.json({ membership });
  } catch (err) {
    next(err);
  }
}

/** DELETE /api/tenants/:id/members/:userId — remove the membership. */
export async function removeMember(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await container.authService.removeMember(
      req.auth,
      String(req.params.id),
      String(req.params.userId)
    );
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/users — create the account in the identity provider and optionally
 * attach it to a workspace in one step.
 */
export async function createUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const payload = validate(signupSchema, req.body);
    const result = await container.authService.createUser(req.auth, {
      email: payload.email,
      password: payload.password,
      username: payload.username || undefined,
      firstName: payload.firstName || undefined,
      lastName: payload.lastName || undefined,
      phone: payload.phone || undefined,
      gender: payload.gender || undefined,
      address: payload.address || undefined,
      additionalDetails: payload.additionalDetails,
      tenantId: payload.tenantId,
      role: payload.role,
      claimAliases: payload.claimAliases,
    });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

/** GET /api/api-keys */
export async function listApiKeys(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const keys = await container.authService.listApiKeys(req.auth);
    res.json({ apiKeys: keys });
  } catch (err) {
    next(err);
  }
}

/** POST /api/api-keys — returns the full key exactly once. */
export async function createApiKey(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const payload = validate(createApiKeySchema, req.body);
    const created = await container.authService.createApiKey(req.auth, {
      displayName: payload.displayName,
      tenantId: payload.tenantId ?? null,
      roles: payload.roles,
      expiresAt: payload.expiresAt ?? null,
    });
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
}

/** PATCH /api/api-keys/:id — enable or disable. */
export async function updateApiKey(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const payload = validate(updateApiKeySchema, req.body);
    await container.authService.updateApiKey(req.auth, String(req.params.id), payload.status);
    res.json({ message: `API key ${payload.status}` });
  } catch (err) {
    next(err);
  }
}

/** DELETE /api/api-keys/:id */
export async function deleteApiKey(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await container.authService.deleteApiKey(req.auth, String(req.params.id));
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
