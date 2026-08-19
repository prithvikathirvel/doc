import { S3StorageProvider } from "../../infrastructure/storage/s3/S3StorageProvider";
import { MinioStorageProvider } from "../../infrastructure/storage/minio/MinioStorageProvider";
import { GcpStorageProvider } from "../../infrastructure/storage/gcp/GcpStorageProvider";
import { AzureBlobStorageProvider } from "../../infrastructure/storage/azure/AzureBlobStorageProvider";
import { StorageProvider } from "../../domain/ports";
import { runStorageContract } from "../contract/storageProvider.contract";

const run = process.env.RUN_INTEGRATION === "true";
const describeIf = run ? describe : describe.skip;

function maybe(name: string, enabled: boolean, factory: () => StorageProvider): void {
  if (!enabled) {
    describe.skip(`${name} integration (credentials not provided)`, () => {
      it("skipped", () => undefined);
    });
    return;
  }
  runStorageContract(name, factory);
}

describeIf("live storage providers", () => {
  maybe("s3", Boolean(process.env.IT_S3_BUCKET), () =>
    new S3StorageProvider({
      provider: "s3",
      container: process.env.IT_S3_BUCKET as string,
      region: process.env.IT_S3_REGION,
      accessKey: process.env.IT_S3_ACCESS_KEY,
      secretKey: process.env.IT_S3_SECRET_KEY,
    })
  );

  maybe("minio", Boolean(process.env.IT_MINIO_ENDPOINT), () =>
    new MinioStorageProvider({
      provider: "minio",
      container: process.env.IT_MINIO_BUCKET || "documents",
      endpoint: process.env.IT_MINIO_ENDPOINT,
      accessKey: process.env.IT_MINIO_ACCESS_KEY,
      secretKey: process.env.IT_MINIO_SECRET_KEY,
      useSsl: process.env.IT_MINIO_SSL === "true",
    })
  );

  maybe("gcp", Boolean(process.env.IT_GCP_BUCKET), () =>
    new GcpStorageProvider({
      provider: "gcp",
      container: process.env.IT_GCP_BUCKET as string,
      projectId: process.env.IT_GCP_PROJECT,
      credentialsJson: process.env.IT_GCP_CREDENTIALS,
    })
  );

  maybe("azure", Boolean(process.env.IT_AZURE_CONTAINER), () =>
    new AzureBlobStorageProvider({
      provider: "azure",
      container: process.env.IT_AZURE_CONTAINER as string,
      accountName: process.env.IT_AZURE_ACCOUNT,
      accountKey: process.env.IT_AZURE_KEY,
    })
  );
});
