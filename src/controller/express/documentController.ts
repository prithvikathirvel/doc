import { NextFunction, Request, Response } from "express";
import { container } from "../../config/container";
import { ValidationError } from "../../utils/errors";
import {
  completeUploadSchema,
  createDocumentSchema,
  createVersionSchema,
  grantPermissionSchema,
  renameDocumentSchema,
} from "../../validator/documentSchemas";
import { PERMISSION_LEVELS, PERMISSION_LEVEL_DESCRIPTIONS } from "../../utils/accessControl";

/** Levels a client can choose from, sent alongside the grants so both stay in sync. */
const PERMISSION_LEVEL_CATALOG = PERMISSION_LEVELS.map((level) => ({
  level,
  description: PERMISSION_LEVEL_DESCRIPTIONS[level],
}));

const documents = () => container.documentService;
const permissions = () => container.permissionService;

function validate<T>(schema: { validate: (v: unknown) => { error?: { message: string }; value: T } }, payload: unknown): T {
  const { error, value } = schema.validate(payload);
  if (error) throw new ValidationError(error.message.replace(/"/g, ""));
  return value;
}

/**
 * Extracts an exact-match metadata filter from the query string. With the
 * default Express query parser, "metadata.orgId=x&metadata.formId=y" arrives
 * nested as { metadata: { orgId: "x", formId: "y" } }.
 */
function metadataQuery(query: Record<string, unknown>): Record<string, string> | undefined {
  const result: Record<string, string> = {};
  const push = (key: string, value: unknown) => {
    if (value === undefined || value === null || value === "") return;
    result[key] = Array.isArray(value) ? String(value[0]) : String(value);
  };
  // Bracket syntax (?metadata[orgId]=x) arrives nested; dotted syntax
  // (?metadata.orgId=x) arrives as a flat "metadata.orgId" key — support both.
  const nested = query.metadata;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    for (const [key, value] of Object.entries(nested as Record<string, unknown>)) push(key, value);
  }
  for (const [key, value] of Object.entries(query)) {
    if (key.startsWith("metadata.")) push(key.slice("metadata.".length), value);
  }
  return Object.keys(result).length ? result : undefined;
}

/**
 * Resolves the three mutually exclusive ways to target a folder on upload:
 * folderId (as before), folderPath (ensured idempotently) or folderMap +
 * folderVars (template resolved and ensured). Nothing downstream changes —
 * the service still receives a plain folderId.
 */
async function applyFolderTargeting(
  req: Request,
  payload: { folderId?: string | null; folderPath?: string; folderMap?: string; folderVars?: Record<string, string> }
): Promise<void> {
  const hasFolderId = payload.folderId !== undefined && payload.folderId !== null;
  const hasPath = Boolean(payload.folderPath);
  const hasMap = Boolean(payload.folderMap);
  if ([hasFolderId, hasPath, hasMap].filter(Boolean).length > 1) {
    throw new ValidationError("Provide only one of folderId, folderPath or folderMap");
  }
  if (hasPath) {
    const { folder } = await container.folderService.ensurePath(req.auth, payload.folderPath as string);
    payload.folderId = folder.id;
  } else if (hasMap) {
    const path = await container.folderMapService.resolvePath(
      req.auth,
      req.auth.tenantId,
      payload.folderMap as string,
      payload.folderVars
    );
    const { folder } = await container.folderService.ensurePath(req.auth, path);
    payload.folderId = folder.id;
  }
  delete payload.folderPath;
  delete payload.folderMap;
  delete payload.folderVars;
}

export async function createDocument(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const payload = validate(createDocumentSchema, {
      ...req.body,
      idempotencyKey: req.body.idempotencyKey || req.header("idempotency-key"),
    });
    await applyFolderTargeting(req, payload);
    if (req.file) {
      const document = await documents().uploadDirect(req.auth, {
        ...payload,
        filename: payload.filename || req.file.originalname,
        mimeType: payload.mimeType || req.file.mimetype,
        size: req.file.size,
        body: req.file.buffer,
      });
      res.status(201).json({ document });
      return;
    }
    const result = await documents().createUploadSession(req.auth, payload);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

export async function listDocuments(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    let folderId: string | null | undefined =
      req.query.folderId === "null" ? null : (req.query.folderId as string | undefined);
    // ?path=/submissions/org-123/form-456 resolves to that folder in one call.
    if (typeof req.query.path === "string" && req.query.path.trim()) {
      const folder = await container.folderService.resolvePath(req.auth, req.query.path);
      folderId = folder.id;
    }
    const result = await documents().list(req.auth, {
      folderId,
      q: req.query.q as string | undefined,
      createdBy: req.query.createdBy as string | undefined,
      metadata: metadataQuery(req.query as Record<string, unknown>),
      includeDeleted: req.query.includeDeleted === "true",
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      offset: req.query.offset ? Number(req.query.offset) : undefined,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function getDocument(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const document = await documents().get(req.auth, req.params.id, req.query.includeDeleted === "true");
    const access = await documents().accessFor(req.auth, document);
    res.json({ document, access });
  } catch (err) {
    next(err);
  }
}

export async function getDocumentMetadata(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await documents().metadata(req.auth, req.params.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function completeDocumentUpload(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const payload = validate(completeUploadSchema, req.body || {});
    const document = await documents().completeUpload(req.auth, req.params.id, payload);
    res.json({ document });
  } catch (err) {
    next(err);
  }
}

export async function requestDownload(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const version = req.body?.versionNumber || req.query.versionNumber;
    const result = await documents().createDownloadSession(
      req.auth,
      req.params.id,
      version ? Number(version) : undefined
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function requestPreview(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const version = req.body?.versionNumber || req.query.versionNumber;
    const result = await documents().createPreviewSession(
      req.auth,
      req.params.id,
      version ? Number(version) : undefined
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function streamDownload(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const version = req.query.versionNumber ? Number(req.query.versionNumber) : undefined;
    const inline = req.query.disposition === "inline";
    const result = await documents().streamDownload(req.auth, req.params.id, version);
    const fallbackName = result.document.originalFilename.replace(/["\\]/g, "_");
    res.setHeader("Content-Type", result.document.mimeType || "application/octet-stream");
    res.setHeader(
      "Content-Disposition",
      `${inline ? "inline" : "attachment"}; filename="${fallbackName}"`
    );
    result.download.body.pipe(res);
  } catch (err) {
    next(err);
  }
}

export async function deleteDocument(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const permanent = req.query.permanent === "true" || req.body?.permanent === true;
    if (permanent) {
      const result = await documents().permanentDelete(req.auth, req.params.id);
      res.json(result);
      return;
    }
    const document = await documents().softDelete(req.auth, req.params.id);
    res.json({ document });
  } catch (err) {
    next(err);
  }
}

export async function restoreDocument(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const document = await documents().restore(req.auth, req.params.id);
    res.json({ document });
  } catch (err) {
    next(err);
  }
}

export async function renameDocument(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const payload = validate(renameDocumentSchema, req.body);
    const document = await documents().rename(req.auth, req.params.id, payload.name, payload.folderId);
    res.json({ document });
  } catch (err) {
    next(err);
  }
}

export async function createVersion(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const payload = validate(createVersionSchema, req.body || {});
    if (req.file) {
      const document = await documents().uploadNewVersion(req.auth, req.params.id, {
        filename: payload.filename || req.file.originalname,
        mimeType: payload.mimeType || req.file.mimetype,
        size: req.file.size,
        name: payload.name,
        body: req.file.buffer,
      });
      res.status(201).json({ document });
      return;
    }
    const result = await documents().createVersionSession(req.auth, req.params.id, {
      filename: payload.filename || "file.bin",
      mimeType: payload.mimeType,
      size: payload.size,
      name: payload.name,
    });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

export async function listVersions(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const versions = await documents().listVersions(req.auth, req.params.id);
    res.json({ versions });
  } catch (err) {
    next(err);
  }
}

export async function listPermissions(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const [items, access] = await Promise.all([
      permissions().list(req.auth, req.params.id),
      permissions().effectiveAccess(req.auth, req.params.id),
    ]);
    res.json({ permissions: items, access, levels: PERMISSION_LEVEL_CATALOG });
  } catch (err) {
    next(err);
  }
}

export async function grantPermission(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const payload = validate(grantPermissionSchema, req.body);
    const { permission, created } = await permissions().grant(req.auth, req.params.id, payload);
    res.status(created ? 201 : 200).json({ permission });
  } catch (err) {
    next(err);
  }
}

export async function revokePermission(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await permissions().revoke(req.auth, req.params.id, req.params.permissionId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
