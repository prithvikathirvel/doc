import { TenantDocService } from "../../service/tenantDocService";
import { AuthContext } from "../../service/models";
import { ForbiddenError, NotFoundError, ValidationError } from "../../utils/errors";
import { InMemoryTenantRepository } from "../helpers/inMemory";
import { InMemoryTenantDocRepository } from "../helpers/inMemoryTenantDocs";
import { DOC_API_BASE_PLACEHOLDER, DOC_OPERATION_SUMMARIES } from "../../service/docsCatalog";

const platformAdmin: AuthContext = {
  userId: "root",
  userName: "Root",
  tenantId: "",
  roles: ["platform_admin"],
};

describe("TenantDocService", () => {
  let tenants: InMemoryTenantRepository;
  let docs: InMemoryTenantDocRepository;
  let service: TenantDocService;
  let tenantId: string;

  beforeEach(async () => {
    tenants = new InMemoryTenantRepository();
    docs = new InMemoryTenantDocRepository();
    service = new TenantDocService(tenants, docs);
    const created = await tenants.create({
      id: "t-acme",
      name: "Acme Corporation",
      slug: "acme",
      status: "active",
      ownerName: "Jane Doe",
      ownerEmail: "jane@acme.com",
      maxFileSizeBytes: 52428800,
      allowedMimeTypes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    tenantId = created.id;
  });

  const memberOf = (tenantId: string): AuthContext => ({
    userId: "carlos",
    userName: "Carlos",
    tenantId,
    roles: ["member"],
  });

  it("derives the catalogue from the OpenAPI spec", () => {
    // The catalogue is generated from swaggerSpec, not hand-listed.
    expect(DOC_OPERATION_SUMMARIES.length).toBeGreaterThan(10);
    const ids = DOC_OPERATION_SUMMARIES.map((op) => op.id);
    expect(ids).toContain("POST /documents");
    expect(ids).toContain("GET /documents/{id}");
    expect(ids).toContain("POST /folders");
    expect(ids).toContain("POST /documents/{id}/permissions");
  });

  it("lets a platform administrator generate documentation and reads it back", async () => {
    const config = await service.upsertConfig(platformAdmin, tenantId, {
      title: "Acme API",
      intro: "How to call the DMS",
      apiBaseUrl: "https://dms.acme.com/dms",
      selectedOperations: ["GET /documents", "GET /documents/{id}", "does.not.exist", "GET /documents"],
    });
    expect(config.shareToken).toBeTruthy();
    // unknown id dropped, duplicates collapsed
    expect(config.selectedOperations).toEqual(["GET /documents", "GET /documents/{id}"]);
    expect(config.title).toBe("Acme API");

    const { config: again, catalog } = await service.getConfig(platformAdmin, tenantId);
    expect(again?.shareToken).toBe(config.shareToken);
    expect(catalog.length).toBeGreaterThan(0);
  });

  it("forbids non-admins from writing but lets workspace members read", async () => {
    await service.upsertConfig(platformAdmin, tenantId, { selectedOperations: ["GET /documents"] });
    const member = memberOf(tenantId);
    await expect(service.getConfig(member, tenantId)).resolves.toMatchObject({ config: { status: "active" } });
    await expect(
      service.upsertConfig(member, tenantId, { selectedOperations: [] })
    ).rejects.toBeInstanceOf(ForbiddenError);

    const outsider: AuthContext = { ...memberOf("t-other") };
    await expect(service.getConfig(outsider, tenantId)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("renders the public page with full URLs and cURL built from the tenant base", async () => {
    const { shareToken } = await service.upsertConfig(platformAdmin, tenantId, {
      apiBaseUrl: "https://dms.acme.com/dms",
      selectedOperations: ["GET /documents"],
    });
    const page = await service.getPublicPage(shareToken);
    expect(page.tenant.name).toBe("Acme Corporation");
    expect(page.apiBaseUrl).toBe("https://dms.acme.com/dms");
    expect(page.operations).toHaveLength(1);
    const op = page.operations[0];
    expect(op.url).toBe("https://dms.acme.com/dms/api/documents");
    expect(op.curl).toContain("https://dms.acme.com/dms/api/documents");
    expect(op.curl).toContain("-X GET");
    expect(op.curl).not.toContain(DOC_API_BASE_PLACEHOLDER);
    // request fields + required flags come from the spec
    expect(op.parameters.some((p) => p.name === "limit")).toBe(true);
  });

  it("keeps the dummy placeholder when no base url is configured", async () => {
    const { shareToken } = await service.upsertConfig(platformAdmin, tenantId, {
      selectedOperations: ["POST /folders"],
    });
    const page = await service.getPublicPage(shareToken);
    expect(page.apiBaseUrl).toBe(DOC_API_BASE_PLACEHOLDER);
    expect(page.operations[0].url).toContain(DOC_API_BASE_PLACEHOLDER);
    expect(page.operations[0].curl).toContain(DOC_API_BASE_PLACEHOLDER);
  });

  it("hides disabled documentation and unknown tokens", async () => {
    const { shareToken } = await service.upsertConfig(platformAdmin, tenantId, {
      selectedOperations: ["GET /documents"],
    });
    await service.patchConfig(platformAdmin, tenantId, { status: "disabled" });
    await expect(service.getPublicPage(shareToken)).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.getPublicPage("no-such-token")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("regenerates the share token on demand", async () => {
    const created = await service.upsertConfig(platformAdmin, tenantId, {
      selectedOperations: ["GET /documents"],
    });
    const updated = await service.patchConfig(platformAdmin, tenantId, { regenerateToken: true });
    expect(updated.shareToken).not.toBe(created.shareToken);
    await expect(service.getPublicPage(created.shareToken)).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.getPublicPage(updated.shareToken)).resolves.toBeTruthy();
  });

  it("rejects an invalid API base url", async () => {
    await expect(
      service.upsertConfig(platformAdmin, tenantId, { apiBaseUrl: "not-a-url", selectedOperations: [] })
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
