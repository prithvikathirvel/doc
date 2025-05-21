import { dbConnection } from '../../dbConnection/mysql';

class MySQLRepository {
    private tableName = 'fileMetaData'; // MySQL table name

    async uploadFileMetaData(fileData: {
        fileName: string;
        fileSize: number;
        mimeType: string;
        storageType: 'local' | 'minio' | 'gcs';
        additionalMetadata?: Record<string, any>;
    }): Promise<{ insertedId: number }> {
        try {
            console.log('MySQLRepository --> uploadFileMetaData --> fileData', fileData);

            // Convert additionalMetadata to JSON string (if exists)
            const additionalMetadata = fileData.additionalMetadata
                ? JSON.stringify(fileData.additionalMetadata)
                : null;

            const query = `
                INSERT INTO ${this.tableName} (fileName, fileSize, mimeType, storageType, additionalMetadata, uploadedAt)
                VALUES (?, ?, ?, ?, ?, NOW())
            `;

            const values = [
                fileData.fileName,
                fileData.fileSize,
                fileData.mimeType,
                fileData.storageType,
                additionalMetadata
            ];

            // Execute the query
            const [result]: any = await dbConnection.execute(query, values);

            return { insertedId: result.insertId }
        } catch (error) {
            console.error('MySQLRepository --> uploadFileMetaData --> Error', error);
            throw error;
        }
    }
    async updateFilePathMetadata({ oldPath, newPath }: { oldPath: string; newPath: string }) {
        const query = `
            UPDATE file_metadata
            SET additionalMetadata = JSON_SET(additionalMetadata, '$.uploadedPath', ?)
            WHERE JSON_UNQUOTE(JSON_EXTRACT(additionalMetadata, '$.uploadedPath')) = ?
        `;
        await dbConnection.query(query, [newPath, oldPath]);
    }
    async updateDocumentMetadata(documentId: any, updatedFields: any,) {
        try {
            const [result]: any = await dbConnection.execute(
                `UPDATE fileMetaData SET ? WHERE id = ? AND isDeleted = FALSE`,
                [updatedFields, documentId]
            );

            return result.affectedRows > 0
                ? { success: true, message: "Document metadata updated." }
                : { success: false, message: "Document not found or is deleted." };
        } catch (error) {
            console.error("Error updating metadata:", error);
            return { success: false, message: "Error updating document metadata." };
        }
    };
    async softDeleteDocument(documentId: any) {
        try {
            console.log("In mysql repository");

            // Query to check the uploadedPath inside the JSON column (additionalMetadata)
            const [result]: any = await dbConnection.query(
                `UPDATE fileMetaData 
                 SET isDeleted = TRUE 
                 WHERE JSON_UNQUOTE(JSON_EXTRACT(additionalMetadata, '$.uploadedPath')) = ?`,
                [documentId]
            );

            // Checking if any rows were affected
            if (result.affectedRows > 0) {
                return { success: true, message: "Document soft deleted." };
            } else {
                return { success: false, message: "Document not found." };
            }
        } catch (error) {
            console.error("Error in soft delete:", error);
            return { success: false, message: "Error deleting document." };
        }
    }

    // async softDeleteDocument(documentId: any) {
    //     try {
    //         console.log("In mysql repository");

    //         // Query to update 'isDeleted' to TRUE based on documentId
    //         const [result]: any = await dbConnection.query(
    //             `UPDATE fileMetaData 
    //              SET isDeleted = TRUE 
    //              WHERE id = ?`,
    //             [documentId]
    //         );

    //         // Checking if any rows were affected
    //         if (result.affectedRows > 0) {
    //             return { success: true, message: "Document soft deleted." };
    //         } else {
    //             return { success: false, message: "Document not found." };
    //         }
    //     } catch (error) {
    //         console.error("Error in soft delete:", error);
    //         return { success: false, message: "Error deleting document." };
    //     }
    // }

    async restoreDocument(documentId: any) {
        try {
            const [result]: any = await dbConnection.query(
                `UPDATE fileMetaData 
                 SET isDeleted = FALSE 
                 WHERE JSON_UNQUOTE(JSON_EXTRACT(additionalMetadata, '$.uploadedPath')) = ?`,
                [documentId]
            );

            return result.affectedRows > 0
                ? { success: true, message: "Document restored." }
                : { success: false, message: "Document not found or already active." };
        } catch (error) {
            console.error("Error restoring document:", error);
            return { success: false, message: "Error restoring document." };
        }
    };

    // async restoreDocument(documentId: any) {
    //     try {
    //         console.log("In mysql repository");

    //         // Query to update 'isDeleted' to TRUE based on documentId
    //         const [result]: any = await dbConnection.query(
    //             `UPDATE fileMetaData 
    //              SET isDeleted = FALSE 
    //              WHERE id = ?`,
    //             [documentId]
    //         );

    //         // Checking if any rows were affected
    //         if (result.affectedRows > 0) {
    //             return { success: true, message: "Document recovered." };
    //         } else {
    //             return { success: false, message: "Document not found." };
    //         }
    //     } catch (error) {
    //         console.error("Error in recovery :", error);
    //         return { success: false, message: "Error recovery document." };
    //     }
    // }
    // async getFileMetadataFromDatabase(fileName: string) {
    //     const query = `SELECT * FROM fileMetaData WHERE fileName = ?`;
    //     const result:any = await dbConnection.query(query, [fileName]);

    //     if (result && result.length > 0) {
    //         // Assuming isDeleted is a boolean field in your table, and we check its status
    //         // const metadata = JSON.parse(result[0].additionalMetadata || '{}');
    //         // const tags = metadata.tags || [];
    //         const isDeleted = result[0].isDeleted === false; // Check if isDeleted is false
    //         return {isDeleted };
    //     }
    //     return null;
    // }
    async getFileMetadataFromDatabase(fileName: string) {
        const query = `SELECT * FROM fileMetaData WHERE fileName = ?`;
        const result: any = await dbConnection.query(query, [fileName]);

        if (result && result.length > 0) {
            // Assuming isDeleted is a boolean field in your table, and we check its status
            const isDeleted = result[0].isDeleted === false; // Check if isDeleted is false
            const id = result[0].id; // Add id from the database

            // Return both id and isDeleted
            return { id, isDeleted };
        }
        return null;
    }


}

export default MySQLRepository;
