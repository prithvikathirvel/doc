import { Readable } from "stream";
import { StorageCapabilityError, StorageNotFoundError } from "../../utils/errors";
import { ObjectMetadata, StorageCapabilities, StorageLocation } from "../../service/models";
import {
  DownloadResult,
  MultipartUploadSession,
  SignedUrl,
  SignedUrlOptions,
  StorageProvider,
  UploadRequest,
} from "../../service/ports";

interface StoredObject {
  buffer: Buffer;
  contentType?: string;
  metadata?: Record<string, string>;
  etag: string;
  lastModified: Date;
}

function keyOf(location: StorageLocation): string {
  return `${location.container}::${location.objectKey}`;
}

export class FakeStorageProvider implements StorageProvider {
  readonly providerType: string;
  private readonly objects = new Map<string, StoredObject>();
  private readonly multiparts = new Map<string, { location: StorageLocation; parts: Map<number, Buffer> }>();
  private readonly signed: boolean;
  private readonly multipart: boolean;

  constructor(options?: { providerType?: string; signedUrls?: boolean; multipart?: boolean }) {
    this.providerType = options?.providerType || "fake";
    this.signed = options?.signedUrls !== false;
    this.multipart = options?.multipart !== false;
  }

  capabilities(): StorageCapabilities {
    return {
      signedUploadUrl: this.signed,
      signedDownloadUrl: this.signed,
      multipartUpload: this.multipart,
      streaming: true,
      copy: true,
      list: true,
    };
  }

  async upload(request: UploadRequest): Promise<ObjectMetadata> {
    const buffer = await toBuffer(request.body);
    this.objects.set(keyOf(request.location), {
      buffer,
      contentType: request.contentType,
      metadata: request.metadata,
      etag: hash(buffer),
      lastModified: new Date(),
    });
    return this.getMetadata(request.location);
  }

  async download(location: StorageLocation): Promise<DownloadResult> {
    const obj = this.require(location);
    return {
      body: Readable.from(obj.buffer),
      metadata: this.toMeta(location, obj),
    };
  }

  async delete(location: StorageLocation): Promise<void> {
    this.objects.delete(keyOf(location));
  }

  async exists(location: StorageLocation): Promise<boolean> {
    return this.objects.has(keyOf(location));
  }

  async getMetadata(location: StorageLocation): Promise<ObjectMetadata> {
    return this.toMeta(location, this.require(location));
  }

  async copy(source: StorageLocation, destination: StorageLocation): Promise<void> {
    const obj = this.require(source);
    this.objects.set(keyOf(destination), { ...obj, buffer: Buffer.from(obj.buffer), lastModified: new Date() });
  }

  async move(source: StorageLocation, destination: StorageLocation): Promise<void> {
    await this.copy(source, destination);
    await this.delete(source);
  }

  async list(container: string, prefix?: string, maxKeys = 1000) {
    const items = [];
    for (const [k, obj] of this.objects.entries()) {
      const [c, objectKey] = k.split("::");
      if (c !== container) continue;
      if (prefix && !objectKey.startsWith(prefix)) continue;
      items.push({ objectKey, size: obj.buffer.length, lastModified: obj.lastModified, etag: obj.etag });
      if (items.length >= maxKeys) break;
    }
    return items;
  }

  async createUploadUrl(location: StorageLocation, options?: SignedUrlOptions): Promise<SignedUrl> {
    if (!this.signed) {
      throw new StorageCapabilityError("Signed upload URLs are not supported");
    }
    const expiresIn = options?.expiresInSeconds || 900;
    return {
      url: `https://fake-storage.local/upload/${location.container}/${location.objectKey}`,
      method: "PUT",
      expiresAt: new Date(Date.now() + expiresIn * 1000),
    };
  }

  async createDownloadUrl(location: StorageLocation, options?: SignedUrlOptions): Promise<SignedUrl> {
    if (!this.signed) {
      throw new StorageCapabilityError("Signed download URLs are not supported");
    }
    this.require(location);
    const expiresIn = options?.expiresInSeconds || 900;
    return {
      url: `https://fake-storage.local/download/${location.container}/${location.objectKey}`,
      method: "GET",
      expiresAt: new Date(Date.now() + expiresIn * 1000),
    };
  }

  async initiateMultipart(location: StorageLocation): Promise<MultipartUploadSession> {
    if (!this.multipart) {
      throw new StorageCapabilityError("Multipart upload is not supported");
    }
    const uploadId = `mp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    this.multiparts.set(uploadId, { location, parts: new Map() });
    return { uploadId, location };
  }

  async uploadPart(session: MultipartUploadSession, partNumber: number, body: Buffer): Promise<{ etag: string }> {
    const state = this.multiparts.get(session.uploadId);
    if (!state) throw new StorageCapabilityError("Unknown multipart session");
    state.parts.set(partNumber, body);
    return { etag: hash(body) };
  }

  async completeMultipart(
    session: MultipartUploadSession,
    parts: Array<{ partNumber: number; etag: string }>
  ): Promise<ObjectMetadata> {
    const state = this.multiparts.get(session.uploadId);
    if (!state) throw new StorageCapabilityError("Unknown multipart session");
    const buffers = parts
      .sort((a, b) => a.partNumber - b.partNumber)
      .map((p) => state.parts.get(p.partNumber) || Buffer.alloc(0));
    const buffer = Buffer.concat(buffers);
    this.objects.set(keyOf(session.location), {
      buffer,
      etag: hash(buffer),
      lastModified: new Date(),
    });
    this.multiparts.delete(session.uploadId);
    return this.getMetadata(session.location);
  }

  async abortMultipart(session: MultipartUploadSession): Promise<void> {
    this.multiparts.delete(session.uploadId);
  }

  seed(location: StorageLocation, content: Buffer | string, contentType?: string): void {
    const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content);
    this.objects.set(keyOf(location), {
      buffer,
      contentType,
      etag: hash(buffer),
      lastModified: new Date(),
    });
  }

  private require(location: StorageLocation): StoredObject {
    const obj = this.objects.get(keyOf(location));
    if (!obj) {
      throw new StorageNotFoundError(`Object not found: ${location.objectKey}`);
    }
    return obj;
  }

  private toMeta(location: StorageLocation, obj: StoredObject): ObjectMetadata {
    return {
      location,
      size: obj.buffer.length,
      contentType: obj.contentType,
      etag: obj.etag,
      checksum: obj.etag,
      lastModified: obj.lastModified,
      custom: obj.metadata,
    };
  }
}

async function toBuffer(body: Buffer | Readable): Promise<Buffer> {
  if (Buffer.isBuffer(body)) return body;
  const chunks: Buffer[] = [];
  for await (const chunk of body) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function hash(buffer: Buffer): string {
  let h = 0;
  for (const b of buffer) h = (h * 31 + b) >>> 0;
  return h.toString(16);
}
