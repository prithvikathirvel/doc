import { FolderService } from "../../service/folderService";
import { AuthContext, Document } from "../../service/models";
import { ForbiddenError } from "../../utils/errors";
import { InMemoryDocumentRepository, InMemoryFolderRepository } from "../helpers/inMemory";

const tenantId = "11111111-1111-1111-1111-111111111111";
const admin: AuthContext = { userId: "jane", userName: "Jane", tenantId, roles: ["tenant_admin"] };
const member: AuthContext = { userId: "carlos", userName: "Carlos", tenantId, roles: ["member"] };

function documentIn(folderId: string | null, id: string, createdBy = "jane"): Document {
  const now = new Date();
  return {
    id,
    tenantId,
    folderId,
    name: id,
    originalFilename: `${id}.pdf`,
    mimeType: "application/pdf",
    size: 1024,
    checksum: null,
    storageProvider: "fake",
    storageContainer: "documents",
    storageKey: `dms/${tenantId}/${createdBy}/${id}/v1/${id}.pdf`,
    currentVersion: 1,
    status: "active",
    createdBy,
    updatedBy: createdBy,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    idempotencyKey: null,
    metadata: {},
  };
}

describe("FolderService recursive delete", () => {
  let documents: InMemoryDocumentRepository;
  let folders: InMemoryFolderRepository;
  let service: FolderService;

  beforeEach(() => {
    documents = new InMemoryDocumentRepository();
    folders = new InMemoryFolderRepository(documents);
    service = new FolderService(folders);
  });

  async function buildTree() {
    const contracts = await service.create(admin, { name: "Contracts" });
    const y2026 = await service.create(admin, { name: "2026", parentId: contracts.id });
    const signed = await service.create(admin, { name: "Signed", parentId: y2026.id });
    const invoices = await service.create(admin, { name: "Invoices" });

    await documents.create(documentIn(contracts.id, "doc-root"));
    await documents.create(documentIn(y2026.id, "doc-year"));
    await documents.create(documentIn(signed.id, "doc-deep"));
    await documents.create(documentIn(invoices.id, "doc-other"));
    await documents.create(documentIn(null, "doc-loose"));
    return { contracts, y2026, signed, invoices };
  }

  it("summarizes the whole subtree before deleting", async () => {
    const { contracts } = await buildTree();
    const summary = await service.summarize(admin, contracts.id);
    expect(summary).toMatchObject({ folders: 2, documents: 3, bytes: 3072 });
  });

  it("deletes sub-folders and moves their documents to trash", async () => {
    const { contracts, signed, invoices } = await buildTree();

    const result = await service.remove(admin, contracts.id);
    expect(result.foldersDeleted).toBe(3);
    expect(result.documentsTrashed).toBe(3);

    expect(await folders.findById(tenantId, contracts.id)).toBeNull();
    expect(await folders.findById(tenantId, signed.id)).toBeNull();
    expect(await folders.findById(tenantId, invoices.id)).not.toBeNull();

    expect(await documents.findById(tenantId, "doc-deep")).toBeNull();
    expect(await documents.findById(tenantId, "doc-deep", true)).toMatchObject({
      status: "soft_deleted",
    });
    expect(await documents.findById(tenantId, "doc-other")).not.toBeNull();
    expect(await documents.findById(tenantId, "doc-loose")).not.toBeNull();
  });

  it("only lets the owner or a tenant administrator delete a folder", async () => {
    const { invoices } = await buildTree();
    await expect(service.remove(member, invoices.id)).rejects.toBeInstanceOf(ForbiddenError);

    const own = await service.create(member, { name: "Carlos files" });
    await expect(service.remove(member, own.id)).resolves.toMatchObject({ foldersDeleted: 1 });
  });
});
