import { Router } from "express";
import {
  createFolder,
  deleteFolder,
  getFolder,
  listFolders,
  updateFolder,
} from "../controller/express/folderController";

const router = Router();

router.post("/", createFolder);
router.get("/", listFolders);
router.get("/:id", getFolder);
router.patch("/:id", updateFolder);
router.delete("/:id", deleteFolder);

export default router;
