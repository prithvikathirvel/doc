import * as Minio from 'minio';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import MongoRepository from '../mongo/MongoRepository';
import MySQLRepository from '../mysql/MysqlRepository';
//import { validateFile } from '../../validation/fileValidator';


// Define __dirname in ES Module
// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);

console.log(__dirname);

class MinioRepository {
    client: Minio.Client;
    bucketName: string;
    downloadsPath: string;
    mongoRepository = new MongoRepository();
    mysqlRepository = new MySQLRepository();

    constructor() {
        // this.mongoRepository = new MongoRepository();
        this.client = new Minio.Client({
            endPoint: '127.0.0.1',
            port: 9002,
            useSSL: false,
            accessKey: 'admin',
            secretKey: 'password'
        });
        this.bucketName = 'pepin';
        this.downloadsPath = path.join(__dirname, '../downloads');
        if (!fs.existsSync(this.downloadsPath)) {
            fs.mkdirSync(this.downloadsPath, { recursive: true });
        }
    }

    // Ensure bucket exists before operations
    async ensureBucketExists(bucketName: string) {
        const exists = await this.client.bucketExists(bucketName).catch(() => false);
        if (!exists) {
            await this.client.makeBucket(bucketName, 'us-east-1');
            console.log(`✅ Bucket "${bucketName}" created.`);
        }
        // Enable versioning
        await this.client.setBucketVersioning(bucketName, { Status: 'Enabled' });
    }

    async uploadFile(filePath: string, userName: string, destinationPath: string, metadata?: Record<string, any>) {
        console.log(`🛠️ Raw filePath received: "${filePath}"`);
    
        let parsedMetadata: Record<string, any> = {};
    
        // If metadata is a string, try to parse it
        if (typeof metadata === 'string') {
            try {
                parsedMetadata = JSON.parse(metadata);
            } catch (err) {
                console.error("❌ Failed to parse metadata JSON:", err);
                throw new Error("Invalid metadata format. Must be a valid JSON string.");
            }
        } else if (typeof metadata === 'object' && metadata !== null) {
            // If metadata is already an object, use it
            parsedMetadata = metadata;
        }
    
        // Validate file
        // const { mimeType, size } = validateFile(filePath);
        const pathParts = filePath.split(/[/\\]/);
        const originalFileName = pathParts[pathParts.length - 1];
    
        // Clean the destination path to avoid unwanted characters
        const cleanDestination = destinationPath.replace(/[^a-zA-Z0-9/_-]/g, '').replace(/\s+/g, '_');
        const fullPath = cleanDestination ? `${userName}/${cleanDestination}/${originalFileName}` : originalFileName;
    
        try {
            // Ensure bucket exists before uploading
            await this.ensureBucketExists(this.bucketName);
            
            // Upload the file to the storage (MinIO in your case)
            await this.client.fPutObject(this.bucketName, fullPath, filePath);
            console.log(`✅ File uploaded to "${this.bucketName}/${fullPath}"`);
    
            // Store metadata in the MySQL repository
            await this.mysqlRepository.uploadFileMetaData({
                fileName: originalFileName,
                fileSize: 1,
                mimeType:'2',
                storageType: 'minio',
                additionalMetadata: {
                    userName,
                    uploadedPath: fullPath,
                    ...parsedMetadata // Include metadata fields like title, description, tags
                }
            });
    
            console.log(`✅ File metadata stored for "${originalFileName}"`);
        } catch (error) {
            // Catch any errors and log them
            console.error("❌ Error during file upload:", error);
            throw error; // Rethrow the error for further handling if needed
        }
    }
    

    // async uploadFile(filePath: string, userName: string, destinationPath: string, metadata?: Record<string, any>) {
    //     console.log(`🛠️ Raw filePath received: "${filePath}"`);
    //     let parsedMetadata: Record<string, any> = {};
    //     if (typeof metadata === 'string') {
    //         try {
    //             parsedMetadata = JSON.parse(metadata);
    //         } catch (err) {
    //             console.error("❌ Failed to parse metadata JSON:", err);
    //             throw new Error("Invalid metadata format. Must be a valid JSON string.");
    //         }
    //     } else if (typeof metadata === 'object' && metadata !== null) {
    //         parsedMetadata = metadata;
    //     }
    //     const { mimeType, size } = validateFile(filePath);
    //     const pathParts = filePath.split(/[/\\]/);
    //     const originalFileName = pathParts[pathParts.length - 1];
    //     const cleanDestination = destinationPath.replace(/[^a-zA-Z0-9/_-]/g, '').replace(/\s+/g, '_');
    //     const fullPath = cleanDestination ? `${userName}/${cleanDestination}/${originalFileName}` : originalFileName;

