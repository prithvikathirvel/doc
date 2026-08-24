import { TenantDocConfig } from "../../service/models";
import { TenantDocRepository } from "../../service/ports";

/** In-memory counterpart of MysqlTenantDocRepository for tests and the preview API. */
export class InMemoryTenantDocRepository implements TenantDocRepository {
  private byTenant = new Map<string, TenantDocConfig>();
  private byToken = new Map<string, TenantDocConfig>();

  async findByTenant(tenantId: string): Promise<TenantDocConfig | null> {
    const config = this.byTenant.get(tenantId);
    return config ? { ...config } : null;
  }

  async findByToken(shareToken: string): Promise<TenantDocConfig | null> {
    const config = this.byToken.get(shareToken);
    return config ? { ...config } : null;
  }

  async upsert(config: TenantDocConfig): Promise<TenantDocConfig> {
    const existing = this.byTenant.get(config.tenantId);
    if (existing?.shareToken && existing.shareToken !== config.shareToken) {
      this.byToken.delete(existing.shareToken);
    }
    const stored = { ...config };
    this.byTenant.set(stored.tenantId, stored);
    this.byToken.set(stored.shareToken, stored);
    return { ...stored };
  }
}
