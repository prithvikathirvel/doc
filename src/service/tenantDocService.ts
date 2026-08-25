import { v4 as uuidv4 } from "uuid";
import { ForbiddenError, NotFoundError, ValidationError } from "../utils/errors";
import { isPlatformAdmin } from "../utils/roles";
import { AuthContext, Tenant, TenantDocConfig } from "./models";
import { TenantDocRepository, TenantRepository } from "./ports";
import {
  DOC_API_BASE_PLACEHOLDER,
  DOC_OPERATION_SUMMARIES,
  DocOperation,
  DocOperationSummary,
  isKnownOperation,
  resolveOperations,
} from "./docsCatalog";

/** Response of the builder: the saved config (if any) and the pickable catalogue. */
export interface TenantDocConfigResult {
  config: PublicTenantDocConfig | null;
  catalog: DocOperationSummary[];
}

/** A documentation config shaped for API responses (dates as ISO strings, no internal ids). */
export interface PublicTenantDocConfig {
  tenantId: string;
  shareToken: string;
  title: string;
  intro: string | null;
  apiBaseUrl: string | null;
  selectedOperations: string[];
  status: "active" | "disabled";
  createdAt: string;
  updatedAt: string;
}

/** Response of the public documentation page. */
export interface TenantDocPage {
  tenant: { name: string; slug: string | null; createdAt: string };
  title: string;
  intro: string | null;
  apiBaseUrl: string;
  generatedAt: string;
  operations: RenderedDocOperation[];
}

/** An operation enriched with its full (tenant-base) URL and a ready-to-run cURL. */
export type RenderedDocOperation = DocOperation & { url: string; curl: string };

