import Dao from "../dao/dao";
import MinioRepository from "../dao/minio/MinioRepository.js";
import LocalRepository from "../dao/nativeFile/LocalRepository.js"

export class FileSystem {
    private fileRepository: MinioRepository | LocalRepository;
    constructor(storageType: 'minio' | 'local') {
        this.fileRepository = storageType === 'minio'
            ? new MinioRepository()
            : new LocalRepository();
    }

    async uploadFile(filePath: string, userName: string, directory = "") {
        return this.fileRepository.uploadFile(filePath,userName, directory);
    }

    async downloadFile(userDirectory:string ,remotePath: string) {
        return this.fileRepository.downloadFile(userDirectory,remotePath);
    }

    async deleteFile(directory: string, fileName: string) {
        return this.fileRepository.deleteFile(directory, fileName);
    }

    async deleteDirectory(directory: string) {
        return this.fileRepository.deleteDirectory(directory);
    }
}