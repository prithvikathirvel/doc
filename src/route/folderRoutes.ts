import { Router } from "express";
import {
  createFolder,
  deleteFolder,
  ensureFolder,
  getFolder,
  getFolderSummary,
  listFolders,
  resolveFolder,
  updateFolder,
} from "../controller/express/folderController";
import { listFolderMaps, saveFolderMaps } from "../controller/express/folderMapController";

const router = Router();

// Path-addressed helpers and the tenant's folder maps. These specific routes
// must be registered before /:id so "maps"/"ensure"/"resolve" are not captured
// as a folder id.
router.get("/maps", listFolderMaps);
router.put("/maps", saveFolderMaps);
router.post("/ensure", ensureFolder);
router.get("/resolve", resolveFolder);

router.post("/", createFolder);
router.get("/", listFolders);
router.get("/:id", getFolder);
router.get("/:id/summary", getFolderSummary);
router.patch("/:id", updateFolder);
router.delete("/:id", deleteFolder);

export default router;
