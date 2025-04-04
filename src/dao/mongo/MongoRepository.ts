import { dbConnection } from '../../dbConnection/mongo.js';
import { ObjectId } from 'mongodb';

class MongoRepository {
    private fileMetadataCollection = dbConnection.collection('fileMetadata'); // New collection for file metadata

    async uploadFileMetaData(fileData: {
        fileName: string;
        fileSize: number;
        mimeType: string;
        storageType: 'local' | 'minio' | 'gcs';
        additionalMetadata?: Record<string, any>;
    }): Promise<{ insertedId: ObjectId }> {
        try {
            console.log('MongoRepository --> uploadFileMetaData --> fileData', fileData);

            const result = await this.fileMetadataCollection.insertOne({
                ...fileData,
                uploadedAt: new Date(),
            });

            return { insertedId: result.insertedId };
        } catch (error) {
            console.error('MongoRepository --> uploadFileMetaData --> Error', error);
            throw error;
        }
    }
}

export default MongoRepository;
