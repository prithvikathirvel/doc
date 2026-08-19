import { StorageConfigurationError } from "../domain/exceptions";
import { StorageProviderConfig, TenantStorageConfig } from "../domain/models";
import { StorageProvider } from "../domain/ports";
import { resolveSecret } from "../config/settings";
import { storageRegistry } from "../infrastructure/storage/StorageProviderRegistry";

export class StorageResolver {
  private readonly cache = new Map<string, { signature: string; provider: StorageProvider }>();

  resolve(config: TenantStorageConfig): StorageProvider {
    const runtime = toRuntimeConfig(config);
    const signature = JSON.stringify({
      provider: runtime.provider,
      container: runtime.container,
      endpoint: runtime.endpoint,
      region: runtime.region,
      projectId: runtime.projectId,
      accountName: runtime.accountName,
      basePrefix: runtime.basePrefix,
    });
    const cached = this.cache.get(config.tenantId);
    if (cached && cached.signature === signature) {
      return cached.provider;
    }
    const provider = storageRegistry.resolve(runtime);
    this.cache.set(config.tenantId, { signature, provider });
    return provider;
  }

  clear(tenantId?: string): void {
    if (tenantId) this.cache.delete(tenantId);
    else this.cache.clear();
  }
}

export function toRuntimeConfig(config: TenantStorageConfig): StorageProviderConfig {
  if (!config.provider || !config.container) {
    throw new StorageConfigurationError("Tenant storage configuration is incomplete");
  }
  return {
    provider: config.provider,
    container: config.container,
    region: config.region,
    endpoint: config.endpoint,
    accessKey: resolveSecret(config.accessKeyRef),
    secretKey: resolveSecret(config.secretKeyRef),
    sessionToken: resolveSecret(config.sessionTokenRef),
    projectId: config.projectId,
    accountName: config.accountName,
    accountKey: resolveSecret(config.secretKeyRef),
    credentialsJson: resolveSecret(config.credentialsJsonRef),
    basePrefix: config.basePrefix,
    useSsl: config.useSsl,
    signedUrlTtlSeconds: config.signedUrlTtlSeconds,
  };
}
