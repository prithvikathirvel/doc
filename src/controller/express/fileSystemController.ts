import { Request, Response } from "express";
import { FileSystem } from "../../service/FileSystem";
import path from "path";

export const uploadFile = async (req: any, res: Response) => {
    try {
        let { directory, userName , metaData } = req.body;

        if (!req.file) {
            return res.status(400).json({ error: "File not uploaded" });
        }

        console.log(req.file);
        const filePath = req.file.path;
        const originalFilename = req.file.originalname || path.basename(filePath);
        const fileSystem = new FileSystem("minio");

        const result = await fileSystem.uploadFile(filePath, userName, directory,metaData);

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
        const { directory, fileName } = req.body;
        const fileSystem = new FileSystem("minio");

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
        const fileSystem = new FileSystem("minio");

        await fileSystem.deleteDirectory(directory);

        res.json({ message: "Directory deleted successfully" });
    } catch (error) {
        console.error("Delete Directory Error:", error);
        res.status(500).json({ error: "Failed to delete directory" });
    }
};

export const getUserDirectoryTree = async (req: any, res: Response) => {
    try {
        console.log("Received params:", req.params);
        let { userName } = req.params;

        if (!userName) {
            return res.status(400).json({ success: false, error: "User name is required" });
            // userName = 'pradeep'
        }

        const fileSystem = new FileSystem("minio");
        const fileTree = await fileSystem.getUserDirectoryTree(userName);

        return res.status(200).json(fileTree );
    } catch (error) {
        console.error("Error fetching file tree:", error);
        return res.status(500).json({ success: false, error: "Failed to retrieve file tree" });
    }

    
};

export const listAllUserFilesAndDirectories = async (req: any, res: Response) => {
    try {
        const { userName,name, tag, metadata, sortBy, sortOrder } = req.query;

        const filters = {
          name: name as string,
          tag: tag as string,
          metadata: metadata as string,
        };

        if (!userName || typeof userName !== "string") {
            return res.status(400).json({ error: "userName is required and must be a string" });
        }

        const fileSystem = new FileSystem("minio"); // or "mysql" based on your setup
        const result = await fileSystem.listAllUserFilesAndDirectories(userName,filters,sortBy,sortOrder);

        return res.status(200).json({
            ...result
        });
    } catch (error) {
        console.error("List Files/Directories Error:", error);
        return res.status(500).json({ error: "Failed to list user files and directories" });
    }
}
export const renameUserFileOrDirectory = async (req: any, res: Response) => {
    try {
        const { userName, oldPath, newPath } = req.body;

        // Validation
        if (!userName || typeof userName !== "string") {
            return res.status(400).json({ error: "userName is required and must be a string" });
        }
        if (!oldPath || typeof oldPath !== "string") {
            return res.status(400).json({ error: "oldPath is required and must be a string" });
        }
        if (!newPath || typeof newPath !== "string") {
            return res.status(400).json({ error: "newPath is required and must be a string" });
        }

        // Initialize file system interface
        const fileSystem = new FileSystem("minio"); // or "mysql"

        // Rename object and update metadata
        await fileSystem.renameObject(userName, oldPath, newPath);

        return res.status(200).json({
            message: "Rename successful and metadata updated.",
            data: {
                userName,
                oldPath,
                newPath
            }
        });

    } catch (error) {
        console.error("Rename Error:", error);
        return res.status(500).json({ error: "Failed to rename file or directory" });
    }
};

export const softDeleteDocument = async (req: any, res: any) => {
    try {
        const documentId = req.query.documentId ;
        const fileSystem = new FileSystem("minio");
        const result: any = await fileSystem.softDeleteDocument(documentId);

        if (result.success) {
            return res.status(200).json({
                message: "Delete successful.",
            });
        } else {
            return res.status(404).json({
                message: "Document not found.",
            });
        }
    } catch (error) {
        console.error(error);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};

export const restoreDocument = async (req: any, res: any) => {
    try {
        const documentId = req.query.documentId ;
        const fileSystem = new FileSystem("minio");
        const result: any = await fileSystem.restoreDocument(documentId);

        if (result.success) {
            return res.status(200).json({
                message: "Restore successful.",
            });
        } else {
            return res.status(404).json({
                message: "Document not found.",
            });
        }
    } catch (error) {
        console.error(error);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};


  

