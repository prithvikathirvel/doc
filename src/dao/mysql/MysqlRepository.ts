import { dbConnection } from '../../dbConnection/mysql.js';

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
            const [result]: any = await dbConnection.promise().execute(query, values);

            return { insertedId: result.insertId };
        } catch (error) {
            console.error('MySQLRepository --> uploadFileMetaData --> Error', error);
            throw error;
        }
    }
}

export default MySQLRepository;
