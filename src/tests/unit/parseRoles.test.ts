import { parseRoles } from "../../dao/mysql/MysqlDirectoryRepository";

/**
 * mysql2 delivers MySQL JSON columns as already-parsed JS values, so a stored
 * ["tenant_admin"] arrives as an array — and JSON.parse(array) crashes with
 * the confusing "Unexpected token 'e', \"tenant_admin\" is not valid JSON".
 */
describe("parseRoles (dms_api_keys.roles_json)", () => {
  it("accepts an already-parsed array (mysql2 default)", () => {
    expect(parseRoles(["tenant_admin"])).toEqual(["tenant_admin"]);
    expect(parseRoles(["member", "tenant_admin"])).toEqual(["member", "tenant_admin"]);
  });

  it("accepts a JSON string", () => {
    expect(parseRoles('["tenant_admin"]')).toEqual(["tenant_admin"]);
  });

  it("accepts hand-written rows: a single role or a comma-separated list", () => {
    expect(parseRoles("tenant_admin")).toEqual(["tenant_admin"]);
    expect(parseRoles("member, tenant_admin")).toEqual(["member", "tenant_admin"]);
  });

  it("never throws on junk or empty values", () => {
    expect(parseRoles('["tenant_admin"')).toEqual(["[\"tenant_admin\""]);
    expect(parseRoles("")).toEqual([]);
    expect(parseRoles(null)).toEqual([]);
    expect(parseRoles(undefined)).toEqual([]);
    expect(parseRoles(42)).toEqual([]);
  });
});
