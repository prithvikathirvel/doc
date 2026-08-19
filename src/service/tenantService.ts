import { v4 as uuidv4 } from "uuid";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../utils/errors";
import {
  AuthContext,
  Tenant,
  TenantAnalytics,
  TenantStatus,
  TenantStorageConfig,
} from "../service/models";
import { AnalyticsRepository, TenantRepository } from "../service/ports";
import { isPlatformAdmin, isTenantAdmin } from "../utils/roles";
import { StorageResolver } from "./storageResolver";
import { StorageConfigInput, normalizeStorageConfig } from "./storageConfig";

const MIN_FILE_SIZE_BYTES = 1024; // 1 KB
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024 * 1024; // 5 GB
const MIME_PATTERN = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+*-]*$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export interface CreateTenantInput {
  name: string;
  slug?: string;
  ownerName?: string | null;
  ownerEmail?: string | null;
  maxFileSizeBytes?: number;
  allowedMimeTypes?: string[] | null;
  storage?: StorageConfigInput;
}

export interface UpdateTenantInput {
  name?: string;
  status?: TenantStatus;
  ownerName?: string | null;
  ownerEmail?: string | null;
  maxFileSizeBytes?: number;
  allowedMimeTypes?: string[] | null;
}

export class TenantService {
  constructor(
    private readonly tenants: TenantRepository,
    private readonly resolver: StorageResolver,
    private readonly analytics?: AnalyticsRepository
  ) {}

  /**
   * Onboards a tenant. When a storage configuration is supplied it is validated
   * before the tenant row is written, so onboarding never half-succeeds.
   */
  async create(
    auth: AuthContext,
    input: CreateTenantInput
  ): Promise<{ tenant: Tenant; storage: TenantStorageConfig | null }> {
    this.assertPlatformAdmin(auth);

    const name = (input.name || "").trim();
    if (!name) throw new ValidationError("Tenant name is required");
    if (name.length > 255) throw new ValidationError("Tenant name must be 255 characters or fewer");

    const slug = slugify(input.slug || name);
    if (!slug) throw new ValidationError("Tenant slug could not be derived from the name");
    if (slug.length > 100) throw new ValidationError("Tenant slug must be 100 characters or fewer");
    if (await this.tenants.findBySlug(slug)) {
      throw new ConflictError(`The workspace URL "${slug}" is already taken`);
    }

    const storageInput = input.storage ? normalizeStorageConfig(input.storage) : null;
    const ownerEmail = normalizeEmail(input.ownerEmail);
    const ownerName = trimOrNull(input.ownerName);
    const maxFileSizeBytes = normalizeMaxFileSize(input.maxFileSizeBytes);
    const allowedMimeTypes = normalizeMimeTypes(input.allowedMimeTypes);

    const now = new Date();
    const tenant = await this.tenants.create({
      id: uuidv4(),
      name,
      slug,
      status: "active",
      ownerName,
      ownerEmail,
      maxFileSizeBytes,
      allowedMimeTypes,
      createdAt: now,
      updatedAt: now,
    });

    let storage: TenantStorageConfig | null = null;
    if (storageInput) {
      storage = await this.saveStorageConfig(tenant.id, storageInput);
    }
    return { tenant, storage };
  }

