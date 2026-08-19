import { StorageConfigurationError } from "../../domain/exceptions";
import { StorageProviderConfig } from "../../domain/models";
import { StorageProvider, StorageProviderFactory } from "../../domain/ports";

export class StorageProviderRegistry {
  private readonly factories = new Map<string, StorageProviderFactory>();

  register(providerType: string, factory: StorageProviderFactory): void {
    this.factories.set(providerType.toLowerCase(), factory);
  }

  has(providerType: string): boolean {
    return this.factories.has(providerType.toLowerCase());
  }

  resolve(config: StorageProviderConfig): StorageProvider {
    const factory = this.factories.get(config.provider.toLowerCase());
    if (!factory) {
      throw new StorageConfigurationError(
        `Unknown storage provider "${config.provider}". Register an adapter before resolving.`
      );
    }
    return factory(config);
  }

  registered(): string[] {
    return [...this.factories.keys()];
  }
}

export const storageRegistry = new StorageProviderRegistry();
