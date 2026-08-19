import { S3StorageProvider } from "./s3/S3StorageProvider";
import { MinioStorageProvider } from "./minio/MinioStorageProvider";
import { GcpStorageProvider } from "./gcp/GcpStorageProvider";
import { AzureBlobStorageProvider } from "./azure/AzureBlobStorageProvider";
import { FakeStorageProvider } from "./fake/FakeStorageProvider";
import { storageRegistry } from "./StorageProviderRegistry";

let bootstrapped = false;

export function registerStorageProviders(): void {
  if (bootstrapped) return;
  storageRegistry.register("s3", (config) => new S3StorageProvider(config));
  storageRegistry.register("minio", (config) => new MinioStorageProvider(config));
  storageRegistry.register("gcp", (config) => new GcpStorageProvider(config));
  storageRegistry.register("azure", (config) => new AzureBlobStorageProvider(config));
  storageRegistry.register("fake", () => new FakeStorageProvider());
  bootstrapped = true;
}
