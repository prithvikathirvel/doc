import { Readable } from "stream";
import { StorageLocation } from "../../service/models";
import { StorageProvider } from "../../service/ports";

export function runStorageContract(name: string, createProvider: () => StorageProvider): void {
  describe(`storage contract: ${name}`, () => {
    const provider = createProvider();
    const location: StorageLocation = {
      provider: provider.providerType,
      container: "documents",
      objectKey: `contract/${name}/hello.txt`,
    };

    it("uploads, exists, reads metadata, downloads, and deletes", async () => {
      const body = Buffer.from("hello-dms");
      await provider.upload({ location, body, contentType: "text/plain", contentLength: body.length });
      await expect(provider.exists(location)).resolves.toBe(true);
      const meta = await provider.getMetadata(location);
      expect(meta.size).toBe(body.length);
      const download = await provider.download(location);
      const downloaded = await readAll(download.body);
      expect(downloaded.toString()).toBe("hello-dms");
      await provider.delete(location);
      await expect(provider.exists(location)).resolves.toBe(false);
    });

    it("copies and moves objects", async () => {
      const source = { ...location, objectKey: `contract/${name}/src.txt` };
      const copied = { ...location, objectKey: `contract/${name}/copy.txt` };
      const moved = { ...location, objectKey: `contract/${name}/moved.txt` };
      await provider.upload({ location: source, body: Buffer.from("payload") });
      await provider.copy(source, copied);
      await expect(provider.exists(copied)).resolves.toBe(true);
      await provider.move(copied, moved);
      await expect(provider.exists(copied)).resolves.toBe(false);
      await expect(provider.exists(moved)).resolves.toBe(true);
      await provider.delete(source);
      await provider.delete(moved);
    });

    it("lists objects by prefix", async () => {
      const a = { ...location, objectKey: `contract/${name}/list/a.txt` };
      const b = { ...location, objectKey: `contract/${name}/list/b.txt` };
      await provider.upload({ location: a, body: Buffer.from("a") });
      await provider.upload({ location: b, body: Buffer.from("b") });
      const items = await provider.list("documents", `contract/${name}/list/`);
      expect(items.map((i) => i.objectKey).sort()).toEqual([a.objectKey, b.objectKey]);
      await provider.delete(a);
      await provider.delete(b);
    });

    it("exposes capability-aware signed URLs", async () => {
      const caps = provider.capabilities();
      if (caps.signedUploadUrl) {
        const url = await provider.createUploadUrl(location);
        expect(url.url).toContain("http");
        expect(url.expiresAt.getTime()).toBeGreaterThan(Date.now());
      }
    });

    it("supports multipart when the capability is advertised", async () => {
      if (!provider.capabilities().multipartUpload) {
        await expect(provider.initiateMultipart(location)).rejects.toThrow();
        return;
      }
      const session = await provider.initiateMultipart(location, "text/plain");
      const p1 = await provider.uploadPart(session, 1, Buffer.from("part-one-"));
      const p2 = await provider.uploadPart(session, 2, Buffer.from("part-two"));
      expect(p1.etag).toBeTruthy();
      const meta = await provider.completeMultipart(session, [
        { partNumber: 1, etag: p1.etag },
        { partNumber: 2, etag: p2.etag },
      ]);
      expect(meta.size).toBeGreaterThan(0);
      await provider.delete(location);
    });
  });
}

async function readAll(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
