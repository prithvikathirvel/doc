import {
  AccessFlags,
  AuthContext,
  Document,
  DocumentAccess,
  DocumentPermission,
  PermissionAction,
  PermissionLevel,
} from "../service/models";
import { isPlatformAdmin, isTenantAdmin } from "./roles";

/**
 * Permission levels are the contract the UI and the API share. A grant is always
 * stored as four booleans, but it is created, displayed and audited as one level
 * so that "who can do what" is unambiguous.
 */
export const PERMISSION_LEVELS: PermissionLevel[] = ["viewer", "contributor", "manager", "owner"];

const LEVEL_FLAGS: Record<PermissionLevel, AccessFlags> = {
  viewer: { canRead: true, canWrite: false, canDelete: false, canAdmin: false },
  contributor: { canRead: true, canWrite: true, canDelete: false, canAdmin: false },
  manager: { canRead: true, canWrite: true, canDelete: true, canAdmin: false },
  owner: { canRead: true, canWrite: true, canDelete: true, canAdmin: true },
};

export const PERMISSION_LEVEL_DESCRIPTIONS: Record<PermissionLevel, string> = {
  viewer: "View and download the document and its versions.",
  contributor: "Everything a viewer can do, plus rename and upload new versions.",
  manager: "Everything a contributor can do, plus move the document to trash.",
  owner: "Full control, including granting and revoking access for other principals.",
};

export const NO_ACCESS: AccessFlags = {
  canRead: false,
  canWrite: false,
  canDelete: false,
  canAdmin: false,
};

export function flagsForLevel(level: PermissionLevel): AccessFlags {
  return { ...LEVEL_FLAGS[level] };
}

export function isPermissionLevel(value: unknown): value is PermissionLevel {
  return typeof value === "string" && (PERMISSION_LEVELS as string[]).includes(value);
}

/**
 * Normalizes any combination of flags into a coherent grant:
 * read is implied by every other capability, and admin implies everything.
 */
export function normalizeFlags(input: Partial<AccessFlags>): AccessFlags {
  const canAdmin = Boolean(input.canAdmin);
  const canDelete = canAdmin || Boolean(input.canDelete);
  const canWrite = canAdmin || canDelete || Boolean(input.canWrite);
  const canRead = canAdmin || canWrite || canDelete || input.canRead !== false;
  return { canRead, canWrite, canDelete, canAdmin };
}

/** Maps a stored grant back to the closest level so clients never see ambiguous states. */
export function levelFromFlags(flags: Partial<AccessFlags>): PermissionLevel {
  const normalized = normalizeFlags(flags);
  if (normalized.canAdmin) return "owner";
  if (normalized.canDelete) return "manager";
  if (normalized.canWrite) return "contributor";
  return "viewer";
}

export function allows(flags: AccessFlags, action: PermissionAction): boolean {
  if (flags.canAdmin) return true;
  if (action === "read") return flags.canRead;
  if (action === "write") return flags.canWrite;
  if (action === "delete") return flags.canDelete;
  return false;
}

function merge(a: AccessFlags, b: AccessFlags): AccessFlags {
  return {
    canRead: a.canRead || b.canRead,
    canWrite: a.canWrite || b.canWrite,
    canDelete: a.canDelete || b.canDelete,
    canAdmin: a.canAdmin || b.canAdmin,
  };
}

/**
 * Resolves the effective access a caller has on a document.
 *
 * Precedence: platform admin → tenant admin → document creator → grants
 * (user grant and role grants are merged, most permissive wins).
 */
export function evaluateAccess(params: {
  auth: AuthContext;
  document: Pick<Document, "createdBy">;
  userGrant?: DocumentPermission | null;
  roleGrants?: Array<DocumentPermission | null>;
}): DocumentAccess {
  const { auth, document } = params;

  if (isPlatformAdmin(auth.roles)) {
    return { ...flagsForLevel("owner"), level: "owner", source: "platform_admin" };
  }
  if (isTenantAdmin(auth.roles)) {
    return { ...flagsForLevel("owner"), level: "owner", source: "tenant_admin" };
  }
  if (document.createdBy === auth.userId) {
    return { ...flagsForLevel("owner"), level: "owner", source: "creator" };
  }

  const grants = [params.userGrant, ...(params.roleGrants || [])].filter(
    (grant): grant is DocumentPermission => Boolean(grant)
  );
  if (grants.length === 0) {
    return { ...NO_ACCESS, level: "viewer", source: "none" };
  }

  const flags = grants.map(normalizeFlags).reduce(merge, NO_ACCESS);
  const hasUserGrant = Boolean(params.userGrant);
  return {
    ...flags,
    level: levelFromFlags(flags),
    source: hasUserGrant ? "user_grant" : "role_grant",
  };
}

export function hasAnyAccess(access: DocumentAccess): boolean {
  return access.canRead || access.canWrite || access.canDelete || access.canAdmin;
}
