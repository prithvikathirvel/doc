import * as Minio from 'minio';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';


// Define __dirname in ES Module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class MinioRepository {
    client: Minio.Client;
    bucketName: string;
    downloadsPath: string;

    constructor() {
        this.client = new Minio.Client({
            endPoint: '127.0.0.1',
            port: 9000,
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

    async uploadFile(filePath: string,userName: string, destinationPath = '') {
        // Debugging step
        console.log(`🛠️ Raw filePath received: "${filePath}"`);

        // Extract actual filename from filePath
        const pathParts = filePath.split(/[/\\]/); // Handle both '/' and '\' as separators
        const originalFileName = pathParts[pathParts.length - 1];
        // const originalFileName = path.basename(filePath);

        console.log(`📄 Extracted original filename: "${originalFileName}"`);

        // Ensure destinationPath is clean
        const cleanDestination = destinationPath.replace(/[^a-zA-Z0-9/_-]/g, '').replace(/\s+/g, '_');

        console.log(`✅ Clean destinationPath: "${cleanDestination}"`);

        // Construct the final MinIO path
        const fullPath = cleanDestination ? `${userName}/${cleanDestination}/${originalFileName}` : originalFileName;

        console.log(`📂 Final fullPath: "${fullPath}"`);

        // Ensure bucket exists before uploading
        await this.ensureBucketExists(this.bucketName);

        // Upload file with its original name
        await this.client.fPutObject(this.bucketName, fullPath, filePath);
        console.log(`✅ File uploaded to "${this.bucketName}/${fullPath}"`);
    }

    async downloadFile(userDirectory: string,remotePath: string) {
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

}

export default MinioRepository;
