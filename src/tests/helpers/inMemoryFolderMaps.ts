import { FolderMap } from "../../service/models";
import { FolderMapRepository } from "../../service/ports";

/** In-memory counterpart of MysqlFolderMapRepository for tests and the preview API. */
export class InMemoryFolderMapRepository implements FolderMapRepository {
  private items = new Map<string, FolderMap>();

  async listByTenant(tenantId: string): Promise<FolderMap[]> {
    return [...this.items.values()]
      .filter((map) => map.tenantId === tenantId)
      .map((map) => ({ ...map }))
      .sort((a, b) => a.key.localeCompare(b.key));
  }

  async findByKey(tenantId: string, key: string): Promise<FolderMap | null> {
    const map = [...this.items.values()].find((entry) => entry.tenantId === tenantId && entry.key === key);
    return map ? { ...map } : null;
  }

  async upsert(map: FolderMap): Promise<FolderMap> {
    const existing = [...this.items.values()].find(
      (entry) => entry.tenantId === map.tenantId && entry.key === map.key
    );
    if (existing) {
      this.items.delete(existing.id);
    }
    const stored = {
      ...map,
      id: existing?.id || map.id,
      createdBy: existing?.createdBy || map.createdBy,
      createdAt: existing?.createdAt || map.createdAt,
    };
    this.items.set(stored.id, stored);
    return { ...stored };
  }

  async deleteMissing(tenantId: string, keepKeys: string[]): Promise<void> {
    const keep = new Set(keepKeys);
    for (const [id, map] of [...this.items.entries()]) {
      if (map.tenantId === tenantId && !keep.has(map.key)) this.items.delete(id);
    }
  }
}
