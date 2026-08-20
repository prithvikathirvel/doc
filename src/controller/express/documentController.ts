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

export async function createDocument(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const payload = validate(createDocumentSchema, {
      ...req.body,
      idempotencyKey: req.body.idempotencyKey || req.header("idempotency-key"),
    });
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
    const result = await documents().list(req.auth, {
      folderId: req.query.folderId === "null" ? null : (req.query.folderId as string | undefined),
      q: req.query.q as string | undefined,
      createdBy: req.query.createdBy as string | undefined,
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

export async function streamDownload(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const version = req.query.versionNumber ? Number(req.query.versionNumber) : undefined;
    const result = await documents().streamDownload(req.auth, req.params.id, version);
    res.setHeader("Content-Type", result.document.mimeType || "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${result.document.originalFilename}"`);
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