    //     await this.ensureBucketExists(this.bucketName);
    //     await this.client.fPutObject(this.bucketName, fullPath, filePath);

    //     console.log(`✅ File uploaded to "${this.bucketName}/${fullPath}"`);

    //     await this.mysqlRepository.uploadFileMetaData({
    //         fileName: originalFileName,
    //         fileSize: size,
    //         mimeType,
    //         storageType: 'minio',
    //         additionalMetadata: {
    //             userName,
    //             uploadedPath: fullPath,
    //             ...parsedMetadata // ✅ additional fields like title, description, tags
    //         }
    //     });

    //     console.log(`✅ File metadata stored for "${originalFileName}"`);
    // }

    // async uploadFile(filePath: string, userName: string, destinationPath: string, metadata?: Record<string, any> | string) {
    //     console.log(`🛠️ Raw filePath received: "${filePath}"`);
    
    //     // Parse metadata if it's a string
    //     let parsedMetadata: Record<string, any> = {};
    //     if (typeof metadata === 'string') {
    //         try {
    //             parsedMetadata = JSON.parse(metadata);
    //         } catch (err) {
    //             console.error("❌ Failed to parse metadata JSON:", err);
    //             throw new Error("Invalid metadata format. Must be a valid JSON string.");
    //         }
    //     } else if (typeof metadata === 'object' && metadata !== null) {
    //         parsedMetadata = metadata;
    //     }
    
    //     const { mimeType, size } = validateFile(filePath);
    
    //     const pathParts = filePath.split(/[/\\]/);
    //     const originalFileName = pathParts[pathParts.length - 1];
    
    //     const cleanDestination = destinationPath
    //         .replace(/[^a-zA-Z0-9/_-]/g, '')   // Remove unwanted characters
    //         .replace(/\s+/g, '_');              // Replace spaces with underscores
    
    //     const fullPath = cleanDestination ? `${userName}/${cleanDestination}/${originalFileName}` : originalFileName;
    
    //     await this.ensureBucketExists(this.bucketName);
    
    //     // Upload the file to Minio
    //     await this.client.fPutObject(this.bucketName, fullPath, filePath);
    
    //     console.log(`✅ File uploaded to "${this.bucketName}/${fullPath}"`);
    
    //     // Prepare metadata for database
    //     const metadataForDb = {
    //         fileName: originalFileName,
    //         fileSize: size,
    //         mimeType,
    //         storageType: 'minio',
    //         additionalMetadata: {
    //             userName,
    //             uploadedPath: fullPath,
    //             ...(parsedMetadata || {}) // Spread metadata fields like title, description, author, tags, etc
    //         }
    //     };
    
    //     // Upload metadata to MySQL
    //     await this.mysqlRepository.uploadFileMetaData(metadataForDb);
    
    //     console.log(`✅ File metadata stored for "${originalFileName}"`);
    // }
    

    async getUserDirectoryTree(userName: string): Promise<any> {
        await this.ensureBucketExists(this.bucketName);

        const objectsStream = this.client.listObjectsV2(this.bucketName, `${userName}/`, true);
        const files: string[] = [];

        for await (const obj of objectsStream) {
            files.push(obj.name);
        }

        if (files.length === 0) {
            return { [userName]: {} }; // Empty directory
        }

        const buildTree = (paths: string[]) => {
            const root: any = {};

            paths.forEach((filePath) => {
                const parts = filePath.split('/').filter(Boolean); // Remove empty strings
                let currentLevel = root;

                for (const part of parts) {
                    if (!currentLevel[part]) {
                        currentLevel[part] = {};
                    }
                    currentLevel = currentLevel[part];
                }
            });

            return root;
        };

        return buildTree(files);
    }



