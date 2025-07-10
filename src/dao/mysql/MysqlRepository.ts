import { dbConnection } from '../../dbConnection/mysql';
import { v4 as uuidv4 } from 'uuid';

class MySQLRepository {
    private tableName = 'documents'; // MySQL table name

    async uploadFileMetaData(fileData: {
        fileName: string;
        fileSize: number;
        mimeType: string;
        storageType: 'local' | 'minio' | 'gcs';
                userName: string;
        additionalMetadata?: Record<string, any>;
    }): Promise<{ insertedId: number }> {
        try {
            console.log('fileData is',fileData)

            // Convert additionalMetadata to JSON string (if exists)
            const additionalMetadata = fileData.additionalMetadata
                ? JSON.stringify(fileData.additionalMetadata)
                : null;

                const id = uuidv4();
            const query = `
                INSERT INTO ${this.tableName} (id, fileName, fileSize, mimeType, storageType, additionalMetadata, uploadedAt, uploadedBy)
                VALUES (?, ?, ?, ?, ?, ?, NOW(), ?)
            `;

            const values = [
                id,
                fileData.fileName,
                fileData.fileSize,
                fileData.mimeType,
                fileData.storageType,
                additionalMetadata,
                fileData.userName
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
    
    async updateDocumentMetadata(documentId: any, updatedFields: any) {
    try {
        if (updatedFields.additionalMetadata && typeof updatedFields.additionalMetadata !== 'string') {
            updatedFields.additionalMetadata = JSON.stringify(updatedFields.additionalMetadata);
        }
        const keys = Object.keys(updatedFields);
        const values = Object.values(updatedFields);
        const setClause = keys.map(key => `\`${key}\` = ?`).join(', ');

        const sql = `UPDATE documents SET ${setClause} WHERE id = ? AND isDeleted = FALSE`;
        values.push(documentId);

        const [result]: any = await dbConnection.execute(sql, values);

        return result.affectedRows > 0
            ? { success: true, message: "Document metadata updated." }
            : { success: false, message: "Document not found or is deleted." };
    } catch (error) {
        console.error("Error updating metadata:", error);
        return { success: false, message: "Error updating document metadata." };
    }
}

    async softDeleteDocument(documentId: any) {
        try {


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
  try {
    const query = `
      SELECT * FROM ${this.tableName} 
      WHERE JSON_UNQUOTE(JSON_EXTRACT(additionalMetadata, '$.uploadedPath')) = ?`;
      
    const [rows]: any = await dbConnection.query(query, [fileName]);

    console.log('rows:', rows);

    if (rows && rows.length > 0) {
      console.log("Retrieved file metadata:", rows[0]);
      const isDeleted = rows[0].isDeleted === 1;
      const id = rows[0].id;

      return { id, isDeleted, data: rows[0] };
    }
    
    return null;
  } catch (error) {
    console.error('Error retrieving file metadata:', error);
    throw error;
  }
}


    async getDocumentForAssetId(id: string) {
        try {
            const query = `SELECT * FROM documents WHERE id = ?`;
            const [rows]: any = await dbConnection.query(query, [id]);

            if (rows && rows.length > 0) {
                return rows[0]?.fileName;
            }
            return null;
        } catch (error) {
            console.error('Error retrieving file metadata:', error);
            throw error;
        }
    }

    async getDocumentDetails(id: string) {
        try {
            const query = `SELECT * FROM documents WHERE id = ?`;
            const [rows]: any = await dbConnection.query(query, [id]);

            if (rows && rows.length > 0) {
                return rows[0];
            }
  
            return null;
        } catch (error) {
            console.error('Error retrieving file metadata:', error);
            throw error;
        }
    }

    async getAllUsers(): Promise<any> {
        const [result] = await dbConnection.execute(`Select id from users`);
        return result;
    }

}

export default MySQLRepository;
