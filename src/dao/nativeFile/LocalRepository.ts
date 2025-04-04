import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

// Define __dirname in ES Module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


class LocalRepository {
    storagePath: string;
    downloadsPath: string;
    constructor() {
        this.storagePath = path.join(__dirname, '../uploads');
        if (!fs.existsSync(this.storagePath)) {
            fs.mkdirSync(this.storagePath, { recursive: true });
        }
        this.downloadsPath = path.join(__dirname, '../downloads');
        if (!fs.existsSync(this.downloadsPath)) {
            fs.mkdirSync(this.downloadsPath, { recursive: true });
        }
    }

    // Function to generate a versioned filename
    getVersionedFileName(directory: fs.PathLike, originalName: string) {
        const ext = path.extname(originalName);
        const baseName = path.basename(originalName, ext);

        const existingFiles = fs.readdirSync(directory)
            .filter(f => f.startsWith(baseName) && f.endsWith(ext));

        let version = 1;
        if (existingFiles.length > 0) {
            const versionNumbers = existingFiles.map(f => {
                const match = f.match(/_v(\d+)\./);
                return match ? parseInt(match[1], 10) : 0;
            });
            version = Math.max(...versionNumbers) + 1;
        }

        return `${baseName}_v${version}${ext}`;
    }

    // async uploadFile(filePath,userName, userDirectory) {
    //     console.log(`📤 Attempting to upload: ${filePath} to ${userDirectory}`);

    //     if (!fs.existsSync(filePath)) {
    //         throw new Error(`❌ Source file does not exist: ${filePath}`);
    //     }

    //     const uploadPath = path.join(this.storagePath,userName, userDirectory);

    //     if (!fs.existsSync(uploadPath)) {
    //         console.log(`📂 Creating directory: ${uploadPath}`);
    //         fs.mkdirSync(uploadPath, { recursive: true });
    //     }

    //     const fileName = this.getVersionedFileName(uploadPath, path.basename(filePath));
    //     const dest = path.join(uploadPath, fileName);

    //     try {
    //         fs.copyFileSync(filePath, dest);
    //         console.log(`✅ File copied to: ${dest}`);
    //     } catch (error) {
    //         console.error(`❌ Error copying file: ${error.message}`);
    //         throw error;
    //     }

    //     if (!fs.existsSync(dest)) {
    //         throw new Error(`❌ File was not saved: ${dest}`);
    //     }

    //     console.log(`📂 Contents of directory (${uploadPath}):`, fs.readdirSync(uploadPath));

    //     return {
    //         fileName,
    //         path: dest,
    //         uploadedAt: new Date()
    //     };
    // }

    async uploadFile(filePath: string, userName: string, userDirectory = '') {
        console.log(`📤 Attempting to upload: ${filePath} to ${userDirectory}`);

        if (!fs.existsSync(filePath)) {
            throw new Error(`❌ Source file does not exist: ${filePath}`);
        }

        // Ensure userDirectory is a valid string
        if (typeof userDirectory !== 'string') {
            console.warn(`⚠️ Invalid userDirectory: ${userDirectory}, defaulting to empty`);
            userDirectory = '';
        }

        const uploadPath = path.join(this.storagePath, userName, userDirectory);
        console.log(`📂 Resolved Upload Path: ${uploadPath}`);

        if (!fs.existsSync(uploadPath)) {
            console.log(`📂 Creating directory: ${uploadPath}`);
            fs.mkdirSync(uploadPath, { recursive: true });
        }

        const fileName = this.getVersionedFileName(uploadPath, path.basename(filePath));
        const dest = path.join(uploadPath, fileName);

        try {
            fs.copyFileSync(filePath, dest);
            console.log(`✅ File copied to: ${dest}`);
        } catch (error: any) {
            console.error(`❌ Error copying file: ${error.message}`);
            throw error;
        }

        if (!fs.existsSync(dest)) {
            throw new Error(`❌ File was not saved: ${dest}`);
        }

        console.log(`📂 Contents of directory (${uploadPath}):`, fs.readdirSync(uploadPath));

        return {
            fileName,
            path: dest,
            uploadedAt: new Date()
        };
    }

