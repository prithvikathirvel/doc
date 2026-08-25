// Generates a minimal, enterprise onboarding .docx template with a branded
// header (logo + wordmark) and footer (confidentiality + page numbers).
//   node brand/build-docx.mjs
// Requires (this turn only): docx
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Header,
  Footer,
  ImageRun,
  PageNumber,
  BorderStyle,
  TabStopType,
  TabStopPosition,
} from "docx";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const r = (p) => join(dir, p);

const icon = readFileSync(r("icon-512.png"));
const ACCENT = "3B5BDB";
const INK = "0F172A";
const MUTED = "8A94A6";
const BORDER = "E5E7EB";

const thinBorder = { style: BorderStyle.SINGLE, size: 6, color: BORDER, space: 6 };
const rule = new Paragraph({
  spacing: { before: 60, after: 240 },
  border: { bottom: thinBorder },
  children: [],
});

const h1 = (text) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 320, after: 120 },
    children: [new TextRun({ text, bold: true, color: INK, size: 30 })],
  });

const h2 = (text) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 220, after: 80 },
    children: [new TextRun({ text, bold: true, color: ACCENT, size: 24 })],
  });

const body = (text) =>
  new Paragraph({
    spacing: { after: 120 },
    children: [new TextRun({ text, color: INK, size: 22 })],
  });

const bullet = (text) =>
  new Paragraph({
    bullet: { level: 0 },
    spacing: { after: 60 },
    children: [new TextRun({ text, color: INK, size: 22 })],
  });

const field = (label, value) =>
  new Paragraph({
    spacing: { after: 60 },
    children: [
      new TextRun({ text: `${label}: `, bold: true, color: MUTED, size: 20 }),
      new TextRun({ text: value, color: INK, size: 20 }),
    ],
  });

const code = (text) =>
  new Paragraph({
    spacing: { before: 60, after: 160 },
    shading: { type: "clear", fill: "F6F7F9" },
    border: {
      top: { style: BorderStyle.SINGLE, size: 4, color: BORDER, space: 6 },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: BORDER, space: 6 },
      left: { style: BorderStyle.SINGLE, size: 12, color: BORDER, space: 6 },
      right: { style: BorderStyle.SINGLE, size: 4, color: BORDER, space: 6 },
    },
    children: [new TextRun({ text, font: "Consolas", color: INK, size: 18 })],
  });

const header = new Header({
  children: [
    new Paragraph({
      spacing: { after: 0 },
      border: { bottom: thinBorder },
      children: [
        new ImageRun({
          data: icon,
          transformation: { width: 34, height: 34 },
        }),
        new TextRun({ text: "   Sify ", bold: true, color: INK, size: 24 }),
        new TextRun({ text: "DMS", color: MUTED, size: 24 }),
      ],
    }),
  ],
});

const footer = new Footer({
  children: [
    new Paragraph({
      tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
      border: { top: thinBorder },
      children: [
        new TextRun({ text: "Sify DMS  ·  Confidential", color: MUTED, size: 16 }),
        new TextRun({ text: "\tPage ", color: MUTED, size: 16 }),
        new TextRun({ children: [PageNumber.CURRENT], color: MUTED, size: 16 }),
        new TextRun({ text: " of ", color: MUTED, size: 16 }),
        new TextRun({ children: [PageNumber.TOTAL_PAGES], color: MUTED, size: 16 }),
      ],
    }),
  ],
});

const title = new Paragraph({
  spacing: { before: 240, after: 40 },
  children: [new TextRun({ text: "Sify ", bold: true, color: ACCENT, size: 56 }), new TextRun({ text: "DMS", color: MUTED, size: 56 })],
});
const subtitle = new Paragraph({
  spacing: { after: 80 },
  children: [new TextRun({ text: "Customer Onboarding Guide", color: INK, size: 30 })],
});
const meta = new Paragraph({
  spacing: { after: 0 },
  children: [
    new TextRun({ text: "Prepared for: ", color: MUTED, size: 20 }),
    new TextRun({ text: "[Tenant name]", color: INK, size: 20 }),
    new TextRun({ text: "    Date: ", color: MUTED, size: 20 }),
    new TextRun({ text: "[YYYY-MM-DD]", color: INK, size: 20 }),
  ],
});

const doc = new Document({
  creator: "Sify DMS",
  title: "Sify DMS — Customer Onboarding Guide",
  description: "Editable onboarding template with a branded header and footer.",
  styles: {
    default: {
      document: { run: { font: "Calibri", size: 22, color: INK } },
    },
  },
  sections: [
    {
      properties: {},
      headers: { default: header },
      footers: { default: footer },
      children: [
        title,
        subtitle,
        meta,
        rule,

        h1("1. Welcome"),
        body("Welcome to Sify DMS — secure, multi-tenant enterprise document management. This guide walks your team through signing in, accessing the API, and uploading your first documents."),
        body("Replace the bracketed placeholders with your workspace details before sharing this document with your customer."),

        h1("2. Your workspace"),
        body("Each customer gets an isolated workspace. Documents, folders and permissions are scoped to it and never cross tenants."),
        field("Workspace name", "[Tenant name]"),
        field("Sign-in link", "[https://<host>/dms/login?tenant=<tenant-id>]"),
        field("Owner sign-in", "[owner@example.com]"),
        field("Tenant ID (API header x-tenant-id)", "[<tenant-id>]"),
        field("Maximum file size", "[50 MB]"),

        h1("3. API access"),
        body("Machine-to-machine calls authenticate with an API key. A platform administrator creates keys in the console under Admin → API keys; the full key is shown only once."),
        h2("Request headers"),
        bullet("x-api-key — your machine key (required)."),
        bullet("x-tenant-id — selects the workspace (optional when the key is scoped to one workspace)."),
        bullet("x-user-id — attributes the action to one of your end users (optional)."),
        code("curl https://<host>/dms/api/documents \\\n  -H \"x-api-key: <your-key>\" \\\n  -H \"x-tenant-id: <tenant-id>\""),

        h1("4. Upload your first document"),
        body("For larger files, create an upload session, PUT the bytes to the signed URL, then confirm. For smaller files, upload directly through the API."),
        code("curl -X POST https://<host>/dms/api/documents \\\n  -H \"x-api-key: <your-key>\" \\\n  -H \"idempotency-key: invoice-2026-08\" \\\n  -H \"content-type: application/json\" \\\n  -d '{\"filename\":\"invoice.pdf\",\"name\":\"August invoice\"}'"),

        h1("5. Folders & sharing"),
        bullet("Organise documents into folders; deleting a folder moves its documents to trash."),
        bullet("Share a document with a user or role at one level: viewer, contributor, manager or owner."),
        bullet("Soft-deleted documents can be restored; permanent delete removes every version from storage."),

        h1("6. Support"),
        body("For help, contact your Sify DMS administrator or the platform operations team."),
        field("Support", "[support@example.com]"),
        field("Documentation link", "[https://<host>/dms/docs/<token>]"),
      ],
    },
  ],
});

const buffer = await Packer.toBuffer(doc);
writeFileSync(r("Sify-DMS-Onboarding-Template.docx"), buffer);
console.log("wrote brand/Sify-DMS-Onboarding-Template.docx", `(${buffer.length} bytes)`);