    async downloadFile(userDirectory: string, remotePath: string) {
        await this.ensureBucketExists(this.bucketName);

        try {
            const downloadsDir = path.join(this.downloadsPath);
            console.log("Downloads directory:", downloadsDir);

            // Ensure the downloads directory exists
            if (!fs.existsSync(downloadsDir)) {
                console.log(`📂 Creating missing directory: ${downloadsDir}`);
                fs.mkdirSync(downloadsDir, { recursive: true });
            }

            // Extract filename from remotePath and create full local path
            const filename = path.basename(remotePath);
            const localPath = path.join(downloadsDir, filename);

            console.log(`⬇️ Downloading file from MinIO: ${remotePath} to ${localPath}`);

            // Download the file from MinIO
            await this.client.fGetObject(this.bucketName, remotePath, localPath);

            console.log(`✅ File downloaded to "${localPath}"`);

            // Confirm if the file exists locally
            if (fs.existsSync(localPath)) {
                console.log(`✅ File confirmed at "${localPath}"`);
            } else {
                console.error(`❌ File missing after download: ${localPath}`);
                throw new Error("File download failed");
            }

            return localPath;
        } catch (error) {
            console.error(`❌ Download Error:`, error);
            throw error;
        }
    }

    // ✅ Delete a specific file from a bucket
    async deleteFile(directory: string, fileName: string) {
        console.log('hit here');
        const objectName = `${directory}/${fileName}`;

        await this.client.removeObject(this.bucketName, objectName);
        console.log(`🗑️ Deleted file: ${this.bucketName}/${objectName}`);
    }

    // ✅ Delete an entire directory (Delete all objects inside)
    async deleteDirectory(directory: string | undefined) {
        const objects = await this.client.listObjectsV2(this.bucketName, directory, true).toArray();

        if (objects.length === 0) {
            console.log(`🚫 No objects found in ${directory}`);
            return;
        }

        const objectNames = objects.map(obj => obj.name);
        await this.client.removeObjects(this.bucketName, objectNames);
        console.log(`🗑️ Deleted all files in directory: ${directory}`);

        // Optional: Delete the bucket if it's empty
        try {
            await this.client.removeBucket(this.bucketName);
            console.log(`🗑️ Bucket "${this.bucketName}" deleted.`);
        } catch (err) {
            console.log(`ℹ️ Bucket not empty or cannot be deleted yet.`);
        }
    }


    // async listAllUserFilesAndDirectories(
    //     userName: string,
    //     filters: { name?: string; tag?: string; metadata?: string } = {},
    //     sortBy: 'name' | 'date' = 'name',
    //     sortOrder: 'asc' | 'desc' = 'asc'
    //   ): Promise<{ [key: string]: any }> {
    //     await this.ensureBucketExists(this.bucketName);
    //     // userName = 'persia';

    //     const objectsStream = this.client.listObjectsV2(this.bucketName, `${userName}/`, true);
    //     const baseUrl = 'http://localhost:9001/browser/pepin';

    //     const allFiles: {
    //       fileName: string;
    //       fileUrl: string;
    //       filePath: string;
    //       lastModified?: Date;
    //       metadata?: string;
    //       tags?: string[];
    //     }[] = [];

    //     for await (const obj of objectsStream) {
    //       const filePath = obj.name;
    //       const parts = filePath.split('/').filter(Boolean);
    //       const fileName = parts[parts.length - 1];
    //       const fileUrl = `${baseUrl}/${filePath}`;

    //       // Sample placeholders — replace with actual logic to fetch metadata/tags if needed
    //       const sampleMetadata = fileName.includes('report') ? 'report' : '';
    //       const sampleTags = fileName.includes('invoice') ? ['finance', 'invoice'] : [];

    //       allFiles.push({
    //         fileName,
    //         fileUrl,
    //         filePath,
    //         lastModified: obj.lastModified,
    //         metadata: sampleMetadata,
    //         tags: sampleTags,
    //       });
    //     }

    //     // 🔍 Apply filters
    //     const filteredFiles = allFiles.filter(file => {
    //       const matchesName = filters.name ? file.fileName.toLowerCase().includes(filters.name.toLowerCase()) : true;
    //       const matchesTag = filters.tag ? file.tags?.includes(filters.tag) : true;
    //       const matchesMetadata = filters.metadata ? file.metadata?.toLowerCase().includes(filters.metadata.toLowerCase()) : true;
    //       return matchesName && matchesTag && matchesMetadata;
    //     });

