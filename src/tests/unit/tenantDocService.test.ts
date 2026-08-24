import { TenantDocService } from "../../service/tenantDocService";
import { AuthContext } from "../../service/models";
import { ForbiddenError, NotFoundError, ValidationError } from "../../utils/errors";
import { InMemoryTenantRepository } from "../helpers/inMemory";
import { InMemoryTenantDocRepository } from "../helpers/inMemoryTenantDocs";
import { DOC_API_BASE_PLACEHOLDER } from "../../service/docsCatalog";

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

  it("lets a platform administrator generate documentation and reads it back", async () => {
    const config = await service.upsertConfig(platformAdmin, tenantId, {
      title: "Acme API",
      intro: "How to call the DMS",
      apiBaseUrl: "https://dms.acme.com/dms",
      selectedOperations: ["documents.list", "documents.get", "does.not.exist", "documents.list"],
    });
    expect(config.shareToken).toBeTruthy();
    // unknown id dropped, duplicates collapsed
    expect(config.selectedOperations).toEqual(["documents.list", "documents.get"]);
    expect(config.title).toBe("Acme API");

    const { config: again, catalog } = await service.getConfig(platformAdmin, tenantId);
    expect(again?.shareToken).toBe(config.shareToken);
    expect(catalog.length).toBeGreaterThan(0);
  });

  it("forbids non-admins from writing but lets workspace members read", async () => {
    await service.upsertConfig(platformAdmin, tenantId, { selectedOperations: ["documents.list"] });
    const member = memberOf(tenantId);
    await expect(service.getConfig(member, tenantId)).resolves.toMatchObject({ config: { status: "active" } });
    await expect(
      service.upsertConfig(member, tenantId, { selectedOperations: [] })
    ).rejects.toBeInstanceOf(ForbiddenError);

    const outsider: AuthContext = { ...memberOf("t-other") };
    await expect(service.getConfig(outsider, tenantId)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("renders the public page with the tenant base url substituted in", async () => {
    const { shareToken } = await service.upsertConfig(platformAdmin, tenantId, {
      apiBaseUrl: "https://dms.acme.com/dms",
      selectedOperations: ["documents.list"],
    });
    const page = await service.getPublicPage(shareToken);
    expect(page.tenant.name).toBe("Acme Corporation");
    expect(page.apiBaseUrl).toBe("https://dms.acme.com/dms");
    expect(page.operations).toHaveLength(1);
    expect(page.operations[0].curl).toContain("https://dms.acme.com/dms/api/documents");
    expect(page.operations[0].curl).not.toContain(DOC_API_BASE_PLACEHOLDER);
  });

  it("keeps the dummy placeholder when no base url is configured", async () => {
    const { shareToken } = await service.upsertConfig(platformAdmin, tenantId, {
      selectedOperations: ["folders.create"],
    });
    const page = await service.getPublicPage(shareToken);
    expect(page.apiBaseUrl).toBe(DOC_API_BASE_PLACEHOLDER);
    expect(page.operations[0].curl).toContain(DOC_API_BASE_PLACEHOLDER);
  });

  it("hides disabled documentation and unknown tokens", async () => {
    const { shareToken } = await service.upsertConfig(platformAdmin, tenantId, {
      selectedOperations: ["documents.list"],
    });
    await service.patchConfig(platformAdmin, tenantId, { status: "disabled" });
    await expect(service.getPublicPage(shareToken)).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.getPublicPage("no-such-token")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("regenerates the share token on demand", async () => {
    const created = await service.upsertConfig(platformAdmin, tenantId, {
      selectedOperations: ["documents.list"],
    });
    const updated = await service.patchConfig(platformAdmin, tenantId, { regenerateToken: true });
    expect(updated.shareToken).not.toBe(created.shareToken);
    // old token no longer resolves
    await expect(service.getPublicPage(created.shareToken)).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.getPublicPage(updated.shareToken)).resolves.toBeTruthy();
  });

  it("rejects an invalid API base url", async () => {
    await expect(
      service.upsertConfig(platformAdmin, tenantId, { apiBaseUrl: "not-a-url", selectedOperations: [] })
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
