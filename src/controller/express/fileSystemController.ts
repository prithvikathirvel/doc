import { Request, Response } from "express";
import { FileSystem } from "../../service/FileSystem.js";
import path from "path";

export const uploadFile = async (req: any, res: Response) => {
    try {
        let { directory, userName } = req.body;

        if (!req.file) {
            return res.status(400).json({ error: "File not uploaded" });
        }

        console.log(req.file);
        const filePath = req.file.path;
        const originalFilename = req.file.originalname || path.basename(filePath);
        const fileSystem = new FileSystem("minio","mysql");

        const result = await fileSystem.uploadFile(filePath, userName, directory);

        return res.json({ message: "File uploaded successfully", result });
    } catch (error) {
        console.error("Upload Error:", error);
        return res.status(500).json({ error: "Failed to upload file" });
    }
};

export const downloadFile = async (req: Request, res: Response) => {
    try {
        console.log('controller');
        const { remotePath,userDirectory } = req.body;
        const fileSystem = new FileSystem("minio","mongo");

        const filePath = await fileSystem.downloadFile(userDirectory,remotePath);

        res.json({ message: "File downloaded successfully", filePath });
    } catch (error) {
        console.error("Download Error:", error);
        res.status(500).json({ error: "Failed to download file" });
    }
};

export const deleteFile = async (req: Request, res: Response) => {
    try {
        const { directory, fileName } = req.body;
        const fileSystem = new FileSystem("minio","mongo");

        await fileSystem.deleteFile(directory, fileName);

        res.json({ message: "File deleted successfully" });
    } catch (error) {
        console.error("Delete File Error:", error);
        res.status(500).json({ error: "Failed to delete file" });
    }
};

export const deleteDirectory = async (req: Request, res: Response) => {
    try {
        const { directory } = req.body;
        const fileSystem = new FileSystem("minio","mongo");

        await fileSystem.deleteDirectory(directory);

        res.json({ message: "Directory deleted successfully" });
    } catch (error) {
        console.error("Delete Directory Error:", error);
        res.status(500).json({ error: "Failed to delete directory" });
    }
};

export const getUserDirectoryTree = async (req: any, res: Response) => {
    try {
        console.log("Received params:", req.query);
        let { userName } = req.query;

        if (!userName) {
            // return res.status(400).json({ success: false, error: "User name is required" });
            userName = 'persia'
        }

        const fileSystem = new FileSystem("minio", "mysql");
        const fileTree = await fileSystem.getUserDirectoryTree(userName);

        return res.status(200).json(fileTree );
    } catch (error) {
        console.error("Error fetching file tree:", error);
        return res.status(500).json({ success: false, error: "Failed to retrieve file tree" });
    }

    
};

export const listAllUserFilesAndDirectories = async (req: any, res: Response) => {
    try {
        // const { userName } = req.query;
        let userName = 'persia'

        if (!userName || typeof userName !== "string") {
            return res.status(400).json({ error: "userName is required and must be a string" });
        }

        const fileSystem = new FileSystem("minio", "mongo"); // or "mysql" based on your setup
        const result = await fileSystem.listAllUserFilesAndDirectories(userName);

        return res.status(200).json({
            ...result
        });
    } catch (error) {
        console.error("List Files/Directories Error:", error);
        return res.status(500).json({ error: "Failed to list user files and directories" });
    }
}


