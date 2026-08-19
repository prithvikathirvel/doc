import { Storage, Bucket } from "@google-cloud/storage";
import { Readable } from "stream";
import { StorageCapabilityError, StorageConfigurationError } from "../../../domain/exceptions";
import { ObjectMetadata, StorageCapabilities, StorageLocation, StorageProviderConfig } from "../../../domain/models";
import {
  DownloadResult,
  MultipartUploadSession,
  SignedUrl,
  SignedUrlOptions,
  StorageProvider,
  UploadRequest,
} from "../../../domain/ports";
import { translateStorageError } from "../errors";

export class GcpStorageProvider implements StorageProvider {
  readonly providerType = "gcp";
  private readonly storage: Storage;
  private readonly defaultTtl: number;

  constructor(private readonly config: StorageProviderConfig) {
    if (!config.container) {
      throw new StorageConfigurationError("GCP bucket is required");
    }
    this.defaultTtl = config.signedUrlTtlSeconds || 900;
    this.storage = new Storage({
      projectId: config.projectId,
      keyFilename: config.credentialsJson && !config.credentialsJson.trim().startsWith("{")
        ? config.credentialsJson
        : undefined,
      credentials: parseJsonCredentials(config.credentialsJson),
    });
  }

  capabilities(): StorageCapabilities {
    return {
      signedUploadUrl: true,
      signedDownloadUrl: true,
      multipartUpload: false,
      streaming: true,
      copy: true,
      list: true,
    };
  }

  async upload(request: UploadRequest): Promise<ObjectMetadata> {
    try {
      const file = this.file(request.location);
      const stream = request.body instanceof Readable ? request.body : Readable.from(request.body);
      await new Promise<void>((resolve, reject) => {
        stream
          .pipe(
            file.createWriteStream({
              contentType: request.contentType,
              metadata: request.metadata,
              resumable: (request.contentLength || 0) > 5 * 1024 * 1024,
            })
          )
          .on("error", reject)
          .on("finish", resolve);
      });
      return this.getMetadata(request.location);
    } catch (err) {
      throw translateStorageError(err, "upload");
    }
  }

  async download(location: StorageLocation): Promise<DownloadResult> {
    try {
      const metadata = await this.getMetadata(location);
      const body = this.file(location).createReadStream();
      return { body, metadata };
    } catch (err) {
      throw translateStorageError(err, "download");
    }
  }

  async delete(location: StorageLocation): Promise<void> {
    try {
      await this.file(location).delete({ ignoreNotFound: true });
    } catch (err) {
      throw translateStorageError(err, "delete");
    }
  }

  async exists(location: StorageLocation): Promise<boolean> {
    try {
      const [ok] = await this.file(location).exists();
      return ok;
    } catch (err) {
      throw translateStorageError(err, "generic");
    }
  }

  async getMetadata(location: StorageLocation): Promise<ObjectMetadata> {
    try {
      const [meta] = await this.file(location).getMetadata();
      return {
        location,
        size: Number(meta.size || 0),
        contentType: meta.contentType,
        etag: meta.etag,
        checksum: meta.md5Hash,
        lastModified: meta.updated ? new Date(meta.updated) : undefined,
        custom: meta.metadata as Record<string, string> | undefined,
      };
    } catch (err) {
      throw translateStorageError(err, "generic");
    }
  }

  async copy(source: StorageLocation, destination: StorageLocation): Promise<void> {
    try {
      await this.file(source).copy(this.file(destination));
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
      const [files] = await this.bucket(container).getFiles({ prefix, maxResults: maxKeys });
      return files.map((file) => ({
        objectKey: file.name,
        size: file.metadata.size ? Number(file.metadata.size) : undefined,
        lastModified: file.metadata.updated ? new Date(file.metadata.updated) : undefined,
        etag: file.metadata.etag,
      }));
    } catch (err) {
      throw translateStorageError(err, "generic");
    }
  }

  async createUploadUrl(location: StorageLocation, options?: SignedUrlOptions): Promise<SignedUrl> {
    try {
      const expiresIn = options?.expiresInSeconds || this.defaultTtl;
      const [url] = await this.file(location).getSignedUrl({
        version: "v4",
        action: "write",
        expires: Date.now() + expiresIn * 1000,
        contentType: options?.contentType,
      });
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
      const [url] = await this.file(location).getSignedUrl({
        version: "v4",
        action: "read",
        expires: Date.now() + expiresIn * 1000,
        responseDisposition: options?.contentDisposition,
      });
      return {
        url,
        method: "GET",
        expiresAt: new Date(Date.now() + expiresIn * 1000),
      };
    } catch (err) {
      throw translateStorageError(err, "download");
    }
  }

  async initiateMultipart(): Promise<MultipartUploadSession> {
    throw new StorageCapabilityError("GCP uses resumable uploads; use createUploadUrl or streaming upload instead");
  }

  async uploadPart(): Promise<{ etag: string }> {
    throw new StorageCapabilityError("GCP multipart parts are not exposed through this adapter");
  }

  async completeMultipart(): Promise<ObjectMetadata> {
    throw new StorageCapabilityError("GCP multipart complete is not exposed through this adapter");
  }

  async abortMultipart(): Promise<void> {
    throw new StorageCapabilityError("GCP multipart abort is not exposed through this adapter");
  }

  private bucket(name: string): Bucket {
    return this.storage.bucket(name);
  }

  private file(location: StorageLocation) {
    return this.bucket(location.container).file(location.objectKey);
  }
}

function parseJsonCredentials(raw?: string): Record<string, unknown> | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed.startsWith("{")) return undefined;
  return JSON.parse(trimmed) as Record<string, unknown>;
}
