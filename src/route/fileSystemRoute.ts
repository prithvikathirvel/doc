import { Router } from "express";
import { uploadFile, downloadFile, deleteFile, deleteDirectory,getUserDirectoryTree, listAllUserFilesAndDirectories,renameUserFileOrDirectory, softDeleteDocument , restoreDocument, downloadDocument, getDocumentDetails, updateDocumentDetails} from "../controller/express/fileSystemController";

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
router.get("/download/*", downloadFile);
router.delete("/delete-file", deleteFile);
router.delete("/delete-directory", deleteDirectory);
// router.get('/user/:userName',getUserDirectoryTree)
router.get('/user/:userName', getUserDirectoryTree);
router.post('/allFiles',listAllUserFilesAndDirectories);
router.put('/allFiles/:assetId',updateDocumentDetails);
router.post('/rename',renameUserFileOrDirectory);
router.post('/delete/soft',softDeleteDocument);
router.post('/restore',restoreDocument);
router.get('/downloadDocument', downloadDocument);
router.get('/documentDetails/:assetId', getDocumentDetails);

export default router;
