import { normalizeParams } from "../../dbConnection/pool";

describe("bind parameter normalization", () => {
  it("converts undefined values to SQL NULL", () => {
    expect(
      normalizeParams({
        provider: "minio",
        container: "dd1",
        region: undefined,
        projectId: undefined,
        useSsl: 0,
      })
    ).toEqual({ provider: "minio", container: "dd1", region: null, projectId: null, useSsl: 0 });
  });

  it("handles arrays and leaves other values untouched", () => {
    expect(normalizeParams([1, undefined, "x"])).toEqual([1, null, "x"]);
    expect(normalizeParams(undefined)).toBeUndefined();
    expect(normalizeParams("plain")).toBe("plain");
  });
});
