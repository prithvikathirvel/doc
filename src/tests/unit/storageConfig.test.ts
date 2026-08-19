import { normalizeStorageConfig } from "../../service/storageConfig";
import { ValidationError } from "../../utils/errors";

describe("storage configuration validation", () => {
  it("requires a region for S3 and keeps optional credential references", () => {
    const config = normalizeStorageConfig({
      provider: "s3",
      container: "acme-documents",
      region: "eu-west-1",
      accessKeyRef: "ACME_AWS_ACCESS_KEY",
      secretKeyRef: "ACME_AWS_SECRET_KEY",
    });
    expect(config).toMatchObject({
      provider: "s3",
      container: "acme-documents",
      region: "eu-west-1",
      signedUrlTtlSeconds: 900,
    });

    expect(() => normalizeStorageConfig({ provider: "s3", container: "acme-documents" })).toThrow(
      ValidationError
    );
  });

  it("rejects a half-configured S3 credential pair", () => {
    expect(() =>
      normalizeStorageConfig({
        provider: "s3",
        container: "acme-documents",
        region: "us-east-1",
        accessKeyRef: "ONLY_ACCESS_KEY",
      })
    ).toThrow(/access key and secret key/i);
  });

  it("requires endpoint and credentials for MinIO and derives TLS from the URL", () => {
    const config = normalizeStorageConfig({
      provider: "minio",
      container: "documents",
      endpoint: "https://minio.internal:9000",
      accessKeyRef: "MINIO_ACCESS_KEY",
      secretKeyRef: "MINIO_SECRET_KEY",
    });
    expect(config.useSsl).toBe(true);

    expect(() =>
      normalizeStorageConfig({ provider: "minio", container: "documents", endpoint: "minio.internal" })
    ).toThrow(/full URL/i);
  });

  it("drops fields that do not belong to the selected provider", () => {
    const config = normalizeStorageConfig({
      provider: "gcp",
      container: "acme-documents",
      projectId: "acme-platform",
      credentialsJsonRef: "GCP_CREDENTIALS_JSON",
      endpoint: "https://leftover.example.com",
      accessKeyRef: "LEFTOVER",
    });
    expect(config.endpoint).toBeUndefined();
    expect(config.accessKeyRef).toBeUndefined();
    expect(config.projectId).toBe("acme-platform");
  });

  it("requires an account name and key reference for Azure", () => {
    expect(() =>
      normalizeStorageConfig({ provider: "azure", container: "documents", accountName: "acmestorage" })
    ).toThrow(/account key/i);

    const config = normalizeStorageConfig({
      provider: "azure",
      container: "documents",
      accountName: "acmestorage",
      secretKeyRef: "AZURE_ACCOUNT_KEY",
    });
    expect(config).toMatchObject({ accountName: "acmestorage", secretKeyRef: "AZURE_ACCOUNT_KEY" });
  });

  it("validates naming rules and signed URL lifetime", () => {
    expect(() =>
      normalizeStorageConfig({ provider: "s3", container: "A_Bad_Bucket", region: "us-east-1" })
    ).toThrow(/bucket name/i);

    expect(() =>
      normalizeStorageConfig({
        provider: "s3",
        container: "acme-documents",
        region: "us-east-1",
        signedUrlTtlSeconds: 10,
      })
    ).toThrow(/60 and 86400/);
  });
});