  async update(auth: AuthContext, tenantId: string, input: UpdateTenantInput): Promise<Tenant> {
    const tenant = await this.get(tenantId);
    this.assertTenantAccess(auth, tenantId);
    if (input.status !== undefined && !isPlatformAdmin(auth.roles)) {
      throw new ForbiddenError("Only a platform administrator can change the tenant status");
    }
    if (!isTenantAdmin(auth.roles)) {
      throw new ForbiddenError("Tenant administrator role required");
    }

    const next: Tenant = { ...tenant };
    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name) throw new ValidationError("Tenant name is required");
      next.name = name;
    }
    if (input.status !== undefined) {
      if (input.status !== "active" && input.status !== "suspended") {
        throw new ValidationError("Status must be active or suspended");
      }
      next.status = input.status;
    }
    if (input.ownerName !== undefined) next.ownerName = trimOrNull(input.ownerName);
    if (input.ownerEmail !== undefined) next.ownerEmail = normalizeEmail(input.ownerEmail);
    if (input.maxFileSizeBytes !== undefined) {
      next.maxFileSizeBytes = normalizeMaxFileSize(input.maxFileSizeBytes);
    }
    if (input.allowedMimeTypes !== undefined) {
      next.allowedMimeTypes = normalizeMimeTypes(input.allowedMimeTypes);
    }
    next.updatedAt = new Date();
    return this.tenants.update(next);
  }

  async get(id: string): Promise<Tenant> {
    const tenant = await this.tenants.findById(id);
    if (!tenant) throw new NotFoundError("Tenant not found");
    return tenant;
  }

  /** Reads a tenant on behalf of a caller, enforcing tenant isolation. */
  async getForAuth(auth: AuthContext, tenantId: string): Promise<Tenant> {
    this.assertTenantAccess(auth, tenantId);
    return this.get(tenantId);
  }

  async list(auth: AuthContext): Promise<Tenant[]> {
    this.assertPlatformAdmin(auth);
    return this.tenants.list();
  }

  /**
   * Resolves a workspace slug or id for a sign-in screen and decides which roles the
   * given user gets. The registered workspace owner signs in as a tenant administrator,
   * everyone else as a member.
   */
  async resolveWorkspace(
    reference: string,
    user?: string
  ): Promise<{
    workspace: { id: string; name: string; slug: string; status: TenantStatus };
    roles: string[];
  }> {
    const value = (reference || "").trim();
    if (!value) throw new ValidationError("Workspace name is required");
    const tenant = (await this.tenants.findBySlug(slugify(value))) || (await this.tenants.findById(value));
    if (!tenant) throw new NotFoundError("Workspace not found");
    const identifier = (user || "").trim().toLowerCase();
    const isOwner = Boolean(tenant.ownerEmail && identifier && tenant.ownerEmail === identifier);
    return {
      workspace: { id: tenant.id, name: tenant.name, slug: tenant.slug, status: tenant.status },
      roles: isOwner ? ["tenant_admin"] : ["member"],
    };
  }

  async configureStorage(
    auth: AuthContext,
    tenantId: string,
    input: StorageConfigInput
  ): Promise<TenantStorageConfig> {
    this.assertTenantAccess(auth, tenantId);
    if (!isTenantAdmin(auth.roles)) {
      throw new ForbiddenError("Tenant administrator role required");
    }
    await this.get(tenantId);
    return this.saveStorageConfig(tenantId, normalizeStorageConfig(input));
  }

  async getStorageConfig(auth: AuthContext, tenantId: string): Promise<TenantStorageConfig | null> {
    this.assertTenantAccess(auth, tenantId);
    return this.tenants.getStorageConfig(tenantId);
  }

  /** Tenant-wide usage. Restricted to administrators: members only see their own documents. */
  async getAnalytics(auth: AuthContext, tenantId: string): Promise<TenantAnalytics> {
    this.assertTenantAccess(auth, tenantId);
    if (!isTenantAdmin(auth.roles)) {
      throw new ForbiddenError("Tenant administrator role required to read analytics");
    }
    if (!this.analytics) {
      throw new NotFoundError("Analytics are not available on this deployment");
    }
    await this.get(tenantId);
    return this.analytics.tenantAnalytics(tenantId);
  }

  private async saveStorageConfig(
    tenantId: string,
    input: StorageConfigInput
  ): Promise<TenantStorageConfig> {
    const existing = await this.tenants.getStorageConfig(tenantId);
    const now = new Date();
    const saved = await this.tenants.upsertStorageConfig({
      id: existing?.id || uuidv4(),
      tenantId,
      provider: input.provider,
      container: input.container,
      region: input.region,
      endpoint: input.endpoint,
      accessKeyRef: input.accessKeyRef,
      secretKeyRef: input.secretKeyRef,
      sessionTokenRef: input.sessionTokenRef,
      projectId: input.projectId,
      accountName: input.accountName,
      credentialsJsonRef: input.credentialsJsonRef,
      basePrefix: input.basePrefix,
      useSsl: input.useSsl !== false,
      signedUrlTtlSeconds: input.signedUrlTtlSeconds ?? 900,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    });
    this.resolver.clear(tenantId);
    return saved;
  }

  private assertPlatformAdmin(auth: AuthContext): void {
    if (!isPlatformAdmin(auth.roles)) {
      throw new ForbiddenError("Platform administrator role required");
    }
  }

  private assertTenantAccess(auth: AuthContext, tenantId: string): void {
    if (isPlatformAdmin(auth.roles)) return;
    if (auth.tenantId && auth.tenantId === tenantId) return;
    throw new ForbiddenError("You do not have access to this tenant");
  }
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function trimOrNull(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeEmail(value: string | null | undefined): string | null {
  const email = trimOrNull(value);
  if (!email) return null;
  if (!EMAIL_PATTERN.test(email)) throw new ValidationError("Owner email address is not valid");
  return email.toLowerCase();
}

function normalizeMaxFileSize(value: number | undefined): number {
  if (value === undefined) return 50 * 1024 * 1024;
  if (!Number.isInteger(value) || value < MIN_FILE_SIZE_BYTES || value > MAX_FILE_SIZE_BYTES) {
    throw new ValidationError("Maximum file size must be between 1 KB and 5 GB");
  }
  return value;
}

function normalizeMimeTypes(value: string[] | null | undefined): string[] | null {
  if (value === null || value === undefined) return null;
  const types = value.map((type) => type.trim().toLowerCase()).filter(Boolean);
  if (types.length === 0) return null;
  for (const type of types) {
    if (!MIME_PATTERN.test(type)) {
      throw new ValidationError(`"${type}" is not a valid MIME type`);
    }
  }
  return [...new Set(types)];
}
