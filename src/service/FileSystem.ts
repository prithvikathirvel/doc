import Dao from "../dao/dao";
import MinioRepository from "../dao/minio/MinioRepository";
import LocalRepository from "../dao/nativeFile/LocalRepository";
import MySQLRepository from "../dao/mysql/MysqlRepository";


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

    async uploadFile(filePath: string, userId: string, directory = "", metadata: any, userName: string) {
        return this.fileRepository.uploadFile(filePath,userId, userName, directory,metadata);
    }

    async downloadFile(userDirectory:string ,remotePath: string) {
        return this.fileRepository.downloadFile(userDirectory,remotePath);
    }

    async reUploadFile(filePath: string, userName: string, directory = "", documentDetails: any) {
        return this.fileRepository.reuploadFile(filePath,userName, directory, documentDetails);
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

    async getDocumentForAssetId(documentId:any){
        return this.mysqlRepository?.getDocumentForAssetId(documentId);
    } 
    
    async getDocumentDetails(documentId:any){
        return this.mysqlRepository?.getDocumentDetails(documentId);
    } 
}