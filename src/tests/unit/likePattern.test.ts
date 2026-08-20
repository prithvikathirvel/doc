import fs from "fs";
import path from "path";
import { LIKE_ESCAPE, likePrefix } from "../../dao/mysql/MysqlFolderRepository";

describe("folder subtree LIKE patterns", () => {
  it("matches descendants of a plain path", () => {
    expect(likePrefix("/Contracts")).toBe("/Contracts/%");
    expect(likePrefix("/Contracts/2026")).toBe("/Contracts/2026/%");
  });

  it("escapes wildcards so a folder name cannot widen the match", () => {
    expect(likePrefix("/50%_off")).toBe("/50!%!_off/%");
    expect(likePrefix("/a!b")).toBe("/a!!b/%");
    expect(LIKE_ESCAPE).toBe("!");
  });

  it("never uses a backslash as escape character in SQL", () => {
    // A backslash is also an escape inside MySQL string literals and its meaning
    // depends on the NO_BACKSLASH_ESCAPES sql_mode, which previously broke the query.
    const source = fs.readFileSync(
      path.join(__dirname, "../../dao/mysql/MysqlFolderRepository.ts"),
      "utf8"
    );
    expect(source).not.toContain("\\");
    expect(source.match(/ESCAPE '!'/g)?.length).toBeGreaterThanOrEqual(4);
  });
});
