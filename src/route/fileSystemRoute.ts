import { Router } from "express";
import { uploadFile, downloadFile, deleteFile, deleteDirectory } from "../controller/express/fileSystemController.js";

const router = Router();
import multer from "multer";
// const upload = multer({ dest: "uploads/" }); // This stores files in "uploads/" folder
const storage = multer.diskStorage({
    destination: "uploads/",
    filename: (req, file, cb) => {
        cb(null, file.originalname); // Preserve the original filename
    },
});

const upload = multer({ storage });
router.post("/upload", upload.single("file"), uploadFile);
router.post("/download", downloadFile);
router.delete("/delete-file", deleteFile);
router.delete("/delete-directory", deleteDirectory);

export default router;