    //     // ↕️ Sort
    //     const sortedFiles = filteredFiles.sort((a, b) => {
    //       if (sortBy === 'name') {
    //         const nameA = a.fileName.toLowerCase();
    //         const nameB = b.fileName.toLowerCase();
    //         return sortOrder === 'asc' ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
    //       } else if (sortBy === 'date') {
    //         const dateA = a.lastModified?.getTime() || 0;
    //         const dateB = b.lastModified?.getTime() || 0;
    //         return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
    //       }
    //       return 0;
    //     });

    //     // 🗂 Convert to hierarchical structure again
    //     const structure: { [key: string]: any } = {};
    //     for (const file of sortedFiles) {
    //       const parts = file.filePath.split('/').filter(Boolean);
    //       let current = structure;
    //       for (let i = 0; i < parts.length - 1; i++) {
    //         if (!current[parts[i]]) current[parts[i]] = {};
    //         current = current[parts[i]];
    //       }
    //       current[parts[parts.length - 1]] = file.fileUrl;
    //     }

    //     return structure;
    // }

    // async listAllUserFilesAndDirectories(
    //     userName: string,
    //     filters: { name?: string; tag?: string; metadata?: string } = {},
    //     sortBy: 'name' | 'date' = 'name',
    //     sortOrder: 'asc' | 'desc' = 'asc'
    // ): Promise<{ [key: string]: any }> {

    //     // Proceed to list files if the user is valid and not deleted

    //     await this.ensureBucketExists(this.bucketName);
    //     const objectsStream = this.client.listObjectsV2(this.bucketName, `${userName}/`, true);
    //     const baseUrl = 'http://localhost:9001/browser/pepin';

    //     const allFiles: {
    //         fileName: string;
    //         fileUrl: string;
    //         filePath: string;
    //         lastModified?: Date;
    //         metadata?: string;
    //         tags?: string[];
    //     }[] = [];

    //     // Fetch files from the bucket
    //     for await (const obj of objectsStream) {
    //         const filePath = obj.name;
    //         const parts = filePath.split('/').filter(Boolean);
    //         const fileName = parts[parts.length - 1];
    //         const fileUrl = `${baseUrl}/${filePath}`;

    //         const fileMetadata = await this.mysqlRepository.getFileMetadataFromDatabase(fileName);

    //         // Sample placeholders — replace with actual logic to fetch metadata/tags if needed
    //         const sampleMetadata = fileName.includes('report') ? 'report' : '';
    //         const sampleTags = fileName.includes('invoice') ? ['finance', 'invoice'] : [];
           
    //         if (fileMetadata && !fileMetadata.isDeleted) { 
    //         allFiles.push({
    //             fileName,
    //             fileUrl,
    //             filePath,
    //             lastModified: obj.lastModified,
    //             metadata: sampleMetadata,
    //             tags: sampleTags,
    //         });
    //     }
    //     }

    //     // 🔍 Apply filters
    //     const filteredFiles = allFiles.filter(file => {
    //         const matchesName = filters.name ? file.fileName.toLowerCase().includes(filters.name.toLowerCase()) : true;
    //         const matchesTag = filters.tag ? file.tags?.includes(filters.tag) : true;
    //         const matchesMetadata = filters.metadata ? file.metadata?.toLowerCase().includes(filters.metadata.toLowerCase()) : true;
    //         return matchesName && matchesTag && matchesMetadata;
    //     });

    //     // ↕️ Sort files
    //     const sortedFiles = filteredFiles.sort((a, b) => {
    //         if (sortBy === 'name') {
    //             const nameA = a.fileName.toLowerCase();
    //             const nameB = b.fileName.toLowerCase();
    //             return sortOrder === 'asc' ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
    //         } else if (sortBy === 'date') {
    //             const dateA = a.lastModified?.getTime() || 0;
    //             const dateB = b.lastModified?.getTime() || 0;
    //             return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
    //         }
    //         return 0;
    //     });

