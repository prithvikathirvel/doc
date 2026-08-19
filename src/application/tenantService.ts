import { v4 as uuidv4 } from "uuid";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../domain/exceptions";
import { AuthContext, ProviderType, Tenant, TenantStorageConfig } from "../domain/models";
import { TenantRepository } from "../domain/ports";
import { StorageResolver } from "./storageResolver";

const PROVIDERS: ProviderType[] = ["s3", "minio", "gcp", "azure"];

export class TenantService {
  constructor(
    private readonly tenants: TenantRepository,
    private readonly resolver: StorageResolver
  ) {}

  async create(input: {
    name: string;
    slug: string;
    maxFileSizeBytes?: number;
    allowedMimeTypes?: string[] | null;
  }): Promise<Tenant> {
    const slug = slugify(input.slug || input.name);
    if (!input.name?.trim()) throw new ValidationError("Tenant name is required");
    const existing = await this.tenants.findBySlug(slug);
    if (existing) throw new ConflictError("Tenant slug already exists");
    const now = new Date();
    return this.tenants.create({
      id: uuidv4(),
      name: input.name.trim(),
      slug,
      status: "active",
      maxFileSizeBytes: input.maxFileSizeBytes ?? 50 * 1024 * 1024,
      allowedMimeTypes: input.allowedMimeTypes ?? null,
      createdAt: now,
      updatedAt: now,
    });
  }

  async get(id: string): Promise<Tenant> {
    const tenant = await this.tenants.findById(id);
    if (!tenant) throw new NotFoundError("Tenant not found");
    return tenant;
  }

  async list(): Promise<Tenant[]> {
    return this.tenants.list();
  }

  async configureStorage(
    auth: AuthContext,
    tenantId: string,
    input: {
      provider: ProviderType;
      container: string;
      region?: string;
      endpoint?: string;
      accessKeyRef?: string;
      secretKeyRef?: string;
      sessionTokenRef?: string;
      projectId?: string;
      accountName?: string;
      credentialsJsonRef?: string;
      basePrefix?: string;
      useSsl?: boolean;
      signedUrlTtlSeconds?: number;
    }
  ): Promise<TenantStorageConfig> {
    this.assertAdmin(auth);
    if (auth.tenantId !== tenantId && !auth.roles.includes("platform_admin")) {
      throw new ForbiddenError("Cannot configure another tenant");
    }
    if (!PROVIDERS.includes(input.provider)) {
      throw new ValidationError(`Unsupported provider. Use one of: ${PROVIDERS.join(", ")}`);
    }
    if (!input.container?.trim()) throw new ValidationError("container is required");
    await this.get(tenantId);
    const existing = await this.tenants.getStorageConfig(tenantId);
    const now = new Date();
    const config: TenantStorageConfig = {
      id: existing?.id || uuidv4(),
      tenantId,
      provider: input.provider,
      container: input.container.trim(),
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
    };
    const saved = await this.tenants.upsertStorageConfig(config);
    this.resolver.clear(tenantId);
    return sanitizeConfig(saved);
  }

  async getStorageConfig(auth: AuthContext, tenantId: string): Promise<TenantStorageConfig | null> {
    if (auth.tenantId !== tenantId && !auth.roles.includes("platform_admin")) {
      throw new ForbiddenError("Cannot view another tenant configuration");
    }
    const config = await this.tenants.getStorageConfig(tenantId);
    return config ? sanitizeConfig(config) : null;
  }

  private assertAdmin(auth: AuthContext): void {
    if (!auth.roles.includes("tenant_admin") && !auth.roles.includes("admin") && !auth.roles.includes("platform_admin")) {
      throw new ForbiddenError("Tenant admin role required");
    }
  }
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function sanitizeConfig(config: TenantStorageConfig): TenantStorageConfig {
  return { ...config };
}
