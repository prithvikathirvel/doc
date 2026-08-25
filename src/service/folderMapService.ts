import { v4 as uuidv4 } from "uuid";
import { ForbiddenError, NotFoundError, ValidationError } from "../utils/errors";
import { isPlatformAdmin, isTenantAdmin } from "../utils/roles";
import { AuthContext, FolderMap } from "./models";
import { FolderMapRepository } from "./ports";
import { parseTemplate, resolveTemplate } from "./folderPaths";

const KEY_PATTERN = /^[a-z0-9][a-z0-9_-]{0,99}$/;

/**
 * Tenant-defined folder maps: named path templates ("submissions" →
 * "submissions/{orgId}/{formId}") that applications reference instead of
 * folder ids. The map key is the stable integration contract; the DMS
 * resolves the template and ensures the resulting path.
 */
export class FolderMapService {
  constructor(private readonly maps: FolderMapRepository) {}

  /** Maps are readable by every member of the workspace (their apps need them to file). */
  async list(auth: AuthContext, tenantId: string): Promise<FolderMap[]> {
    this.assertMember(auth, tenantId);
    return this.maps.listByTenant(tenantId);
  }

  /** Replaces the tenant's set of maps (workspace or platform administrators). */
  async save(
    auth: AuthContext,
    tenantId: string,
    input: { maps: Array<{ key: string; pathTemplate: string; description?: string | null; status?: "active" | "disabled" }> }
  ): Promise<FolderMap[]> {
    this.assertManager(auth, tenantId);
    if (!Array.isArray(input.maps)) throw new ValidationError("maps must be an array");

    const seen = new Set<string>();
    const entries = input.maps.map((entry) => {
      const key = String(entry.key ?? "").trim().toLowerCase();
      if (!KEY_PATTERN.test(key)) {
        throw new ValidationError(
          'Map keys may only contain lowercase letters, numbers, "-" and "_" (e.g. "submissions")'
        );
      }
      if (seen.has(key)) throw new ValidationError(`Duplicate map key "${key}"`);
      seen.add(key);
      const pathTemplate = String(entry.pathTemplate ?? "").trim();
      parseTemplate(pathTemplate); // throws on invalid templates
      const description = entry.description ? String(entry.description).trim().slice(0, 500) : null;
      return {
        key,
        pathTemplate,
        description: description || null,
        status: entry.status === "disabled" ? ("disabled" as const) : ("active" as const),
      };
    });

    const now = new Date();
    for (const entry of entries) {
      await this.maps.upsert({
        id: uuidv4(),
        tenantId,
        key: entry.key,
        pathTemplate: entry.pathTemplate,
        description: entry.description,
        status: entry.status,
        createdBy: auth.userId,
        createdAt: now,
        updatedAt: now,
      });
    }
    await this.maps.deleteMissing(
      tenantId,
      entries.map((entry) => entry.key)
    );
    return this.maps.listByTenant(tenantId);
  }

  /**
   * Resolves a map key + variable values to a concrete folder path. Each value
   * becomes exactly one validated segment, so a variable can never inject extra
   * hierarchy levels or traversal sequences.
   */
  async resolvePath(
    auth: AuthContext,
    tenantId: string,
    key: string,
    vars: Record<string, unknown> | undefined
  ): Promise<string> {
    this.assertMember(auth, tenantId);
    const normalized = String(key ?? "").trim().toLowerCase();
    if (!normalized) throw new ValidationError("folderMap is required");
    const map = await this.maps.findByKey(tenantId, normalized);
    if (!map || map.status !== "active") {
      throw new NotFoundError(`Folder map "${normalized}" was not found`);
    }
    return resolveTemplate(map.pathTemplate, vars);
  }

  private assertMember(auth: AuthContext, tenantId: string): void {
    if (isPlatformAdmin(auth.roles)) return;
    if (auth.tenantId && auth.tenantId === tenantId) return;
    throw new ForbiddenError("You do not have access to this workspace");
  }

  private assertManager(auth: AuthContext, tenantId: string): void {
    if (isPlatformAdmin(auth.roles)) return;
    if (isTenantAdmin(auth.roles) && auth.tenantId === tenantId) return;
    throw new ForbiddenError("Workspace administrator role required");
  }
}