    //     // 🗂 Convert files to hierarchical structure
    //     const structure: { [key: string]: any } = {};
    //     for (const file of sortedFiles) {
    //         const parts = file.filePath.split('/').filter(Boolean);
    //         let current = structure;
    //         for (let i = 0; i < parts.length - 1; i++) {
    //             if (!current[parts[i]]) current[parts[i]] = {};
    //             current = current[parts[i]];
    //         }
    //         current[parts[parts.length - 1]] = file.fileUrl;
    //     }

    //     return structure;
    // }

    // async listAllUserFilesAndDirectories(
    //     userName: string,
    //     filters: { name?: string; tag?: string; metadata?: string } = {},
    //     sortBy: 'name' | 'date' = 'name',
    //     sortOrder: 'asc' | 'desc' = 'asc'
    // ): Promise<{ [key: string]: any }> {
    
    //     // Ensure the bucket exists before proceeding
    //     await this.ensureBucketExists(this.bucketName);
    //     const objectsStream = this.client.listObjectsV2(this.bucketName, `${userName}/`, true);
    //     const baseUrl = 'http://localhost:9001/browser/pepin';
    
    //     const allFiles: {
    //         id: string; // Adding the MySQL id field
    //         fileName: string;
    //         fileUrl: string;
    //         filePath: string;
    //         lastModified?: Date;
    //         metadata?: string;
    //         tags?: string[];
    //     }[] = [];
    
    //     // Fetch files from the bucket and MySQL
    //     for await (const obj of objectsStream) {
    //         const filePath = obj.name;
    //         const parts = filePath.split('/').filter(Boolean);
    //         const fileName = parts[parts.length - 1];
    //         const fileUrl = `${baseUrl}/${filePath}`;
    
    //         // Fetch file metadata and id from MySQL
    //         const fileMetadata = await this.mysqlRepository.getFileMetadataFromDatabase(fileName);
            
    //         if (fileMetadata && !fileMetadata.isDeleted) { 
    //             const sampleMetadata = fileName.includes('report') ? 'report' : '';
    //             const sampleTags = fileName.includes('invoice') ? ['finance', 'invoice'] : [];
                
    //             // Push the file data along with MySQL id
    //             allFiles.push({
    //                 id: fileMetadata.id, // Adding MySQL id
    //                 fileName,
    //                 fileUrl,
    //                 filePath,
    //                 lastModified: obj.lastModified,
    //                 metadata: sampleMetadata,
    //                 tags: sampleTags,
    //             });
    //         }
    //     }
    
    //     // 🔍 Apply filters
    //     const filteredFiles = allFiles.filter(file => {
    //         const matchesName = filters.name ? file.fileName.toLowerCase().includes(filters.name.toLowerCase()) : true;
    //         const matchesTag = filters.tag ? file.tags?.includes(filters.tag) : true;
    //         const matchesMetadata = filters.metadata ? file.metadata?.toLowerCase().includes(filters.metadata.toLowerCase()) : true;
    //         return matchesName && matchesTag && matchesMetadata;
    //     });
    
    //     // ↕️ Sort files
    //     const sortedFiles = filteredFiles.sort((a, b) => {
    //         if (sortBy === 'name') {
    //             const nameA = a.fileName.toLowerCase();
    //             const nameB = b.fileName.toLowerCase();
    //             return sortOrder === 'asc' ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
    //         } else if (sortBy === 'date') {
    //             const dateA = a.lastModified?.getTime() || 0;
    //             const dateB = b.lastModified?.getTime() || 0;
    //             return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
    //         }
    //         return 0;
    //     });
    
    //     // 🗂 Convert files to hierarchical structure
    //     const structure: { [key: string]: any } = {};
    //     for (const file of sortedFiles) {
    //         const parts = file.filePath.split('/').filter(Boolean);
    //         let current = structure;
    //         for (let i = 0; i < parts.length - 1; i++) {
    //             if (!current[parts[i]]) current[parts[i]] = {};
    //             current = current[parts[i]];
    //         }
    //         current[parts[parts.length - 1]] = {
    //             fileUrl: file.fileUrl,
    //             id: file.id, // Include MySQL id in the returned structure
    //         };
    //     }
    
    //     return structure;
    // }    

