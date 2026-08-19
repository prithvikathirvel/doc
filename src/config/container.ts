import { DocumentService } from "../service/documentService";
import { FolderService } from "../service/folderService";
import { PermissionService } from "../service/permissionService";
import { StorageResolver } from "../service/storageResolver";
import { TenantService } from "../service/tenantService";
import { MysqlAnalyticsRepository } from "../dao/mysql/MysqlAnalyticsRepository";
import { MysqlAuditLogger } from "../dao/mysql/MysqlAuditLogger";
import { MysqlDocumentRepository } from "../dao/mysql/MysqlDocumentRepository";
import { MysqlFolderRepository } from "../dao/mysql/MysqlFolderRepository";
import { MysqlPermissionRepository } from "../dao/mysql/MysqlPermissionRepository";
import { MysqlTenantRepository } from "../dao/mysql/MysqlTenantRepository";
import { registerStorageProviders } from "../dao/bootstrap";

registerStorageProviders();

const documents = new MysqlDocumentRepository();
const folders = new MysqlFolderRepository();
const tenants = new MysqlTenantRepository();
const permissions = new MysqlPermissionRepository();
const audit = new MysqlAuditLogger();
const analytics = new MysqlAnalyticsRepository();
const resolver = new StorageResolver();

export const container = {
  resolver,
  documentService: new DocumentService(documents, folders, tenants, permissions, audit, resolver),
  folderService: new FolderService(folders),
  tenantService: new TenantService(tenants, resolver, analytics),
  permissionService: new PermissionService(documents, permissions),
};
