import { Router } from "express";
import multer from "multer";
import { settings } from "../config/settings";
import {
  completeDocumentUpload,
  createDocument,
  createVersion,
  deleteDocument,
  getDocument,
  getDocumentMetadata,
  grantPermission,
  listDocuments,
  listPermissions,
  listVersions,
  renameDocument,
  requestDownload,
  restoreDocument,
  revokePermission,
  streamDownload,
} from "../controller/express/documentController";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: settings.maxUploadBytes },
});

const router = Router();

router.post("/", upload.single("file"), createDocument);
router.get("/", listDocuments);
router.get("/:id", getDocument);
router.patch("/:id", renameDocument);
router.delete("/:id", deleteDocument);
router.post("/:id/restore", restoreDocument);
router.post("/:id/upload", completeDocumentUpload);
router.post("/:id/download", requestDownload);
router.get("/:id/content", streamDownload);
router.get("/:id/metadata", getDocumentMetadata);
router.post("/:id/versions", upload.single("file"), createVersion);
router.get("/:id/versions", listVersions);
router.post("/:id/permissions", grantPermission);
router.get("/:id/permissions", listPermissions);
router.delete("/:id/permissions/:permissionId", revokePermission);

export default router;
