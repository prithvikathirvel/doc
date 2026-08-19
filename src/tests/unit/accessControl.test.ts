import { evaluateAccess, flagsForLevel, levelFromFlags, normalizeFlags } from "../../utils/accessControl";
import { AuthContext, DocumentPermission } from "../../service/models";

const tenantId = "11111111-1111-1111-1111-111111111111";

function auth(userId: string, roles: string[] = []): AuthContext {
  return { userId, userName: userId, tenantId, roles };
}

function grant(
  principalType: "user" | "role",
  principalId: string,
  flags: Partial<DocumentPermission>
): DocumentPermission {
  return {
    id: `${principalType}-${principalId}`,
    tenantId,
    documentId: "doc-1",
    principalType,
    principalId,
    canRead: true,
    canWrite: false,
    canDelete: false,
    canAdmin: false,
    createdBy: "owner",
    createdAt: new Date(),
    ...flags,
  };
}

describe("permission levels", () => {
  it("maps levels to flags and back", () => {
    expect(levelFromFlags(flagsForLevel("viewer"))).toBe("viewer");
    expect(levelFromFlags(flagsForLevel("contributor"))).toBe("contributor");
    expect(levelFromFlags(flagsForLevel("manager"))).toBe("manager");
    expect(levelFromFlags(flagsForLevel("owner"))).toBe("owner");
  });

  it("implies lower capabilities from higher ones", () => {
    expect(normalizeFlags({ canDelete: true })).toEqual({
      canRead: true,
      canWrite: true,
      canDelete: true,
      canAdmin: false,
    });
    expect(normalizeFlags({ canAdmin: true })).toEqual({
      canRead: true,
      canWrite: true,
      canDelete: true,
      canAdmin: true,
    });
  });
});

describe("evaluateAccess", () => {
  const document = { createdBy: "owner" };

  it("gives platform administrators full access", () => {
    const access = evaluateAccess({ auth: auth("root", ["platform_admin"]), document });
    expect(access).toMatchObject({ level: "owner", source: "platform_admin", canAdmin: true });
  });

  it("gives tenant administrators full access", () => {
    const access = evaluateAccess({ auth: auth("ops", ["tenant_admin"]), document });
    expect(access.source).toBe("tenant_admin");
    expect(access.canDelete).toBe(true);
  });

  it("treats the legacy admin role as a tenant administrator", () => {
    expect(evaluateAccess({ auth: auth("ops", ["admin"]), document }).canAdmin).toBe(true);
  });

  it("gives the creator ownership", () => {
    const access = evaluateAccess({ auth: auth("owner"), document });
    expect(access).toMatchObject({ level: "owner", source: "creator" });
  });

  it("denies everything without a grant", () => {
    const access = evaluateAccess({ auth: auth("stranger"), document });
    expect(access.canRead).toBe(false);
    expect(access.source).toBe("none");
  });

  it("merges user and role grants, most permissive wins", () => {
    const access = evaluateAccess({
      auth: auth("bob", ["auditor"]),
      document,
      userGrant: grant("user", "bob", { canRead: true }),
      roleGrants: [grant("role", "auditor", { canWrite: true, canDelete: true })],
    });
    expect(access).toMatchObject({ canRead: true, canWrite: true, canDelete: true, canAdmin: false });
    expect(access.level).toBe("manager");
  });

  it("reports a role grant when the user has no personal grant", () => {
    const access = evaluateAccess({
      auth: auth("bob", ["auditor"]),
      document,
      userGrant: null,
      roleGrants: [grant("role", "auditor", {})],
    });
    expect(access.source).toBe("role_grant");
  });
});