    async getUserDirectoryTree(userName: string) {
        const userPath = path.join(this.storagePath, userName);

        if (!fs.existsSync(userPath)) {
            throw new Error(`User directory not found: ${userPath}`);
        }

        function buildTree(dir: string):any {
            return fs.readdirSync(dir, { withFileTypes: true }).map(dirent => {
                const fullPath = path.join(dir, dirent.name);
                return dirent.isDirectory()
                    ? { name: dirent.name, type: "folder", children: buildTree(fullPath) }
                    : { name: dirent.name, type: "file" };
            });
        }

        return {
            userName,
            tree: buildTree(userPath)
        };
    }



    async downloadFile(userDirectory: string, fileName: string) {
        const dirPath = path.join(this.storagePath, path.dirname(userDirectory));
        console.log("Checking directory path:", dirPath);

        // Check if the path exists
        if (!fs.existsSync(dirPath)) {
            console.error(`❌ Directory not found: ${dirPath}`);
            throw new Error("Directory not found");
        }

        // Ensure dirPath is a directory
        if (!fs.statSync(dirPath).isDirectory()) {
            console.error(`❌ Error: ${dirPath} is not a directory.`);
            throw new Error("Invalid directory path");
        }

        const ext = path.extname(fileName);
        const baseName = path.basename(fileName, ext);

        console.log(`Searching for files with base name: ${baseName} and extension: ${ext}`);

        const existingFiles = fs.readdirSync(dirPath)
            .filter(f => f.startsWith(baseName) && f.endsWith(ext));

        console.log("Found files:", existingFiles);

        if (existingFiles.length === 0) {
            console.error(`❌ File not found: ${fileName} in ${dirPath}`);
            throw new Error("File not found");
        }

        // Sort files to get the latest version
        existingFiles.sort((a, b) => {
            const matchA = a.match(/_v(\d+)\./);
            const matchB = b.match(/_v(\d+)\./);

            const versionA = matchA ? parseInt(matchA[1], 10) : 0;
            const versionB = matchB ? parseInt(matchB[1], 10) : 0;

            return versionB - versionA;
        });

        const latestFile = existingFiles[0];
        console.log("Latest version file:", latestFile);

        const sourceFilePath = path.join(dirPath, latestFile);
        const downloadsDir = path.join(this.downloadsPath);
        // const downloadsDir = path.join(__dirname, "downloads");

        console.log("Downloads directory:", downloadsDir);


        // Ensure the downloads directory exists
        if (!fs.existsSync(downloadsDir)) {
            fs.mkdirSync(downloadsDir, { recursive: true });
        }

        const destinationFilePath = path.join(downloadsDir, latestFile);

        // Copy the file to downloads
        fs.copyFileSync(sourceFilePath, destinationFilePath);

        console.log(`✅ File copied to: ${destinationFilePath}`);
        return destinationFilePath;
    }



    // Download specific version of a file from a user-specified directory
    async downloadFileVersion(userDirectory: string, fileName: string, version: any) {
        const dirPath = path.join(this.storagePath, userDirectory);
        const ext = path.extname(fileName);
        const baseName = path.basename(fileName, ext);
        const fullFileName = `${baseName}_v${version}${ext}`;

        const filePath = path.join(dirPath, fullFileName);
        if (!fs.existsSync(filePath)) {
            throw new Error('File version not found');
        }

        return filePath;
    }

    // ✅ Delete a specific file
    async deleteFile(userDirectory: string, fileName: string) {
        const filePath = path.join(this.storagePath, userDirectory, fileName);
        if (!fs.existsSync(filePath)) {
            throw new Error('File not found');
        }

        fs.unlinkSync(filePath);
        console.log(`🗑️ Deleted file: ${filePath}`);
    }

    // ✅ Delete an entire directory
    async deleteDirectory(userDirectory: string) {
        const dirPath = path.join(this.storagePath, userDirectory);
        if (!fs.existsSync(dirPath)) {
            throw new Error('Directory not found');
        }

        fs.rmSync(dirPath, { recursive: true, force: true });
        console.log(`🗑️ Deleted directory: ${dirPath}`);
    }

}

export default LocalRepository;
