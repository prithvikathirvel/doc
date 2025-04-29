import Dao from "../dao/dao";
import MinioRepository from "../dao/minio/MinioRepository.js";
import LocalRepository from "../dao/nativeFile/LocalRepository.js";
import MySQLRepository from "../dao/mysql/MysqlRepository.js";


export class FileSystem {
    private fileRepository: MinioRepository;
    private mysqlRepository : MySQLRepository | undefined;
    MinioRepository: MinioRepository | undefined;
    constructor(storageType: 'minio' | 'local' | 'mysql') {
        // if (storageType === 'minio') {
            this.fileRepository = new MinioRepository();
        // } 
            // optional if you plan mysql as storageType too
            this.mysqlRepository = new MySQLRepository();
        // }
    }

    async uploadFile(filePath: string, userName: string, directory = "", metadata: any) {
        return this.fileRepository.uploadFile(filePath,userName, directory,metadata);
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
    async getUserDirectoryTree(userName: string) {
        return this.fileRepository.getUserDirectoryTree(userName);
    }
    async listAllUserFilesAndDirectories(userName: string, filters: any, sortBy: any, sortOrder: any) {
        return this.fileRepository.listAllUserFilesAndDirectories(userName,filters,sortBy,sortOrder);
    }
    async renameObject(userName: string, oldPath: string, newPath: string){
        return this.MinioRepository?.renameFile(userName, oldPath, newPath);
    } 
    async softDeleteDocument(documentId:any){
        console.log('hit here');
        return this.mysqlRepository?.softDeleteDocument(documentId);
    }
    async restoreDocument(documentId:any){
        console.log('hit here');
        return this.mysqlRepository?.restoreDocument(documentId);
    }
    
}