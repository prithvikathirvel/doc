import { buildObjectKey, sanitizeKeySegment } from "../../service/models";

describe("object key layout", () => {
  const base = {
    basePrefix: "dms",
    tenantId: "11111111-1111-1111-1111-111111111111",
    userId: "jane@acme.com",
    documentId: "6f0e9c62-1f2a-4f1b-9a55-6f4a0f0f9b21",
  };

  it("stores files under tenant, user, document and version folders", () => {
    expect(buildObjectKey({ ...base, version: 1, filename: "msa.pdf" })).toBe(
      "dms/11111111-1111-1111-1111-111111111111/jane_acme.com/6f0e9c62-1f2a-4f1b-9a55-6f4a0f0f9b21/v1/msa.pdf"
    );
    expect(buildObjectKey({ ...base, version: 12, filename: "msa.pdf" })).toBe(
      "dms/11111111-1111-1111-1111-111111111111/jane_acme.com/6f0e9c62-1f2a-4f1b-9a55-6f4a0f0f9b21/v12/msa.pdf"
    );
  });

  it("works without a base prefix", () => {
    expect(buildObjectKey({ ...base, basePrefix: undefined, version: 1, filename: "a.txt" })).toBe(
      "11111111-1111-1111-1111-111111111111/jane_acme.com/6f0e9c62-1f2a-4f1b-9a55-6f4a0f0f9b21/v1/a.txt"
    );
  });

  it("keeps every segment safe for object storage", () => {
    expect(sanitizeKeySegment("jane@acme.com")).toBe("jane_acme.com");
    expect(sanitizeKeySegment("../../etc/passwd")).toBe("etc_passwd");
    expect(sanitizeKeySegment("  spaced  name .pdf")).toBe("spaced_name_.pdf");
    expect(sanitizeKeySegment("///")).toBe("unknown");
  });
});
