import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CopyObjectCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Readable } from "stream";
import { StorageCapabilityError, StorageConfigurationError } from "../../utils/errors";
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

export class S3StorageProvider implements StorageProvider {
  readonly providerType = "s3";
  private readonly client: S3Client;
  private readonly defaultTtl: number;

  constructor(private readonly config: StorageProviderConfig) {
    if (!config.container) {
      throw new StorageConfigurationError("S3 container/bucket is required");
    }
    this.defaultTtl = config.signedUrlTtlSeconds || 900;
    this.client = new S3Client({
      region: config.region || "us-east-1",
      endpoint: config.endpoint,
      forcePathStyle: Boolean(config.endpoint),
      credentials:
        config.accessKey && config.secretKey
          ? {
              accessKeyId: config.accessKey,
              secretAccessKey: config.secretKey,
              sessionToken: config.sessionToken,
            }
          : undefined,
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
      const body = request.body;
      await this.client.send(
        new PutObjectCommand({
          Bucket: request.location.container,
          Key: request.location.objectKey,
          Body: body,
          ContentType: request.contentType,
          ContentLength: request.contentLength,
          Metadata: request.metadata,
        })
      );
      return this.getMetadata(request.location);
    } catch (err) {
      throw translateStorageError(err, "upload");
    }
  }

  async download(location: StorageLocation): Promise<DownloadResult> {
    try {
      const result = await this.client.send(
        new GetObjectCommand({
          Bucket: location.container,
          Key: location.objectKey,
          VersionId: location.versionId,
        })
      );
      const body = result.Body as Readable;
      return {
        body,
        metadata: {
          location,
          size: result.ContentLength || 0,
          contentType: result.ContentType,
          etag: result.ETag,
          lastModified: result.LastModified,
          checksum: result.ChecksumSHA256,
        },
      };
    } catch (err) {
      throw translateStorageError(err, "download");
    }
  }

  async delete(location: StorageLocation): Promise<void> {
    try {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: location.container,
          Key: location.objectKey,
          VersionId: location.versionId,
        })
      );
    } catch (err) {
      throw translateStorageError(err, "delete");
    }
  }

  async exists(location: StorageLocation): Promise<boolean> {
    try {
      await this.getMetadata(location);
      return true;
    } catch (err) {
      if ((err as { code?: string }).code === "STORAGE_NOT_FOUND") {
        return false;
      }
      throw err;
    }
  }

  async getMetadata(location: StorageLocation): Promise<ObjectMetadata> {
    try {
      const result = await this.client.send(
        new HeadObjectCommand({
          Bucket: location.container,
          Key: location.objectKey,
          VersionId: location.versionId,
        })
      );
      return {
        location,
        size: result.ContentLength || 0,
        contentType: result.ContentType,
        etag: result.ETag,
        lastModified: result.LastModified,
        checksum: result.ChecksumSHA256,
        custom: result.Metadata,
      };
    } catch (err) {
      throw translateStorageError(err, "generic");
    }
  }

  async copy(source: StorageLocation, destination: StorageLocation): Promise<void> {
    try {
      await this.client.send(
        new CopyObjectCommand({
          Bucket: destination.container,
          Key: destination.objectKey,
          CopySource: `${source.container}/${source.objectKey}`,
        })
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
      const result = await this.client.send(
        new ListObjectsV2Command({
          Bucket: container,
          Prefix: prefix,
          MaxKeys: maxKeys,
        })
      );
      return (result.Contents || []).map((obj) => ({
        objectKey: obj.Key || "",
        size: obj.Size,
        lastModified: obj.LastModified,
        etag: obj.ETag,
      }));
    } catch (err) {
      throw translateStorageError(err, "generic");
    }
  }

  async createUploadUrl(location: StorageLocation, options?: SignedUrlOptions): Promise<SignedUrl> {
    try {
      const expiresIn = options?.expiresInSeconds || this.defaultTtl;
      const url = await getSignedUrl(
        this.client,
        new PutObjectCommand({
          Bucket: location.container,
          Key: location.objectKey,
          ContentType: options?.contentType,
        }),
        { expiresIn }
      );
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
      const url = await getSignedUrl(
        this.client,
        new GetObjectCommand({
          Bucket: location.container,
          Key: location.objectKey,
          VersionId: location.versionId,
          ResponseContentType: options?.contentType,
          ResponseContentDisposition: options?.contentDisposition,
        }),
        { expiresIn }
      );
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
      const result = await this.client.send(
        new CreateMultipartUploadCommand({
          Bucket: location.container,
          Key: location.objectKey,
          ContentType: contentType,
        })
      );
      return { uploadId: requireConfig(result.UploadId, "uploadId"), location };
    } catch (err) {
      throw translateStorageError(err, "upload");
    }
  }

  async uploadPart(session: MultipartUploadSession, partNumber: number, body: Buffer): Promise<{ etag: string }> {
    try {
      const result = await this.client.send(
        new UploadPartCommand({
          Bucket: session.location.container,
          Key: session.location.objectKey,
          UploadId: session.uploadId,
          PartNumber: partNumber,
          Body: body,
        })
      );
      return { etag: requireConfig(result.ETag, "etag") };
    } catch (err) {
      throw translateStorageError(err, "upload");
    }
  }

  async completeMultipart(
    session: MultipartUploadSession,
    parts: Array<{ partNumber: number; etag: string }>
  ): Promise<ObjectMetadata> {
    try {
      await this.client.send(
        new CompleteMultipartUploadCommand({
          Bucket: session.location.container,
          Key: session.location.objectKey,
          UploadId: session.uploadId,
          MultipartUpload: {
            Parts: parts.map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })),
          },
        })
      );
      return this.getMetadata(session.location);
    } catch (err) {
      throw translateStorageError(err, "upload");
    }
  }

  async abortMultipart(session: MultipartUploadSession): Promise<void> {
    try {
      await this.client.send(
        new AbortMultipartUploadCommand({
          Bucket: session.location.container,
          Key: session.location.objectKey,
          UploadId: session.uploadId,
        })
      );
    } catch (err) {
      throw translateStorageError(err, "delete");
    }
  }
}

export function unsupportedIfMissing(): never {
  throw new StorageCapabilityError("Operation is not supported");
}
