import { v4 as uuidv4 } from "uuid";
import { ForbiddenError, NotFoundError, ValidationError } from "../utils/errors";
import { AuthContext, DocumentPermission } from "../service/models";
import { DocumentRepository, PermissionRepository } from "../service/ports";

export class PermissionService {
  constructor(
    private readonly documents: DocumentRepository,
    private readonly permissions: PermissionRepository
  ) {}

  async list(auth: AuthContext, documentId: string): Promise<DocumentPermission[]> {
    await this.requireAdmin(auth, documentId);
    return this.permissions.listForDocument(auth.tenantId, documentId);
  }

  async grant(
    auth: AuthContext,
    documentId: string,
    input: {
      principalType: "user" | "role";
      principalId: string;
      canRead?: boolean;
      canWrite?: boolean;
      canDelete?: boolean;
      canAdmin?: boolean;
    }
  ): Promise<DocumentPermission> {
    await this.requireAdmin(auth, documentId);
    if (!input.principalId) throw new ValidationError("principalId is required");
    if (input.principalType !== "user" && input.principalType !== "role") {
      throw new ValidationError("principalType must be user or role");
    }
    return this.permissions.replaceForDocument({
      id: uuidv4(),
      tenantId: auth.tenantId,
      documentId,
      principalType: input.principalType,
      principalId: input.principalId,
      canRead: input.canRead !== false,
      canWrite: Boolean(input.canWrite),
      canDelete: Boolean(input.canDelete),
      canAdmin: Boolean(input.canAdmin),
      createdBy: auth.userId,
      createdAt: new Date(),
    });
  }

  async revoke(auth: AuthContext, documentId: string, permissionId: string): Promise<void> {
    await this.requireAdmin(auth, documentId);
    await this.permissions.delete(auth.tenantId, permissionId);
  }

  private async requireAdmin(auth: AuthContext, documentId: string): Promise<void> {
    const document = await this.documents.findById(auth.tenantId, documentId, true);
    if (!document) throw new NotFoundError("Document not found");
    if (auth.roles.includes("tenant_admin") || auth.roles.includes("admin") || document.createdBy === auth.userId) {
      return;
    }
    const perm = await this.permissions.findForPrincipal(auth.tenantId, documentId, "user", auth.userId);
    if (!perm?.canAdmin) {
      throw new ForbiddenError("Admin permission required");
    }
  }
}
