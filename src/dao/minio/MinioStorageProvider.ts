import * as Minio from "minio";
import { Readable } from "stream";
import { StorageConfigurationError } from "../../utils/errors";
import { ObjectMetadata, StorageCapabilities, StorageLocation, StorageProviderConfig } from "../../service/models";
import {
  DownloadResult,
  MultipartUploadSession,
  SignedUrl,
  SignedUrlOptions,
  StorageProvider,
  UploadRequest,
} from "../../service/ports";
import { requireConfig, translateStorageError } from "../../utils/storageErrors";

export class MinioStorageProvider implements StorageProvider {
  readonly providerType = "minio";
  private readonly client: Minio.Client;
  private readonly defaultTtl: number;

  constructor(private readonly config: StorageProviderConfig) {
    if (!config.container) {
      throw new StorageConfigurationError("MinIO container/bucket is required");
    }
    const endpoint = requireConfig(config.endpoint, "endpoint");
    const parsed = parseEndpoint(endpoint, config.useSsl !== false);
    this.defaultTtl = config.signedUrlTtlSeconds || 900;
    this.client = new Minio.Client({
      endPoint: parsed.host,
      port: parsed.port,
      useSSL: parsed.useSsl,
      accessKey: requireConfig(config.accessKey, "accessKey"),
      secretKey: requireConfig(config.secretKey, "secretKey"),
      region: config.region || "us-east-1",
    });
  }

  capabilities(): StorageCapabilities {
    return {
      signedUploadUrl: true,
      signedDownloadUrl: true,
      multipartUpload: true,
      streaming: true,
      copy: true,
      list: true,
    };
  }

  async upload(request: UploadRequest): Promise<ObjectMetadata> {
    try {
      await this.ensureBucket(request.location.container);
      const meta: Minio.ItemBucketMetadata = {};
      if (request.contentType) meta["Content-Type"] = request.contentType;
      if (request.metadata) {
        for (const [k, v] of Object.entries(request.metadata)) {
          meta[k] = v;
        }
      }
      await this.client.putObject(
        request.location.container,
        request.location.objectKey,
        request.body,
        request.contentLength,
        meta
      );
      return this.getMetadata(request.location);
    } catch (err) {
      throw translateStorageError(err, "upload");
    }
  }

  async download(location: StorageLocation): Promise<DownloadResult> {
    try {
      const stream = await this.client.getObject(location.container, location.objectKey);
      const metadata = await this.getMetadata(location);
      return { body: stream as Readable, metadata };
    } catch (err) {
      throw translateStorageError(err, "download");
    }
  }

  async delete(location: StorageLocation): Promise<void> {
    try {
      await this.client.removeObject(location.container, location.objectKey);
    } catch (err) {
      throw translateStorageError(err, "delete");
    }
  }

  async exists(location: StorageLocation): Promise<boolean> {
    try {
      await this.client.statObject(location.container, location.objectKey);
      return true;
    } catch (err) {
      const translated = translateStorageError(err, "generic");
      if (translated.code === "STORAGE_NOT_FOUND") return false;
      const message = (err as Error).message || "";
      if (message.includes("Not Found") || message.includes("does not exist")) return false;
      throw translated;
    }
  }

  async getMetadata(location: StorageLocation): Promise<ObjectMetadata> {
    try {
      const stat = await this.client.statObject(location.container, location.objectKey);
      return {
        location,
        size: stat.size,
        contentType: stat.metaData?.["content-type"],
        etag: stat.etag,
        lastModified: stat.lastModified,
        custom: stat.metaData,
      };
    } catch (err) {
      throw translateStorageError(err, "generic");
    }
  }

  async copy(source: StorageLocation, destination: StorageLocation): Promise<void> {
    try {
      await this.ensureBucket(destination.container);
      await this.client.copyObject(
        destination.container,
        destination.objectKey,
        `/${source.container}/${source.objectKey}`
      );
    } catch (err) {
      throw translateStorageError(err, "generic");
    }
  }

  async move(source: StorageLocation, destination: StorageLocation): Promise<void> {
    await this.copy(source, destination);
    await this.delete(source);
  }

