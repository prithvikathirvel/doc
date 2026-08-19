import {
  BlobSASPermissions,
  BlobServiceClient,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
} from "@azure/storage-blob";
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

export class AzureBlobStorageProvider implements StorageProvider {
  readonly providerType = "azure";
  private readonly service: BlobServiceClient;
  private readonly credential: StorageSharedKeyCredential;
  private readonly defaultTtl: number;
  private readonly accountName: string;

  constructor(private readonly config: StorageProviderConfig) {
    if (!config.container) {
      throw new StorageConfigurationError("Azure container is required");
    }
    this.accountName = requireConfig(config.accountName, "accountName");
    const accountKey = requireConfig(config.accountKey || config.secretKey, "accountKey");
    this.credential = new StorageSharedKeyCredential(this.accountName, accountKey);
    const endpoint = config.endpoint || `https://${this.accountName}.blob.core.windows.net`;
    this.service = new BlobServiceClient(endpoint, this.credential);
    this.defaultTtl = config.signedUrlTtlSeconds || 900;
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
      const block = this.blob(request.location);
      if (Buffer.isBuffer(request.body)) {
        await block.uploadData(request.body, {
          blobHTTPHeaders: request.contentType ? { blobContentType: request.contentType } : undefined,
          metadata: request.metadata,
        });
      } else {
        await block.uploadStream(request.body, undefined, undefined, {
          blobHTTPHeaders: request.contentType ? { blobContentType: request.contentType } : undefined,
          metadata: request.metadata,
        });
      }
      return this.getMetadata(request.location);
    } catch (err) {
      throw translateStorageError(err, "upload");
    }
  }

  async download(location: StorageLocation): Promise<DownloadResult> {
    try {
      const response = await this.blob(location).download();
      const body = response.readableStreamBody as Readable;
      return {
        body,
        metadata: {
          location,
          size: response.contentLength || 0,
          contentType: response.contentType,
          etag: response.etag,
          lastModified: response.lastModified,
        },
      };
    } catch (err) {
      throw translateStorageError(err, "download");
    }
  }

  async delete(location: StorageLocation): Promise<void> {
    try {
      await this.blob(location).deleteIfExists();
    } catch (err) {
      throw translateStorageError(err, "delete");
    }
  }

  async exists(location: StorageLocation): Promise<boolean> {
    try {
      return await this.blob(location).exists();
    } catch (err) {
      throw translateStorageError(err, "generic");
    }
  }

  async getMetadata(location: StorageLocation): Promise<ObjectMetadata> {
    try {
      const props = await this.blob(location).getProperties();
      return {
        location,
        size: props.contentLength || 0,
        contentType: props.contentType,
        etag: props.etag,
        lastModified: props.lastModified,
        custom: props.metadata,
      };
    } catch (err) {
      throw translateStorageError(err, "generic");
    }
  }

  async copy(source: StorageLocation, destination: StorageLocation): Promise<void> {
    try {
      const sourceUrl = this.blob(source).url;
      const poller = await this.blob(destination).beginCopyFromURL(sourceUrl);
      await poller.pollUntilDone();
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
      const items: Array<{ objectKey: string; size?: number; lastModified?: Date; etag?: string }> = [];
      const iter = this.service.getContainerClient(container).listBlobsFlat({ prefix });
      for await (const blob of iter) {
        items.push({
          objectKey: blob.name,
          size: blob.properties.contentLength,
          lastModified: blob.properties.lastModified,
          etag: blob.properties.etag,
        });
        if (items.length >= maxKeys) break;
      }
      return items;
    } catch (err) {
      throw translateStorageError(err, "generic");
    }
  }

  async createUploadUrl(location: StorageLocation, options?: SignedUrlOptions): Promise<SignedUrl> {
    try {
      return this.sasUrl(location, "cw", options);
    } catch (err) {
      throw translateStorageError(err, "upload");
    }
  }

  async createDownloadUrl(location: StorageLocation, options?: SignedUrlOptions): Promise<SignedUrl> {
    try {
      return this.sasUrl(location, "r", options, "GET");
    } catch (err) {
      throw translateStorageError(err, "download");
    }
  }

  async initiateMultipart(): Promise<MultipartUploadSession> {
    throw new StorageCapabilityError("Azure block uploads are handled via SAS/streaming upload");
  }

  async uploadPart(): Promise<{ etag: string }> {
    throw new StorageCapabilityError("Azure multipart parts are not exposed through this adapter");
  }

  async completeMultipart(): Promise<ObjectMetadata> {
    throw new StorageCapabilityError("Azure multipart complete is not exposed through this adapter");
  }

  async abortMultipart(): Promise<void> {
    throw new StorageCapabilityError("Azure multipart abort is not exposed through this adapter");
  }

  private blob(location: StorageLocation) {
    return this.service.getContainerClient(location.container).getBlockBlobClient(location.objectKey);
  }

  private sasUrl(
    location: StorageLocation,
    permissions: string,
    options?: SignedUrlOptions,
    method: "GET" | "PUT" = "PUT"
  ): SignedUrl {
    const expiresIn = options?.expiresInSeconds || this.defaultTtl;
    const expiresOn = new Date(Date.now() + expiresIn * 1000);
    const sas = generateBlobSASQueryParameters(
      {
        containerName: location.container,
        blobName: location.objectKey,
        permissions: BlobSASPermissions.parse(permissions),
        expiresOn,
        contentType: options?.contentType,
        contentDisposition: options?.contentDisposition,
      },
      this.credential
    ).toString();
    const url = `${this.blob(location).url}?${sas}`;
    return {
      url,
      method,
      headers: options?.contentType && method === "PUT" ? { "Content-Type": options.contentType } : undefined,
      expiresAt: expiresOn,
    };
  }
}
