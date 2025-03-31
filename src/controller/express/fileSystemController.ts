import { Request, Response } from "express";
import { FileSystem } from "../../service/FileSystem.js";
import path from "path";



// export const uploadFile = async (req: any, res: Response) => {
//     try {
//         let { directory,userName } = req.body;

//         if(!req.file){
//             res.status(500).json({ error: "File not uploaded" });
//         }else{
//             console.log(req.file);
//         }
//         const filePath = req.file.path;
//         const originalFilename = req.file.originalname || path.basename(filePath);
//         const fileSystem = new FileSystem("minio");

//         const result = await fileSystem.uploadFile(filePath,userName, directory);

//         res.json({ message: "File uploaded successfully", result });
//     } catch (error) {
//         console.error("Upload Error:", error);
//         res.status(500).json({ error: "Failed to upload file" });
//     }
// };

export const uploadFile = async (req: any, res: Response) => {
    try {
        let { directory, userName } = req.body;

        if (!req.file) {
            return res.status(400).json({ error: "File not uploaded" });
        }

        console.log(req.file);
        const filePath = req.file.path;
        const originalFilename = req.file.originalname || path.basename(filePath);
        const fileSystem = new FileSystem("minio");

        const result = await fileSystem.uploadFile(filePath, userName, directory);

        return res.json({ message: "File uploaded successfully", result });
    } catch (error) {
        console.error("Upload Error:", error);
        return res.status(500).json({ error: "Failed to upload file" });
    }
};

export const downloadFile = async (req: Request, res: Response) => {
    try {
        const { remotePath,userDirectory } = req.body;
        const fileSystem = new FileSystem("minio");

        const filePath = await fileSystem.downloadFile(userDirectory,remotePath);

        res.json({ message: "File downloaded successfully", filePath });
    } catch (error) {
        console.error("Download Error:", error);
        res.status(500).json({ error: "Failed to download file" });
    }
};

export const deleteFile = async (req: Request, res: Response) => {
    try {
        const { storageType, directory, fileName } = req.body;
        const fileSystem = new FileSystem(storageType);

        await fileSystem.deleteFile(directory, fileName);

        res.json({ message: "File deleted successfully" });
    } catch (error) {
        console.error("Delete File Error:", error);
        res.status(500).json({ error: "Failed to delete file" });
    }
};

export const deleteDirectory = async (req: Request, res: Response) => {
    try {
        const { storageType, directory } = req.body;
        const fileSystem = new FileSystem(storageType);

        await fileSystem.deleteDirectory(directory);

        res.json({ message: "Directory deleted successfully" });
    } catch (error) {
        console.error("Delete Directory Error:", error);
        res.status(500).json({ error: "Failed to delete directory" });
    }
};
