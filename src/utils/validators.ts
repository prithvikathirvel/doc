import fs from 'fs';
import path from 'path';

// Function to validate file and get its metadata
export function validateFile(filePath: string): { mimeType: string, size: number } {
    try {
        if (!fs.existsSync(filePath)) {
            throw new Error(`File does not exist: ${filePath}`);
        }
        
        // Get file stats to determine size
        const stats = fs.statSync(filePath);
        const size = stats.size;
        
        // Determine mime type based on file extension
        const extension = path.extname(filePath).toLowerCase();
        let mimeType = 'application/octet-stream'; // Default mime type
        
        // Map common extensions to mime types
        const mimeTypes: Record<string, string> = {
            '.txt': 'text/plain',
            '.html': 'text/html',
            '.css': 'text/css',
            '.js': 'application/javascript',
            '.json': 'application/json',
            '.pdf': 'application/pdf',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.svg': 'image/svg+xml',
            '.doc': 'application/msword',
            '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            '.xls': 'application/vnd.ms-excel',
            '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            '.ppt': 'application/vnd.ms-powerpoint',
            '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            '.mp3': 'audio/mpeg',
            '.mp4': 'video/mp4',
            '.zip': 'application/zip'
        };
        
        if (extension in mimeTypes) {
            mimeType = mimeTypes[extension];
        }
        
        return { mimeType, size };
    } catch (error) {
        console.error('Error validating file:', error);
        throw error;
    }
}