  async list(container: string, prefix?: string, maxKeys = 1000) {
    try {
      const stream = this.client.listObjectsV2(container, prefix, true);
      const items: Array<{ objectKey: string; size?: number; lastModified?: Date; etag?: string }> = [];
      await new Promise<void>((resolve, reject) => {
        stream.on("data", (obj) => {
          if (items.length >= maxKeys) return;
          items.push({
            objectKey: obj.name || "",
            size: obj.size,
            lastModified: obj.lastModified,
            etag: obj.etag,
          });
        });
        stream.on("error", reject);
        stream.on("end", resolve);
      });
      return items;
    } catch (err) {
      throw translateStorageError(err, "generic");
    }
  }

  async createUploadUrl(location: StorageLocation, options?: SignedUrlOptions): Promise<SignedUrl> {
    try {
      await this.ensureBucket(location.container);
      const expiresIn = options?.expiresInSeconds || this.defaultTtl;
      const url = await this.client.presignedPutObject(location.container, location.objectKey, expiresIn);
      return {
        url,
        method: "PUT",
        headers: options?.contentType ? { "Content-Type": options.contentType } : undefined,
        expiresAt: new Date(Date.now() + expiresIn * 1000),
      };
    } catch (err) {
      throw translateStorageError(err, "upload");
    }
  }

  async createDownloadUrl(location: StorageLocation, options?: SignedUrlOptions): Promise<SignedUrl> {
    try {
      const expiresIn = options?.expiresInSeconds || this.defaultTtl;
      const url = await this.client.presignedGetObject(location.container, location.objectKey, expiresIn);
      return {
        url,
        method: "GET",
        expiresAt: new Date(Date.now() + expiresIn * 1000),
      };
    } catch (err) {
      throw translateStorageError(err, "download");
    }
  }

  async initiateMultipart(location: StorageLocation, contentType?: string): Promise<MultipartUploadSession> {
    try {
      await this.ensureBucket(location.container);
      const uploadId = await this.client.initiateNewMultipartUpload(location.container, location.objectKey, {
        "Content-Type": contentType || "application/octet-stream",
      });
      return { uploadId, location };
    } catch (err) {
      throw translateStorageError(err, "upload");
    }
  }

  async uploadPart(session: MultipartUploadSession, partNumber: number, body: Buffer): Promise<{ etag: string }> {
    try {
      const result = await this.client.uploadPart(
        {
          bucketName: session.location.container,
          objectName: session.location.objectKey,
          uploadID: session.uploadId,
          partNumber,
          headers: { "Content-Length": String(body.length) },
        },
        body
      );
      return { etag: result.etag };
    } catch (err) {
      throw translateStorageError(err, "upload");
    }
  }

  async completeMultipart(
    session: MultipartUploadSession,
    parts: Array<{ partNumber: number; etag: string }>
  ): Promise<ObjectMetadata> {
    try {
      await this.client.completeMultipartUpload(
        session.location.container,
        session.location.objectKey,
        session.uploadId,
        parts.map((p) => ({ part: p.partNumber, etag: p.etag }))
      );
      return this.getMetadata(session.location);
    } catch (err) {
      throw translateStorageError(err, "upload");
    }
  }

  async abortMultipart(session: MultipartUploadSession): Promise<void> {
    try {
      await this.client.abortMultipartUpload(
        session.location.container,
        session.location.objectKey,
        session.uploadId
      );
    } catch (err) {
      throw translateStorageError(err, "delete");
    }
  }

  private async ensureBucket(bucket: string): Promise<void> {
    const exists = await this.client.bucketExists(bucket);
    if (!exists) {
      await this.client.makeBucket(bucket, this.config.region || "us-east-1");
    }
  }
}

function parseEndpoint(endpoint: string, defaultSsl: boolean): { host: string; port: number; useSsl: boolean } {
  const withProtocol = endpoint.includes("://") ? endpoint : `${defaultSsl ? "https" : "http"}://${endpoint}`;
  const url = new URL(withProtocol);
  const useSsl = url.protocol === "https:";
  const port = url.port ? Number(url.port) : useSsl ? 443 : 80;
  return { host: url.hostname, port, useSsl };
}