    async listAllUserFilesAndDirectories(
        userName: string,
        filters: { name?: string; tag?: string; metadata?: string } = {},
        sortBy: 'name' | 'date' = 'name',
        sortOrder: 'asc' | 'desc' = 'asc'
    ): Promise<{ [key: string]: any }> {
        // Proceed to list files if the user is valid and not deleted
        await this.ensureBucketExists(this.bucketName);
        const objectsStream = this.client.listObjectsV2(this.bucketName, `${userName}/`, true);
        const baseUrl = 'http://localhost:9001/browser/pepin';
    
        const allFiles: {
            id?: number;
            fileName: string;
            fileUrl: string;
            filePath: string;
            lastModified?: Date;
            metadata?: string;
            tags?: string[];
        }[] = [];
    
        // Fetch files from the bucket
        for await (const obj of objectsStream) {
            const filePath = obj.name;
            const parts = filePath.split('/').filter(Boolean);
            const fileName = parts[parts.length - 1];
            const fileUrl = `${baseUrl}/${filePath}`;
    
            // Get file metadata including the id
            const fileMetadata = await this.mysqlRepository.getFileMetadataFromDatabase(fileName);
    
            if (fileMetadata && !fileMetadata.isDeleted) {
                allFiles.push({
                    id: fileMetadata.id, // Include the id from database
                    fileName,
                    fileUrl,
                    filePath,
                    lastModified: obj.lastModified,
                    // metadata: fileMetadata.metadata || '', // Include any additional metadata
                    // tags: fileMetadata.tags || [], // Include any associated tags
                });
            }
        }
    
        // 🔍 Apply filters
        const filteredFiles = allFiles.filter(file => {
            const matchesName = filters.name ? file.fileName.toLowerCase().includes(filters.name.toLowerCase()) : true;
            const matchesTag = filters.tag ? file.tags?.includes(filters.tag) : true;
            const matchesMetadata = filters.metadata ? file.metadata?.toLowerCase().includes(filters.metadata.toLowerCase()) : true;
            return matchesName && matchesTag && matchesMetadata;
        });
    
        // ↕️ Sort files
        const sortedFiles = filteredFiles.sort((a, b) => {
            if (sortBy === 'name') {
                const nameA = a.fileName.toLowerCase();
                const nameB = b.fileName.toLowerCase();
                return sortOrder === 'asc' ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
            } else if (sortBy === 'date') {
                const dateA = a.lastModified?.getTime() || 0;
                const dateB = b.lastModified?.getTime() || 0;
                return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
            }
            return 0;
        });
    
        // 🗂 Convert files to hierarchical structure
        const structure: { [key: string]: any } = {};
        for (const file of sortedFiles) {
            const parts = file.filePath.split('/').filter(Boolean);
            let current = structure;
            for (let i = 0; i < parts.length - 1; i++) {
                if (!current[parts[i]]) current[parts[i]] = {};
                current = current[parts[i]];
            }
            current[parts[parts.length - 1]] = {
                fileUrl: file.fileUrl,
                id: file.id, // Include the id in the structure
            };
        }
    
        return structure;
    }
    


    async renameFile(userName: string, oldPath: string, newFileName: string) {
        await this.ensureBucketExists(this.bucketName);

        const oldKey = `${userName}/${oldPath}`;
        const newPath = `${userName}/${newFileName}`;

        try {
            // 1. Get the object stream
            const objectStream = await this.client.getObject(this.bucketName, oldKey);

            // 2. Upload it with the new name
            await this.client.putObject(this.bucketName, newPath, objectStream);

            // 3. Delete the old object
            await this.client.removeObject(this.bucketName, oldKey);

            // 4. Update the metadata in the MySQL database
            // await this.mysqlRepository.updateFilePathMetadata({oldKey, newKey});
            await this.mysqlRepository.updateFilePathMetadata({
                oldPath: `${userName}/${oldPath}`,
                newPath: `${userName}/${newPath}`
            });

            console.log(`✏️ Renamed "${oldKey}" ➝ "${newPath}" and metadata updated.`);
        } catch (error) {
            console.error(`❌ Rename failed for ${oldKey}:`, error);
            throw error;
        }
    }

    async softDeleteDocument(documentId: any) {
        try {
            return await this.mysqlRepository.softDeleteDocument(documentId);
        } catch (error) {
            console.error(error);
            return { success: false, message: "Error deleting document." }; // Always return something
        }
    }    

}

export default MinioRepository;