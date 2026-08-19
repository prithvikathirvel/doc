import fs from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "../..");

const VENDOR = [
  "boto3",
  "@aws-sdk/client-s3",
  "@aws-sdk/s3-request-presigner",
  "minio",
  "@google-cloud/storage",
  "@azure/storage-blob",
];

function collect(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collect(full));
    else if (entry.name.endsWith(".ts")) out.push(full);
  }
  return out;
}

describe("vendor isolation", () => {
  it("keeps AWS/MinIO/GCP/Azure SDKs out of domain, application, and API layers", () => {
    const files = [
      ...collect(path.join(ROOT, "domain")),
      ...collect(path.join(ROOT, "application")),
      ...collect(path.join(ROOT, "api")),
    ];
    const violations: string[] = [];
    for (const file of files) {
      const text = fs.readFileSync(file, "utf8");
      for (const vendor of VENDOR) {
        if (text.includes(`from "${vendor}"`) || text.includes(`from '${vendor}'`)) {
          violations.push(`${path.relative(ROOT, file)} imports ${vendor}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("does not ship workflow concepts", () => {
    const files = collect(ROOT).filter((f) => !f.includes(`${path.sep}tests${path.sep}`));
    const hits: string[] = [];
    for (const file of files) {
      const text = fs.readFileSync(file, "utf8");
      if (/workflowInstance|WorkflowService|createWorkflow|handlerFunctionName/.test(text)) {
        hits.push(path.relative(ROOT, file));
      }
    }
    expect(hits).toEqual([]);
  });
});
