import { DocumentService } from "../application/documentService";
import { FolderService } from "../application/folderService";
import { PermissionService } from "../application/permissionService";
import { StorageResolver } from "../application/storageResolver";
import { TenantService } from "../application/tenantService";
import { MysqlAuditLogger } from "../infrastructure/database/mysql/MysqlAuditLogger";
import { MysqlDocumentRepository } from "../infrastructure/database/mysql/MysqlDocumentRepository";
import { MysqlFolderRepository } from "../infrastructure/database/mysql/MysqlFolderRepository";
import { MysqlPermissionRepository } from "../infrastructure/database/mysql/MysqlPermissionRepository";
import { MysqlTenantRepository } from "../infrastructure/database/mysql/MysqlTenantRepository";
import { registerStorageProviders } from "../infrastructure/storage/bootstrap";

registerStorageProviders();

const documents = new MysqlDocumentRepository();
const folders = new MysqlFolderRepository();
const tenants = new MysqlTenantRepository();
const permissions = new MysqlPermissionRepository();
const audit = new MysqlAuditLogger();
const resolver = new StorageResolver();

export const container = {
  resolver,
  documentService: new DocumentService(documents, folders, tenants, permissions, audit, resolver),
  folderService: new FolderService(folders),
  tenantService: new TenantService(tenants, resolver),
  permissionService: new PermissionService(documents, permissions),
};
