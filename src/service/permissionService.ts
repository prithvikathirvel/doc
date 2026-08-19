import { v4 as uuidv4 } from "uuid";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../utils/errors";
import {
  AccessFlags,
  AuthContext,
  Document,
  DocumentAccess,
  DocumentPermission,
  DocumentPermissionView,
  PermissionLevel,
  PrincipalType,
} from "../service/models";
import { DocumentRepository, PermissionRepository } from "../service/ports";
import {
  evaluateAccess,
  flagsForLevel,
  isPermissionLevel,
  levelFromFlags,
  normalizeFlags,
} from "../utils/accessControl";
import { isTenantAdmin } from "../utils/roles";

const PRINCIPAL_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._@+-]{0,254}$/;

export interface GrantPermissionInput {
  principalType: PrincipalType;
  principalId: string;
  /** Preferred contract: a named level. Explicit flags are still accepted. */
  level?: PermissionLevel;
  canRead?: boolean;
  canWrite?: boolean;
  canDelete?: boolean;
  canAdmin?: boolean;
}

export class PermissionService {
  constructor(
    private readonly documents: DocumentRepository,
    private readonly permissions: PermissionRepository
  ) {}

  /** Access grants for a document, including the implicit grant held by its creator. */
  async list(auth: AuthContext, documentId: string): Promise<DocumentPermissionView[]> {
    const document = await this.requireManageAccess(auth, documentId);
    const grants = await this.permissions.listForDocument(auth.tenantId, documentId);
    return grants.map((grant) => toView(grant, document));
  }

  /** The caller's own effective access, so clients can hide actions they cannot perform. */
  async effectiveAccess(auth: AuthContext, documentId: string): Promise<DocumentAccess> {
    const document = await this.requireDocument(auth, documentId);
    return this.accessFor(auth, document);
  }

  async grant(
    auth: AuthContext,
    documentId: string,
    input: GrantPermissionInput
  ): Promise<{ permission: DocumentPermissionView; created: boolean }> {
    const document = await this.requireManageAccess(auth, documentId);

    const principalType = input.principalType;
    if (principalType !== "user" && principalType !== "role") {
      throw new ValidationError('Principal type must be either "user" or "role"');
    }
    const principalId = (input.principalId || "").trim();
    if (!principalId) throw new ValidationError("Principal is required");
    if (!PRINCIPAL_ID_PATTERN.test(principalId)) {
      throw new ValidationError(
        principalType === "user"
          ? "User must be a user id or email address"
          : "Role must contain letters, digits, '.', '_', '-' or '@'"
      );
    }

    const flags = resolveFlags(input);
    if (principalType === "user" && principalId === document.createdBy && !flags.canAdmin) {
      throw new ConflictError("The document owner always keeps full access");
    }
    if (
      principalType === "user" &&
      principalId === auth.userId &&
      !flags.canAdmin &&
      !isTenantAdmin(auth.roles)
    ) {
      throw new ConflictError("You cannot reduce your own access below owner");
    }

    const existing = await this.permissions.findForPrincipal(
      auth.tenantId,
      documentId,
      principalType,
      principalId
    );

    const permission: DocumentPermission = {
      id: existing?.id || uuidv4(),
      tenantId: auth.tenantId,
      documentId,
      principalType,
      principalId,
      ...flags,
      createdBy: existing?.createdBy || auth.userId,
      createdAt: existing?.createdAt || new Date(),
    };

    const saved = await this.permissions.replaceForDocument(permission);
    return { permission: toView(saved, document), created: !existing };
  }

  async revoke(auth: AuthContext, documentId: string, permissionId: string): Promise<void> {
    const document = await this.requireManageAccess(auth, documentId);
    const grants = await this.permissions.listForDocument(auth.tenantId, documentId);
    const target = grants.find((grant) => grant.id === permissionId);
    if (!target) throw new NotFoundError("Permission grant not found");

    if (target.principalType === "user" && target.principalId === document.createdBy) {
      throw new ConflictError("The document owner's access cannot be revoked");
    }
    if (
      target.principalType === "user" &&
      target.principalId === auth.userId &&
      !isTenantAdmin(auth.roles)
    ) {
      throw new ConflictError("You cannot revoke your own access to this document");
    }

    await this.permissions.delete(auth.tenantId, permissionId);
  }

  /** Effective access for an already loaded document. */
  async accessFor(auth: AuthContext, document: Document): Promise<DocumentAccess> {
    if (isTenantAdmin(auth.roles) || document.createdBy === auth.userId) {
      return evaluateAccess({ auth, document });
    }
    const [userGrant, roleGrants] = await Promise.all([
      this.permissions.findForPrincipal(auth.tenantId, document.id, "user", auth.userId),
      Promise.all(
        auth.roles.map((role) =>
          this.permissions.findForPrincipal(auth.tenantId, document.id, "role", role)
        )
      ),
    ]);
    return evaluateAccess({ auth, document, userGrant, roleGrants });
  }

  private async requireDocument(auth: AuthContext, documentId: string): Promise<Document> {
    const document = await this.documents.findById(auth.tenantId, documentId, true);
    if (!document) throw new NotFoundError("Document not found");
    return document;
  }

  private async requireManageAccess(auth: AuthContext, documentId: string): Promise<Document> {
    const document = await this.requireDocument(auth, documentId);
    const access = await this.accessFor(auth, document);
    if (!access.canAdmin) {
      throw new ForbiddenError("Owner access is required to manage sharing for this document");
    }
    return document;
  }
}

function resolveFlags(input: GrantPermissionInput): AccessFlags {
  if (input.level !== undefined) {
    if (!isPermissionLevel(input.level)) {
      throw new ValidationError("Access level must be viewer, contributor, manager or owner");
    }
    return flagsForLevel(input.level);
  }
  const hasFlag =
    input.canRead !== undefined ||
    input.canWrite !== undefined ||
    input.canDelete !== undefined ||
    input.canAdmin !== undefined;
  if (!hasFlag) {
    throw new ValidationError("An access level is required");
  }
  return normalizeFlags(input);
}

function toView(permission: DocumentPermission, document: Document): DocumentPermissionView {
  return {
    ...permission,
    level: levelFromFlags(permission),
    isDocumentCreator:
      permission.principalType === "user" && permission.principalId === document.createdBy,
  };
}