/** Builds a cURL command from the rendered URL, auth headers and request body. */
function buildCurl(
  method: DocOperation["method"],
  url: string,
  headers: DocOperation["auth"],
  body?: string
): string {
  const lines = [`curl -X ${method} "${url}"`];
  for (const header of headers) {
    lines.push(`-H "${header.name}: ${header.value}"`);
  }
  if (body) {
    lines.push(`-H "content-type: application/json"`);
    lines.push(`-d '${body.replace(/'/g, `'\\''`)}'`);
  }
  return lines.join(" \\\n  ");
}

function normalizeBaseUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) return null;
  if (!/^https?:\/\//i.test(trimmed)) {
    throw new ValidationError("API base URL must start with http:// or https://");
  }
  return trimmed;
}

function publicConfig(config: TenantDocConfig): PublicTenantDocConfig {
  return {
    tenantId: config.tenantId,
    shareToken: config.shareToken,
    title: config.title,
    intro: config.intro,
    apiBaseUrl: config.apiBaseUrl,
    selectedOperations: config.selectedOperations,
    status: config.status,
    createdAt: config.createdAt.toISOString(),
    updatedAt: config.updatedAt.toISOString(),
  };
}

export class TenantDocService {
  constructor(
    private readonly tenants: TenantRepository,
    private readonly docs: TenantDocRepository
  ) {}

  /** Builder view: config plus the full catalogue the administrator can pick from. */
  async getConfig(auth: AuthContext, tenantId: string): Promise<TenantDocConfigResult> {
    await this.assertTenantMember(auth, tenantId);
    const config = await this.docs.findByTenant(tenantId);
    return { config: config ? publicConfig(config) : null, catalog: DOC_OPERATION_SUMMARIES };
  }

  /** Create or replace the documentation configuration (platform administrators). */
  async upsertConfig(
    auth: AuthContext,
    tenantId: string,
    input: {
      title?: string;
      intro?: string | null;
      apiBaseUrl?: string | null;
      selectedOperations?: string[];
      status?: "active" | "disabled";
    }
  ): Promise<PublicTenantDocConfig> {
    this.assertPlatformAdmin(auth, tenantId);
    const tenant = await this.requireTenant(tenantId);
    const existing = await this.docs.findByTenant(tenantId);

    const selectedOperations = this.normalizeSelection(input.selectedOperations);
    const now = new Date();
    const config: TenantDocConfig = {
      id: existing?.id || uuidv4(),
      tenantId,
      shareToken: existing?.shareToken || uuidv4(),
      title: (input.title?.trim() || tenant.name).slice(0, 255),
      intro: input.intro ? input.intro.trim().slice(0, 2000) : existing?.intro ?? null,
      apiBaseUrl: normalizeBaseUrl(input.apiBaseUrl ?? existing?.apiBaseUrl),
      selectedOperations,
      status: input.status === "disabled" ? "disabled" : "active",
      createdBy: existing?.createdBy || auth.userId,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
    const saved = await this.docs.upsert(config);
    return publicConfig(saved);
  }

  /** Partial update: toggle status, regenerate the share token, or amend fields. */
  async patchConfig(
    auth: AuthContext,
    tenantId: string,
    patch: {
      title?: string;
      intro?: string | null;
      apiBaseUrl?: string | null;
      selectedOperations?: string[];
      status?: "active" | "disabled";
      regenerateToken?: boolean;
    }
  ): Promise<PublicTenantDocConfig> {
    this.assertPlatformAdmin(auth, tenantId);
    const existing = await this.docs.findByTenant(tenantId);
    if (!existing) {
      throw new NotFoundError("No documentation has been generated for this workspace yet");
    }
    const now = new Date();
    const merged: TenantDocConfig = {
      ...existing,
      title: patch.title !== undefined ? (patch.title.trim() || existing.title).slice(0, 255) : existing.title,
      intro:
        patch.intro !== undefined
          ? patch.intro
            ? patch.intro.trim().slice(0, 2000)
            : null
          : existing.intro,
      apiBaseUrl:
        patch.apiBaseUrl !== undefined ? normalizeBaseUrl(patch.apiBaseUrl) : existing.apiBaseUrl,
      selectedOperations:
        patch.selectedOperations !== undefined ? this.normalizeSelection(patch.selectedOperations) : existing.selectedOperations,
      status: patch.status === "disabled" ? "disabled" : patch.status === "active" ? "active" : existing.status,
      shareToken: patch.regenerateToken ? uuidv4() : existing.shareToken,
      updatedAt: now,
    };
    const saved = await this.docs.upsert(merged);
    return publicConfig(saved);
  }

  /** Public: resolves a share token to the rendered documentation page. */
  async getPublicPage(shareToken: string): Promise<TenantDocPage> {
    const trimmed = shareToken.trim();
    if (!trimmed) throw new NotFoundError("Documentation not found");
    const config = await this.docs.findByToken(trimmed);
    if (!config || config.status !== "active") {
      throw new NotFoundError("Documentation not found");
    }
    const tenant = await this.requireTenant(config.tenantId);
    const baseUrl = config.apiBaseUrl || DOC_API_BASE_PLACEHOLDER;
    const operations: RenderedDocOperation[] = resolveOperations(config.selectedOperations).map(
      (operation) => {
        const url = `${baseUrl}/api${operation.path}`;
        return {
          ...operation,
          url,
          curl: buildCurl(operation.method, url, operation.auth, operation.bodyExample),
        };
      }
    );
    return {
      tenant: {
        name: tenant.name,
        slug: tenant.slug || null,
        createdAt: tenant.createdAt.toISOString(),
      },
      title: config.title,
      intro: config.intro,
      apiBaseUrl: baseUrl,
      generatedAt: new Date().toISOString(),
      operations,
    };
  }

  private normalizeSelection(ids: string[] | undefined): string[] {
    if (!ids) return [];
    const seen = new Set<string>();
    const result: string[] = [];
    for (const raw of ids) {
      const id = String(raw || "").trim();
      if (!id || seen.has(id) || !isKnownOperation(id)) continue;
      seen.add(id);
      result.push(id);
    }
    return result;
  }

  private async requireTenant(tenantId: string): Promise<Tenant> {
    const tenant = await this.tenants.findById(tenantId);
    if (!tenant) throw new NotFoundError("Workspace not found");
    return tenant;
  }

  private assertPlatformAdmin(auth: AuthContext, _tenantId: string): void {
    if (!isPlatformAdmin(auth.roles)) {
      throw new ForbiddenError("Only a platform administrator can manage developer documentation");
    }
  }

  /** Platform administrators, or any active member of the target workspace, may read. */
  private async assertTenantMember(auth: AuthContext, tenantId: string): Promise<void> {
    if (isPlatformAdmin(auth.roles)) return;
    if (auth.tenantId && auth.tenantId === tenantId) return;
    throw new ForbiddenError("You do not have access to this workspace");
  }
}
