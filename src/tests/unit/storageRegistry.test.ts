import { StorageConfigurationError } from "../../domain/exceptions";
import { FakeStorageProvider } from "../../infrastructure/storage/fake/FakeStorageProvider";
import { StorageProviderRegistry } from "../../infrastructure/storage/StorageProviderRegistry";

describe("StorageProviderRegistry", () => {
  it("resolves a registered provider without application-level if/else", () => {
    const registry = new StorageProviderRegistry();
    registry.register("s3", () => new FakeStorageProvider({ providerType: "s3" }));
    registry.register("minio", () => new FakeStorageProvider({ providerType: "minio" }));
    registry.register("gcp", () => new FakeStorageProvider({ providerType: "gcp" }));
    registry.register("azure", () => new FakeStorageProvider({ providerType: "azure" }));

    for (const provider of ["s3", "minio", "gcp", "azure"] as const) {
      const resolved = registry.resolve({ provider, container: "documents" });
      expect(resolved.providerType).toBe(provider);
    }
  });

  it("lets a future provider be added by registration only", () => {
    const registry = new StorageProviderRegistry();
    registry.register("cloudflare_r2", () => new FakeStorageProvider({ providerType: "cloudflare_r2" }));
    const provider = registry.resolve({ provider: "cloudflare_r2" as "s3", container: "x" });
    expect(provider.providerType).toBe("cloudflare_r2");
  });

  it("fails clearly for an unknown provider", () => {
    const registry = new StorageProviderRegistry();
    expect(() => registry.resolve({ provider: "s3", container: "documents" })).toThrow(StorageConfigurationError);
  });
});
